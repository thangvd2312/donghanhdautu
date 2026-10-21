import { Injectable, Logger } from '@nestjs/common';
import { NotifierService } from '../alerts/notifier.service';
import { vnDateKey } from '../market/types';
import { VietcapEventsAdapter } from '../market/providers/vietcap';
import type { MarketEvents } from '../market/providers/vietcap';
import { PrismaService } from '../prisma/prisma.module';
import {
  buildCalendar,
  DEFAULT_REMINDER_SETTINGS,
  fetchWindow,
  reminderAnchor,
  reminderDedupeKey,
  reminderDue,
  reminderMessage,
} from './calendar';
import type { CalendarEvent, EventRange, ReminderSettings } from './calendar';

export interface EventsResponse {
  items: Omit<CalendarEvent, 'sourceId'>[];
  symbols: { symbol: string; held: boolean; watched: boolean }[];
  reminders: ReminderSettings;
  source: 'Vietcap';
  fetchedAt: string;
  unavailable: boolean;
}

export interface ReminderPatch {
  enabled?: boolean;
  daysBefore?: 1 | 3;
  mutedSymbols?: string[];
}

interface UserSymbols {
  holdings: Map<string, number>;
  watched: Set<string>;
}

/** Bỏ trường nội bộ (id nguồn) trước khi trả ra API */
function toPublic(e: CalendarEvent): EventsResponse['items'][number] {
  const copy: Partial<CalendarEvent> = { ...e };
  delete copy.sourceId;
  return copy as EventsResponse['items'][number];
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
        if (!anchor || settings.mutedSymbols.includes(e.symbol) || !reminderDue(anchor, today, settings.daysBefore))
          continue;
        const msg = reminderMessage(e, anchor);
        const created = await this.notifier.send(row.userId, {
          kind: 'event',
          severity: 'info',
          dedupeKey: reminderDedupeKey(e, anchor),
          sources: [{ title: 'Vietcap — lịch sự kiện quyền', url: 'https://trading.vietcap.com.vn/' }],
          ...msg,
        });
        if (created) sent++;
      }
    }
    return sent;
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

  /** Cổ phiếu đang giữ (cộng số lượng mọi danh mục, > 0) và đang theo dõi, theo từng người dùng */
  private async userSymbols(userIds: string[]): Promise<Map<string, UserSymbols>> {
    const [holdings, watch] = await Promise.all([
      this.prisma.holding.findMany({
        where: { userId: { in: userIds }, assetType: 'stock' },
        select: { userId: true, symbol: true, quantity: true },
      }),
      this.prisma.watchItem.findMany({
        where: { userId: { in: userIds }, assetType: 'stock' },
        select: { userId: true, symbol: true },
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
    return out;
  }
}
