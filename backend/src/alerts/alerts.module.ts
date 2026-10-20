import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Holding, InvestorProfile } from '@prisma/client';
import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ALERT_SYSTEM_PROMPT } from '../advisor/prompt';
import { CurrentUser, JwtAuthGuard } from '../auth/auth.module';
import type { AuthUser } from '../auth/auth.module';
import { MacroModule, MacroService } from '../macro/macro.module';
import { MarketModule } from '../market/market.module';
import { MarketService, normalizeCrypto } from '../market/market.service';
import type { AssetType } from '../market/market.service';
import { vnDateKey } from '../market/types';
import { NewsModule, NewsService } from '../news/news.module';
import { PortfolioModule, PortfolioService } from '../portfolio/portfolio.module';
import { PrismaService } from '../prisma/prisma.module';
import { RISK_TYPE_LABEL } from '../profile/quiz';
import { BriefsService } from './briefs.service';
import type { BriefKind } from './briefs.service';
import { LlmService } from './llm.service';
import { NewsTaggerService } from './news-tagger.service';
import { NotifierService } from './notifier.service';
import type { NotificationInput } from './notifier.service';

interface AlertDraft {
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
}

const ALERT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    body: { type: 'string' },
    severity: { type: 'string', enum: ['info', 'warning', 'critical'] },
  },
  required: ['title', 'body', 'severity'],
  additionalProperties: false,
};

/** Tối đa số tin vĩ mô gửi cho mỗi người mỗi ngày, tránh spam */
const MACRO_DAILY_CAP = 3;
/** Ngưỡng biến động tỷ giá trong ngày để cảnh báo */
const FX_THRESHOLD = { USD: 0.5, USDT: 1 };

type UserWithData = { id: string; profile: InvestorProfile | null; holdings: Holding[] };

/**
 * Quét định kỳ và bắn thông báo cá nhân hoá:
 *  - giá tài sản đang nắm giữ biến động vượt ngưỡng (cổ phiếu, coin, vàng)
 *  - giá chạm mốc người dùng tự đặt
 *  - tin tức về doanh nghiệp đang nắm giữ (AI nhận ra cả khi bài chỉ ghi tên công ty)
 *  - tin vĩ mô / địa chính trị quan trọng, tỷ giá USD / USDT biến động mạnh
 */
@Injectable()
export class AlertsService {
  private log = new Logger(AlertsService.name);
  private running = { price: false, news: false };
  /** Tỷ giá đầu ngày (theo giờ VN) để đo biến động trong ngày */
  private fxBaseline: { day: string; usd: number | null; usdt: number | null } | null = null;

  constructor(
    private prisma: PrismaService,
    private market: MarketService,
    private news: NewsService,
    private portfolio: PortfolioService,
    private tagger: NewsTaggerService,
    private notifier: NotifierService,
    private llm: LlmService,
    macro: MacroService,
  ) {
    // Lãi suất điều hành / Fed đổi là sự kiện lớn: báo mọi người bật cảnh báo vĩ mô, không tính vào giới hạn 3 tin/ngày
    macro.changes$.subscribe((c) => {
      if (!c.policy) return;
      void this.policyChange(c).catch((e: Error) => this.log.error(e));
    });
  }

  private async policyChange(c: { fact: { key: string; label: string; value: string; asOf: string; document: string | null; sourceName: string; sourceUrl: string }; previousValue: string }) {
    const f = c.fact;
    for (const user of await this.macroUsers()) {
      await this.firePersonal(user, {
        kind: 'macro',
        dedupeKey: `policy:${f.key}:${f.value}:${f.asOf}`,
        severity: 'critical',
        event: `${f.label} thay đổi: ${c.previousValue} → ${f.value} (áp dụng ${f.asOf}${f.document ? `, ${f.document}` : ''})`,
        details: { ...f, previousValue: c.previousValue },
        sources: [{ title: `${f.sourceName} — ${f.label}`, url: f.sourceUrl }],
      });
    }
  }

  private usersWithHoldings(): Promise<UserWithData[]> {
    return this.prisma.user.findMany({
      where: { holdings: { some: {} } },
      select: { id: true, profile: true, holdings: true },
    });
  }

  /** Coin và vàng có biên độ tự nhiên khác cổ phiếu nên ngưỡng được điều chỉnh */
  private threshold(type: AssetType, base: number) {
    if (type === 'crypto') return base * 2;
    if (type === 'gold') return Math.max(1, base / 2);
    return base;
  }

  @Interval(60_000)
  async checkPrices() {
    if (this.running.price) return;
    this.running.price = true;
    try {
      await this.checkHoldingMoves();
      await this.checkPriceTargets();
      await this.checkFx();
    } catch (e) {
      this.log.error(e);
    } finally {
      this.running.price = false;
    }
  }

  private async checkHoldingMoves() {
    const today = vnDateKey();
    for (const user of await this.usersWithHoldings()) {
      const base = user.profile?.alertThresholdPct ?? 3;
      for (const h of user.holdings) {
        const type = h.assetType as AssetType;
        if (type === 'cash') continue;
        if (type === 'stock' && !this.market.stockSessionOpen) continue;
        const chg = this.market.dayChangePct(type, h.symbol);
        const thr = this.threshold(type, base);
        if (chg === null || Math.abs(chg) < thr) continue;
        // Mỗi lần biến động vượt thêm một bậc ngưỡng mới báo tiếp, tránh spam
        const bucket = Math.sign(chg) * Math.floor(Math.abs(chg) / thr);
        const dedupeKey = `price:${type}:${h.symbol}:${today}:${bucket}`;
        if (await this.notifier.exists(user.id, dedupeKey)) continue;
        await this.firePersonal(user, {
          kind: 'price_move',
          dedupeKey,
          severity: Math.abs(chg) >= thr * 2 ? 'critical' : 'warning',
          event: `${h.symbol.replace(/USDT$/, '')} ${chg > 0 ? 'tăng' : 'giảm'} ${Math.abs(chg).toFixed(2)}% ${type === 'crypto' ? 'trong 24 giờ' : 'trong ngày'}`,
          details: this.priceContext(type, h.symbol),
        });
      }
    }
  }

  /** Giá theo đơn vị gốc dùng cho mốc tự đặt: VND/cp, USDT/coin, VND/lượng (giá bán ra) */
  currentPrice(type: string, symbol: string): number | null {
    if (type === 'stock') return this.market.stocksFor([symbol])[0]?.price ?? null;
    if (type === 'crypto') return this.market.binance.quotes.get(symbol)?.price ?? null;
    if (type === 'gold') return this.market.goldQuotes().find((g) => g.code === symbol)?.sell ?? null;
    return null;
  }

  private async checkPriceTargets() {
    const alerts = await this.prisma.priceAlert.findMany({ where: { active: true } });
    for (const a of alerts) {
      if (a.assetType === 'stock' && !this.market.stockSessionOpen) continue;
      const price = this.currentPrice(a.assetType, a.symbol);
      if (price === null) continue;
      const hit = a.direction === 'above' ? price >= a.targetPrice : price <= a.targetPrice;
      if (!hit) continue;
      await this.prisma.priceAlert.update({ where: { id: a.id }, data: { active: false, triggeredAt: new Date() } });
      const name = a.assetType === 'crypto' ? a.symbol.replace(/USDT$/, '') : a.symbol;
      const unit = a.assetType === 'crypto' ? 'USDT' : '₫';
      const fmt = (v: number) => `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(v)} ${unit}`;
      await this.notifier.send(a.userId, {
        kind: 'price_target',
        severity: 'warning',
        title: `${name} đã ${a.direction === 'above' ? 'lên tới' : 'về'} ${fmt(price)} — chạm mốc bạn đặt`,
        body: `Mốc của bạn: ${a.direction === 'above' ? '≥' : '≤'} ${fmt(a.targetPrice)}.${a.note ? ` Ghi chú: ${a.note}.` : ''} Trước khi hành động, hãy xem lại lý do bạn đặt mốc này hoặc hỏi cố vấn.`,
        dedupeKey: `target:${a.id}`,
        link:
          a.assetType === 'stock' ? `/stock/${a.symbol}` : a.assetType === 'crypto' ? `/crypto/${name}` : '/',
      });
    }
  }

  private async checkFx() {
    const day = vnDateKey();
    const usd = this.market.snapshot().fx.find((f) => f.code === 'USD')?.transfer ?? null;
    const usdt = this.market.snapshot().usdt?.mid ?? null;
    if (!this.fxBaseline || this.fxBaseline.day !== day) {
      this.fxBaseline = { day, usd, usdt };
      return;
    }
    const moves: { code: 'USD' | 'USDT'; from: number; to: number; source: string }[] = [];
    if (this.fxBaseline.usd && usd) moves.push({ code: 'USD', from: this.fxBaseline.usd, to: usd, source: 'Vietcombank' });
    if (this.fxBaseline.usdt && usdt) moves.push({ code: 'USDT', from: this.fxBaseline.usdt, to: usdt, source: 'Binance P2P' });
    for (const m of moves) {
      const pct = ((m.to - m.from) / m.from) * 100;
      const thr = FX_THRESHOLD[m.code];
      if (Math.abs(pct) < thr) continue;
      const bucket = Math.sign(pct) * Math.floor(Math.abs(pct) / thr);
      for (const user of await this.macroUsers()) {
        const dedupeKey = `fx:${m.code}:${day}:${bucket}`;
        if (await this.notifier.exists(user.id, dedupeKey)) continue;
        await this.firePersonal(user, {
          kind: 'macro',
          dedupeKey,
          severity: 'warning',
          event: `Tỷ giá ${m.code}/VND ${pct > 0 ? 'tăng' : 'giảm'} ${Math.abs(pct).toFixed(2)}% trong ngày (${Math.round(m.from)} → ${Math.round(m.to)})`,
          details: { pair: `${m.code}/VND`, from: m.from, to: m.to, changePct: pct, source: m.source },
        });
      }
    }
  }

  @Interval(10 * 60_000)
  async checkNews() {
    if (this.running.news) return;
    this.running.news = true;
    try {
      const tags = await this.tagger.tagRecent(24);
      await this.holdingNews(tags);
      await this.macroNews(tags);
    } catch (e) {
      this.log.error(e);
    } finally {
      this.running.news = false;
    }
  }

  private async holdingNews(tags: Awaited<ReturnType<NewsTaggerService['tagRecent']>>) {
    const since = Date.now() - 6 * 3600_000;
    const items = (await this.news.all()).filter((n) => Date.parse(n.publishedAt) > since);
    const tagByUrl = new Map(tags.map((t) => [t.url, t]));
    for (const user of await this.usersWithHoldings()) {
      const tickers = [...new Set(user.holdings.filter((h) => h.assetType === 'stock').map((h) => h.symbol))];
      for (const item of items) {
        const hit = tickers.filter((t) => this.tagger.relatesTo(tagByUrl.get(item.url), item, t));
        if (!hit.length) continue;
        const dedupeKey = `news:${item.url}`;
        if (await this.notifier.exists(user.id, dedupeKey)) continue;
        await this.firePersonal(user, {
          kind: 'news',
          dedupeKey,
          severity: 'info',
          event: `Tin mới liên quan đến ${hit.join(', ')} mà bạn đang nắm giữ`,
          details: {
            headline: item.title,
            summary: item.summary,
            impact: tagByUrl.get(item.url)?.impact,
            source: item.source,
            publishedAt: item.publishedAt,
          },
          sources: [{ title: item.title, url: item.url }],
        });
      }
    }
  }

  private macroUsers(): Promise<UserWithData[]> {
    return this.prisma.user.findMany({
      where: { profile: { macroAlerts: true } },
      select: { id: true, profile: true, holdings: true },
    });
  }

  private async macroNews(tags: Awaited<ReturnType<NewsTaggerService['tagRecent']>>) {
    const since = Date.now() - 12 * 3600_000;
    const important = tags
      .filter((t) => t.macroScore >= 4 && t.publishedAt.getTime() > since)
      .sort((a, b) => b.macroScore - a.macroScore || b.publishedAt.getTime() - a.publishedAt.getTime());
    if (!important.length) return;
    const day = vnDateKey();
    const dayStart = new Date(`${day}T00:00:00+07:00`);
    for (const user of await this.macroUsers()) {
      let sent = await this.notifier.countSince(user.id, 'macro', dayStart);
      for (const t of important) {
        if (sent >= MACRO_DAILY_CAP) break;
        // Nhiều bài cùng viết về một sự kiện: mỗi chủ đề chỉ báo một lần/ngày, trừ tin mức 5 (sự kiện lớn)
        const dedupeKey = t.macroScore >= 5 ? `macro:${t.url}` : `macro:${day}:${t.topic ?? 'khac'}`;
        if (await this.notifier.exists(user.id, dedupeKey)) continue;
        const ok = await this.firePersonal(user, {
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

  private priceContext(type: AssetType, symbol: string) {
    if (type === 'stock') {
      const [q] = this.market.stocksFor([symbol]);
      return (
        q && {
          price: q.price,
          ref: q.ref,
          ceiling: q.ceiling,
          floor: q.floor,
          volume: q.volume,
          foreignNetVol: q.foreignBuyVol - q.foreignSellVol,
          source: 'Vietcap',
        }
      );
    }
    if (type === 'crypto') return { ...this.market.binance.quotes.get(symbol), source: 'Binance' };
    return { ...this.market.goldQuotes().find((g) => g.code === symbol), source: 'vang.today' };
  }

  /** Nhờ AI viết lời nhắn hợp với hồ sơ & danh mục người đó; AI lỗi thì dùng câu chữ mẫu */
  private async firePersonal(
    user: UserWithData,
    e: {
      kind: NotificationInput['kind'];
      dedupeKey: string;
      severity: AlertDraft['severity'];
      event: string;
      details: unknown;
      sources?: { title: string; url: string }[];
    },
  ) {
    const valuation = await this.portfolio.valuation(user.id);
    const p = user.profile;
    const draft = await this.llm.json<AlertDraft>({
      tier: 'fast',
      system: ALERT_SYSTEM_PROMPT,
      user: JSON.stringify({
        event: e.event,
        details: e.details,
        investor: p
          ? {
              type: RISK_TYPE_LABEL[p.riskType],
              goal: p.goal,
              horizon: p.horizon,
              maxDrawdownPct: p.maxDrawdownPct,
              fomoProne: p.fomoProne,
            }
          : 'chưa khảo sát',
        portfolio: valuation.holdings.map((h) => ({
          name: h.displayName,
          type: h.typeLabel,
          weightPct: Math.round(h.weightPct * 10) / 10,
          pnlPct: h.pnlPct === null ? null : Math.round(h.pnlPct * 10) / 10,
          // Tính sẵn để AI không tự so sánh số (đã thấy cả model mạnh nói "tiệm cận" khi đã vượt)
          exceedsYourMaxLoss: p && h.pnlPct !== null ? h.pnlPct <= -p.maxDrawdownPct : null,
        })),
      }),
      schema: ALERT_SCHEMA,
    });
    return this.notifier.send(user.id, {
      kind: e.kind,
      dedupeKey: e.dedupeKey,
      sources: e.sources,
      ...(draft ?? {
        title: e.event.slice(0, 160),
        body: 'Mở trang cố vấn để xem phân tích chi tiết về sự kiện này đối với danh mục của bạn.',
        severity: e.severity,
      }),
    });
  }
}

class PriceAlertDto {
  @IsIn(['stock', 'crypto', 'gold']) assetType!: 'stock' | 'crypto' | 'gold';
  @IsString() symbol!: string;
  @IsIn(['above', 'below']) direction!: 'above' | 'below';
  @IsNumber() @Min(0) targetPrice!: number;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('alerts')
class AlertsController {
  constructor(
    private prisma: PrismaService,
    private market: MarketService,
    private alerts: AlertsService,
    private briefs: BriefsService,
  ) {}

  @Get('price')
  async list(@CurrentUser() user: AuthUser) {
    const rows = await this.prisma.priceAlert.findMany({
      where: { userId: user.id, OR: [{ active: true }, { triggeredAt: { gt: new Date(Date.now() - 7 * 86400_000) } }] },
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((r) => ({ ...r, currentPrice: this.alerts.currentPrice(r.assetType, r.symbol) }));
  }

  @Post('price')
  async create(@CurrentUser() user: AuthUser, @Body() dto: PriceAlertDto) {
    let symbol = dto.symbol.trim().toUpperCase();
    if (dto.assetType === 'stock') {
      symbol = (await this.market.assertStock(symbol)).symbol;
      await this.market.stockQuote(symbol); // đưa mã vào danh sách theo dõi giá
    }
    if (dto.assetType === 'crypto') {
      symbol = normalizeCrypto(symbol);
      if (!this.market.binance.quotes.has(symbol)) throw new NotFoundException(`Không có cặp ${symbol} trên Binance`);
    }
    if (dto.assetType === 'gold' && !this.market.goldQuotes().some((g) => g.code === symbol)) {
      throw new NotFoundException(`Không có loại vàng ${symbol}`);
    }
    const current = this.alerts.currentPrice(dto.assetType, symbol);
    if (current !== null && (dto.direction === 'above' ? current >= dto.targetPrice : current <= dto.targetPrice)) {
      throw new BadRequestException('Giá hiện tại đã thoả điều kiện này rồi — hãy đặt một mốc chưa chạm tới');
    }
    return this.prisma.priceAlert.create({ data: { ...dto, symbol, userId: user.id } });
  }

  @Delete('price/:id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.prisma.priceAlert.deleteMany({ where: { id, userId: user.id } });
    return { ok: true };
  }

  /** Gửi thử bản tin ngay cho chính mình */
  @Post('brief/:kind')
  async briefNow(@CurrentUser() user: AuthUser, @Param('kind') kind: string) {
    if (kind !== 'morning' && kind !== 'closing') throw new BadRequestException('kind phải là morning hoặc closing');
    const n = await this.briefs.generate(user.id, kind as BriefKind, true);
    if (!n) throw new BadRequestException('Không tạo được bản tin');
    return n;
  }
}

@UseGuards(JwtAuthGuard)
@Controller('notifications')
class NotificationsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.notification.count({ where: { userId: user.id, read: false } }),
    ]);
    return { items, unread };
  }

  @Post('read-all')
  async readAll(@CurrentUser() user: AuthUser) {
    await this.prisma.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } });
    return { ok: true };
  }

  @Post(':id/read')
  async read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId: user.id }, data: { read: true } });
    return { ok: true };
  }
}

@Module({
  imports: [MarketModule, NewsModule, PortfolioModule, MacroModule],
  controllers: [NotificationsController, AlertsController],
  providers: [AlertsService, BriefsService, LlmService, NewsTaggerService, NotifierService],
  exports: [LlmService, NotifierService],
})
export class AlertsModule {}
