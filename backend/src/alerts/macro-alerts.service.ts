import { Injectable, Logger } from '@nestjs/common';
import type { NewsTag } from '@prisma/client';
import { MacroService } from '../macro/macro.service';
import { MarketService } from '../market/market.service';
import { vnDateKey } from '../market/types';
import { AlertAudience } from './alert-audience.service';
import { FX_THRESHOLD, MACRO_DAILY_CAP, macroDedupeKey, moveBucket } from './alert-rules';
import { NotifierService } from './notifier.service';
import { PersonalAlertService } from './personal-alert.service';

/**
 * Cảnh báo vĩ mô cho người đã bật `macroAlerts`: tỷ giá USD / USDT biến động mạnh trong ngày, tin vĩ mô / địa chính
 * trị quan trọng (tối đa 3 tin/ngày), và đổi lãi suất điều hành / Fed (luôn báo, không tính vào giới hạn).
 */
@Injectable()
export class MacroAlerts {
  private log = new Logger(MacroAlerts.name);
  /** Tỷ giá đầu ngày (theo giờ VN) để đo biến động trong ngày */
  private fxBaseline: { day: string; usd: number | null; usdt: number | null } | null = null;

  constructor(
    private market: MarketService,
    private audience: AlertAudience,
    private notifier: NotifierService,
    private personal: PersonalAlertService,
    macro: MacroService,
  ) {
    // Lãi suất điều hành / Fed đổi là sự kiện lớn: báo mọi người bật cảnh báo vĩ mô, không tính vào giới hạn 3 tin/ngày
    macro.changes$.subscribe((c) => {
      if (!c.policy) return;
      void this.policyChange(c).catch((e: Error) => this.log.error(e));
    });
  }

  private async policyChange(c: {
    fact: {
      key: string;
      label: string;
      value: string;
      asOf: string;
      document: string | null;
      sourceName: string;
      sourceUrl: string;
    };
    previousValue: string;
  }) {
    const f = c.fact;
    for (const user of await this.audience.wantingMacro()) {
      await this.personal.fire(user, {
        kind: 'macro',
        dedupeKey: `policy:${f.key}:${f.value}:${f.asOf}`,
        severity: 'critical',
        event: `${f.label} thay đổi: ${c.previousValue} → ${f.value} (áp dụng ${f.asOf}${f.document ? `, ${f.document}` : ''})`,
        details: { ...f, previousValue: c.previousValue },
        sources: [{ title: `${f.sourceName} — ${f.label}`, url: f.sourceUrl }],
      });
    }
  }

  async checkFx() {
    const day = vnDateKey();
    const usd = this.market.snapshot().fx.find((f) => f.code === 'USD')?.transfer ?? null;
    const usdt = this.market.snapshot().usdt?.mid ?? null;
    if (!this.fxBaseline || this.fxBaseline.day !== day) {
      this.fxBaseline = { day, usd, usdt };
      return;
    }
    const moves: { code: 'USD' | 'USDT'; from: number; to: number; source: string }[] = [];
    if (this.fxBaseline.usd && usd)
      moves.push({ code: 'USD', from: this.fxBaseline.usd, to: usd, source: 'Vietcombank' });
    if (this.fxBaseline.usdt && usdt)
      moves.push({ code: 'USDT', from: this.fxBaseline.usdt, to: usdt, source: 'Binance P2P' });
    for (const m of moves) {
      const pct = ((m.to - m.from) / m.from) * 100;
      const thr = FX_THRESHOLD[m.code];
      if (Math.abs(pct) < thr) continue;
      const bucket = moveBucket(pct, thr);
      for (const user of await this.audience.wantingMacro()) {
        const dedupeKey = `fx:${m.code}:${day}:${bucket}`;
        if (await this.notifier.exists(user.id, dedupeKey)) continue;
        await this.personal.fire(user, {
          kind: 'macro',
          dedupeKey,
          severity: 'warning',
          event: `Tỷ giá ${m.code}/VND ${pct > 0 ? 'tăng' : 'giảm'} ${Math.abs(pct).toFixed(2)}% trong ngày (${Math.round(m.from)} → ${Math.round(m.to)})`,
          details: { pair: `${m.code}/VND`, from: m.from, to: m.to, changePct: pct, source: m.source },
        });
      }
    }
  }

  async checkNews(tags: NewsTag[]) {
    const since = Date.now() - 12 * 3600_000;
    const important = tags
      .filter((t) => t.macroScore >= 4 && t.publishedAt.getTime() > since)
      .sort((a, b) => b.macroScore - a.macroScore || b.publishedAt.getTime() - a.publishedAt.getTime());
    if (!important.length) return;
    const day = vnDateKey();
    const dayStart = new Date(`${day}T00:00:00+07:00`);
    for (const user of await this.audience.wantingMacro()) {
      let sent = await this.notifier.countSince(user.id, 'macro', dayStart);
      for (const t of important) {
        if (sent >= MACRO_DAILY_CAP) break;
        // Nhiều bài cùng viết về một sự kiện: mỗi chủ đề chỉ báo một lần/ngày, trừ tin mức 5 (sự kiện lớn)
        const dedupeKey = macroDedupeKey(t, day);
        if (await this.notifier.exists(user.id, dedupeKey)) continue;
        const ok = await this.personal.fire(user, {
          kind: 'macro',
          dedupeKey,
          severity: t.macroScore >= 5 ? 'warning' : 'info',
          event: `Tin vĩ mô / quốc tế quan trọng (${t.topic ?? 'khác'}, mức ${t.macroScore}/5): ${t.title}`,
          details: { headline: t.title, impact: t.impact, topic: t.topic },
          sources: [{ title: t.title, url: t.url }],
        });
        if (ok) sent++;
      }
    }
  }
}
