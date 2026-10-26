import { Injectable, Logger } from '@nestjs/common';
import type { CalendarEvent as PublicEvent, EventsResponse, ReminderSettingsPatch } from '@dautu/contracts';
import { NotifierService } from '../alerts/notifier.service';
import { vnDateKey } from '../market/types';
import { VietcapEventsAdapter } from '../market/providers/vietcap';
import type { MarketEvents } from '../market/providers/vietcap';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildCalendar,
  DEFAULT_REMINDER_SETTINGS,
  fetchWindow,
  reminderAnchor,
  reminderDedupeKey,
  reminderDue,
  reminderKeyPrefix,
  reminderMessage,
} from './calendar';
import type { CalendarEvent, EventRange, ReminderSettings } from './calendar';

type ReminderPatch = ReminderSettingsPatch;

interface UserSymbols {
  holdings: Map<string, number>;
  watched: Set<string>;
  /** Số cổ phiếu được hưởng quyền theo sổ; không có sổ thì không đặt (dùng số đang giữ) */
  entitledAt?: (symbol: string, exDate: string) => number;
}

/** Bỏ trường nội bộ (id nguồn) trước khi trả ra API */
function toPublic(e: CalendarEvent): PublicEvent {
  const copy: Partial<CalendarEvent> = { ...e };
  delete copy.sourceId;
  return copy as PublicEvent;
}

@Injectable()
export class EventsService {
  private log = new Logger(EventsService.name);

  constructor(
    private prisma: PrismaService,
    private vietcap: VietcapEventsAdapter,
    private notifier: NotifierService,
  ) {}

  async list(userId: string, range: EventRange, today = vnDateKey()): Promise<EventsResponse> {
    const [symbols, reminders, source] = await Promise.all([
      this.userSymbols([userId]),
      this.settings(userId),
      this.fetchEvents(today),
    ]);
    const mine: UserSymbols = symbols.get(userId) ?? {
      holdings: new Map<string, number>(),
      watched: new Set<string>(),
    };
    const items = source
      ? buildCalendar({ events: source.events, ...mine, today, range, settings: reminders }).map(toPublic)
      : [];
    const all = new Set([...mine.holdings.keys(), ...mine.watched]);
    return {
      items,
      symbols: [...all].sort().map((symbol) => ({
        symbol,
        held: mine.holdings.has(symbol),
        watched: mine.watched.has(symbol),
      })),
      reminders,
      source: 'Vietcap',
      fetchedAt: source?.fetchedAt ?? new Date().toISOString(),
      unavailable: !source,
    };
  }

  async settings(userId: string): Promise<ReminderSettings> {
    const row = await this.prisma.eventReminderSetting.findUnique({ where: { userId } });
    return row ? this.toSettings(row) : { ...DEFAULT_REMINDER_SETTINGS };
  }

  async updateSettings(userId: string, patch: ReminderPatch): Promise<ReminderSettings> {
    const data = {
      ...(patch.enabled !== undefined && { enabled: patch.enabled }),
      ...(patch.daysBefore !== undefined && { daysBefore: patch.daysBefore }),
      ...(patch.mutedSymbols !== undefined && {
        mutedSymbols: [...new Set(patch.mutedSymbols.map((s) => s.trim().toUpperCase()).filter(Boolean))].sort(),
      }),
    };
    const row = await this.prisma.eventReminderSetting.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return this.toSettings(row);
  }

  /** 08:00 và 17:00 hằng ngày giờ VN (worker/scheduled-jobs.ts): lượt chiều bắt sự kiện công bố muộn trong ngày; dedupeKey chống nhắc trùng */
  async remindDaily() {
    try {
      await this.runReminders();
    } catch (e) {
      this.log.error(e);
    }
  }

  /** Gửi nhắc cho người đã bật. Trả số thông báo mới tạo (chạy lại cùng ngày không tạo thêm) */
  async runReminders(today = vnDateKey()): Promise<number> {
    const enabled = await this.prisma.eventReminderSetting.findMany({ where: { enabled: true } });
    if (!enabled.length) return 0;
    const source = await this.fetchEvents(today);
    if (!source) return 0;
    const symbols = await this.userSymbols(enabled.map((s) => s.userId));
    let sent = 0;
    for (const row of enabled) {
      const settings = this.toSettings(row);
      const mine = symbols.get(row.userId);
      if (!mine) continue;
      const items = buildCalendar({ events: source.events, ...mine, today, range: 'week', settings });
      for (const e of items) {
        const anchor = reminderAnchor(e);
        if (!anchor || settings.mutedSymbols.includes(e.symbol) || !reminderDue(e, anchor, today, settings.daysBefore))
          continue;
        const dedupeKey = reminderDedupeKey(e, anchor);
        // Nguồn đổi ngày: lần nhắc theo ngày cũ được thu hồi, lần nhắc mới nói rõ đã đổi ngày
        const prefix = reminderKeyPrefix(e);
        const stale = await this.prisma.notification.findMany({
          where: { userId: row.userId, dedupeKey: { startsWith: prefix, not: dedupeKey } },
          select: { id: true, dedupeKey: true },
          orderBy: { createdAt: 'asc' },
        });
        const msg = reminderMessage(
          e,
          anchor,
          stale.length ? stale[stale.length - 1].dedupeKey.slice(prefix.length) : null,
        );
        const created = await this.notifier.send(row.userId, {
          kind: 'event',
          severity: 'info',
          dedupeKey,
          sources: [{ title: 'Vietcap — lịch sự kiện quyền', url: 'https://trading.vietcap.com.vn/' }],
          ...msg,
        });
        if (created) {
          sent++;
          if (stale.length) await this.retract(stale.map((n) => n.id));
        }
      }
    }
    return sent;
  }

  /** Lần nhắc theo ngày đã bị nguồn thay đổi: đánh dấu đã đọc và không gửi ra kênh ngoài nếu còn đang chờ */
  private async retract(ids: string[]) {
    await this.prisma.$transaction([
      this.prisma.notification.updateMany({ where: { id: { in: ids } }, data: { read: true } }),
      this.prisma.telegramDelivery.updateMany({
        where: { notificationId: { in: ids }, status: 'pending' },
        data: { status: 'skipped', lastError: 'Sự kiện đổi ngày' },
      }),
      this.prisma.pushDelivery.updateMany({
        where: { notificationId: { in: ids }, status: 'pending' },
        data: { status: 'skipped', lastError: 'Sự kiện đổi ngày' },
      }),
    ]);
  }

  /** null khi nguồn lỗi: trang vẫn hiển thị được với `unavailable` */
  private async fetchEvents(today: string): Promise<MarketEvents | null> {
    const { from, to } = fetchWindow(today);
    try {
      return await this.vietcap.marketEvents(from, to);
    } catch (e) {
      this.log.warn(`Không lấy được lịch sự kiện: ${(e as Error).message}`);
      return null;
    }
  }

  private toSettings(row: { enabled: boolean; daysBefore: number; mutedSymbols: string[] }): ReminderSettings {
    return { enabled: row.enabled, daysBefore: row.daysBefore === 3 ? 3 : 1, mutedSymbols: row.mutedSymbols };
  }

  /**
   * Cổ phiếu đang giữ (cộng số lượng mọi danh mục, > 0), đang theo dõi, và số được hưởng quyền theo sổ giao dịch:
   * mua / bán / nhận thêm có ngày trước GDKHQ. Số dư đầu kỳ không biết ngày mua thật nên luôn tính là được hưởng.
   */
  private async userSymbols(userIds: string[]): Promise<Map<string, UserSymbols>> {
    const [holdings, watch, txs] = await Promise.all([
      this.prisma.holding.findMany({
        where: { userId: { in: userIds }, assetType: 'stock' },
        select: { userId: true, symbol: true, quantity: true },
      }),
      this.prisma.watchItem.findMany({
        where: { userId: { in: userIds }, assetType: 'stock' },
        select: { userId: true, symbol: true },
      }),
      this.prisma.transaction.findMany({
        where: {
          userId: { in: userIds },
          deletedAt: null,
          assetType: 'stock',
          type: { in: ['buy', 'sell', 'opening', 'bonus'] },
        },
        select: { userId: true, symbol: true, type: true, quantity: true, date: true },
      }),
    ]);
    const out = new Map<string, UserSymbols>();
    const of = (id: string) => {
      let u = out.get(id);
      if (!u) out.set(id, (u = { holdings: new Map(), watched: new Set() }));
      return u;
    };
    for (const h of holdings) {
      const u = of(h.userId);
      const symbol = h.symbol.toUpperCase();
      u.holdings.set(symbol, (u.holdings.get(symbol) ?? 0) + h.quantity);
    }
    for (const u of out.values()) for (const [s, q] of u.holdings) if (q <= 0) u.holdings.delete(s);
    for (const w of watch) of(w.userId).watched.add(w.symbol.toUpperCase());
    const byUser = new Map<string, typeof txs>();
    for (const t of txs) byUser.set(t.userId, [...(byUser.get(t.userId) ?? []), t]);
    for (const [id, list] of byUser) {
      of(id).entitledAt = (symbol, exDate) =>
        list
          .filter(
            (t) =>
              t.symbol?.toUpperCase() === symbol &&
              (t.type === 'opening' || t.date.toISOString().slice(0, 10) < exDate),
          )
          .reduce((q, t) => q + (t.type === 'sell' ? -1 : 1) * (t.quantity?.toNumber() ?? 0), 0);
    }
    return out;
  }
}
