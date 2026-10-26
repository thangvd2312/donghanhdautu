import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { TipCheck as TipRow } from '@prisma/client';
import type {
  OkResponse,
  TechnicalIndicators,
  TipAssetType,
  TipCandidate,
  TipCheck,
  TipClaims,
  TipConversation,
  TipDataPoint,
  TipDirection,
  TipListPage,
  TipPersonal,
  TipPlanDraft,
  TipReport,
} from '@dautu/contracts';
import { AdvisorToolData } from '../advisor/tool-data';
import { VerifierService } from '../advisor/verifier.service';
import type { Evidence } from '../advisor/verifier.service';
import { AiQuotaError, AiUsageService } from '../ai/ai-usage.service';
import { aliasMentions } from '../alerts/aliases';
import { LlmService } from '../alerts/llm.service';
import { unmatchedNumbers } from '../alerts/number-check';
import { PriceAlertsService } from '../alerts/price-alerts.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { MarketService } from '../market/market.service';
import { TrackedSymbolResolver } from '../market/tracked-symbol.resolver';
import { vnDateKey } from '../market/types';
import { searchCryptoNews } from '../news/crypto-news';
import { CryptoNewsService } from '../news/crypto-news.service';
import { PlanAssetsService } from '../plans/plan-assets.service';
import { PortfolioService } from '../portfolio/portfolio.service';
import { PrismaService } from '../prisma/prisma.service';
import { WatchlistService } from '../watchlist/watchlist.service';
import type { TipAnalyzeDto, TipCreateDto, TipDecisionDto, TipListQuery } from './dto/tip.dto';
import { findCandidates } from './tip-extract';
import {
  buildPlanDraft,
  DEFAULT_DROP_PCT,
  hotLevel,
  hotScore,
  missingFromClaims,
  normalizeTipPrice,
  personalImpact,
  TIP_DAILY_LIMIT,
  billionSectionsInVnd,
  withoutPeriodCounts,
} from './tips.logic';
import { tipDisplayName, tipSummaryMarkdown, toTipCheck, toTipListItem } from './tips.presenter';
import { CHECK_PROMPT, CHECK_SCHEMA, EXTRACT_PROMPT, EXTRACT_SCHEMA } from './tips.prompt';

const DAY = 86_400_000;
/** Tin tức dùng để đối chiếu: 14 ngày gần nhất */
const NEWS_DAYS = 14;
/** Mua thật trong bao nhiêu ngày sau khi soi thì tính là "đã mua theo" */
const BOUGHT_WINDOW_DAYS = 7;

interface Extracted {
  assetType: TipAssetType | 'none';
  symbol: string;
  direction: TipDirection;
  targetPrice: number | null;
  stopPrice: number | null;
  horizonDays: number | null;
  reasons: string[];
  promises: string[];
  citesSource: boolean;
}

interface CheckOutput {
  dataSays: TipDataPoint[];
  unverifiable: string[];
  verdict: string;
  questions: string[];
}

/** Hướng của lời khuyên khi không có AI: đoán theo từ khoá */
function ruleDirection(text: string): TipDirection {
  const t = text.toLowerCase();
  if (/(^|[^\p{L}])(mua|gom|múc|vào hàng|vào lệnh|long|buy)([^\p{L}]|$)/u.test(t)) return 'buy';
  if (/(^|[^\p{L}])(bán|chốt lời|thoát hàng|short|sell)([^\p{L}]|$)/u.test(t)) return 'sell';
  return 'unknown';
}

/** Soi lời khuyên: bóc tách → phân tích (mức nóng, với riêng bạn, AI đọc dữ liệu) → quyết định; không ghi sổ giao dịch */
@Injectable()
export class TipsService {
  private log = new Logger(TipsService.name);

  constructor(
    private prisma: PrismaService,
    private market: MarketService,
    private symbols: TrackedSymbolResolver,
    private assets: PlanAssetsService,
    private portfolio: PortfolioService,
    private llm: LlmService,
    private aiUsage: AiUsageService,
    private toolData: AdvisorToolData,
    private verifier: VerifierService,
    private cryptoNews: CryptoNewsService,
    private watchlist: WatchlistService,
    private priceAlerts: PriceAlertsService,
    private analytics: AnalyticsService,
  ) {}

  // ---------- Bước 1: bóc tách ----------

  async create(userId: string, dto: TipCreateDto): Promise<TipCheck> {
    const today = new Date(`${vnDateKey()}T00:00:00+07:00`);
    const used = await this.prisma.tipCheck.count({ where: { userId, createdAt: { gte: today } } });
    if (used >= TIP_DAILY_LIMIT) {
      throw new HttpException(
        `Bạn đã soi ${TIP_DAILY_LIMIT} lời khuyên hôm nay. Lượt mới có lại từ 0 giờ đêm nay.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const text = dto.text.trim();
    const rules = findCandidates(text, {
      stocks: await this.market.stockSymbols(),
      isCoin: (b) => this.market.binance.quotes.has(`${b}USDT`),
      aliases: aliasMentions(text),
    });

    const ai = this.llm.enabled
      ? await this.llm.json<Extracted>({
          tier: 'fast',
          feature: 'tip_extract',
          userId,
          system: EXTRACT_PROMPT,
          user: JSON.stringify({ text, candidates: rules.map((c) => tipDisplayName(c.assetType, c.symbol)) }),
          schema: EXTRACT_SCHEMA,
          maxTokens: 1500,
        })
      : null;

    // Mã người dùng chọn > mã AI nhận ra (kiểm tồn tại) > mã đầu tiên tìm bằng quy tắc
    let chosen: { assetType: TipAssetType; symbol: string } | null = null;
    if (dto.symbol) chosen = await this.resolveChoice(dto.symbol, dto.assetType);
    if (!chosen && ai && ai.assetType !== 'none' && ai.symbol) {
      chosen = await this.resolveChoice(ai.symbol, ai.assetType).catch(() => null);
    }
    if (!chosen && rules.length)
      chosen = await this.resolveChoice(rules[0].symbol, rules[0].assetType).catch(() => null);
    if (!chosen) {
      throw new UnprocessableEntityException('Không nhận ra mã cổ phiếu hay coin nào trong tin. Hãy chọn mã cần soi.');
    }

    const candidates: TipCandidate[] = [chosen, ...rules]
      .filter((c, i, all) => all.findIndex((x) => x.assetType === c.assetType && x.symbol === c.symbol) === i)
      .slice(0, 8)
      .map((c) => ({ ...c, displayName: tipDisplayName(c.assetType, c.symbol) }));
    const sameAsset =
      ai &&
      ai.symbol &&
      tipDisplayName(chosen.assetType, chosen.symbol) === ai.symbol.toUpperCase().replace(/USDT$/, '');
    const claims: TipClaims = {
      direction: ai?.direction ?? ruleDirection(text),
      targetPrice: sameAsset ? normalizeTipPrice(chosen.assetType, ai.targetPrice) : null,
      stopPrice: sameAsset ? normalizeTipPrice(chosen.assetType, ai.stopPrice) : null,
      horizonDays: ai?.horizonDays && ai.horizonDays > 0 ? Math.min(ai.horizonDays, 3650) : null,
      reasons: (ai?.reasons ?? []).filter((r) => r.trim()).slice(0, 8),
      promises: (ai?.promises ?? []).filter((r) => r.trim()).slice(0, 5),
      citesSource: ai?.citesSource ?? false,
      candidates,
      extractedBy: ai ? 'ai' : 'rules',
    };

    const row = await this.prisma.tipCheck.create({
      data: {
        userId,
        text,
        sourceName: dto.sourceName || null,
        sourceKind: dto.sourceKind ?? null,
        assetType: chosen.assetType,
        symbol: chosen.symbol,
        claims: claims as unknown as Prisma.InputJsonValue,
      },
    });
    return this.present(row);
  }

  /** Chuẩn hoá mã người dùng / AI đưa ra; không nêu loại thì thử cổ phiếu trước, rồi coin */
  private async resolveChoice(raw: string, assetType?: TipAssetType) {
    const s = raw.trim().toUpperCase().replace(/^\$/, '');
    if (!s) return null;
    const types: TipAssetType[] = assetType
      ? [assetType]
      : /^[A-Z]{3}$/.test(s)
        ? ['stock', 'crypto']
        : ['crypto', 'stock'];
    let last: unknown = null;
    for (const t of types) {
      try {
        const symbol = await this.symbols.resolve(t, t === 'crypto' ? s.replace(/\/?USDT$/, '') : s, {
          lenientQuote: true,
        });
        return { assetType: t, symbol };
      } catch (e) {
        last = e;
      }
    }
    throw last instanceof HttpException ? last : new NotFoundException(`Không tìm thấy mã ${s}`);
  }

  // ---------- Bước 2: phân tích ----------

  async analyze(userId: string, id: string, dto: TipAnalyzeDto): Promise<TipCheck> {
    let tip = await this.own(userId, id);
    const report = tip.report as unknown as TipReport | null;
    const done = tip.status === 'analyzed' && report && (report.ai === 'ok' || report.ai === 'off');

    if (dto.symbol) {
      const next = await this.resolveChoice(dto.symbol, dto.assetType);
      if (next && (next.symbol !== tip.symbol || next.assetType !== tip.assetType)) {
        if (tip.status === 'analyzed') {
          throw new BadRequestException(
            `Phiếu này đã soi ${tipDisplayName(tip.assetType, tip.symbol)}. Muốn soi mã khác, hãy soi lại tin.`,
          );
        }
        tip = await this.prisma.tipCheck.update({
          where: { id },
          // Mục tiêu / cắt lỗ bóc tách cho mã cũ không áp cho mã mới
          data: {
            assetType: next.assetType,
            symbol: next.symbol,
            claims: { ...(tip.claims as object), targetPrice: null, stopPrice: null },
          },
        });
      }
    }
    if (done) {
      if (dto.amountVnd !== undefined) return this.setAmount(userId, id, dto.amountVnd);
      return this.present(tip);
    }

    const assetType = tip.assetType as TipAssetType;
    const claims = tip.claims as unknown as TipClaims;
    const price = this.assets.priceNative(assetType, tip.symbol);
    const [data, news] = await Promise.all([this.marketData(assetType, tip.symbol), this.news(assetType, tip.symbol)]);
    const technicals = data?.technicals ?? null;
    const priceAtCheck = tip.priceAtCheck ?? price.value;
    const { score, parts } = hotScore({ assetType, technicals, text: tip.text, claims, price: priceAtCheck });
    const amountVnd = dto.amountVnd ?? tip.amountVnd;
    const personal = await this.personal(userId, assetType, tip.symbol, priceAtCheck, amountVnd, claims);
    const benchmark = this.benchmark(assetType);

    const base: TipReport = {
      ai: 'off',
      aiMessage: null,
      dataSays: [],
      missing: missingFromClaims(claims).map((m) => m.text),
      unverifiable: [],
      verdict: null,
      questions: [],
      news: news.map((n) => ({ title: n.title, url: n.url, publishedAt: n.publishedAt })),
      droppedPoints: 0,
      facts: this.facts(assetType, priceAtCheck, technicals, data),
    };
    const evidence = {
      tip: { text: tip.text, sourceName: tip.sourceName, claims },
      market: data,
      news,
      hotScore: { score, parts },
      personal,
      priceAtCheck,
    };
    const full = this.llm.enabled ? await this.read(userId, tip, evidence, base) : base;

    const saved = await this.prisma.tipCheck.update({
      where: { id },
      data: {
        status: 'analyzed',
        amountVnd: amountVnd ?? null,
        priceAtCheck,
        priceSource: price.source,
        benchmark: benchmark?.name ?? null,
        benchmarkAtCheck: tip.benchmarkAtCheck ?? benchmark?.value ?? null,
        score,
        scoreParts: parts as unknown as Prisma.InputJsonValue,
        personal: personal as unknown as Prisma.InputJsonValue,
        report: full as unknown as Prisma.InputJsonValue,
      },
    });
    void this.analytics.track('tip_checked', {
      userId,
      props: { assetType, hotLevel: hotLevel(score), ai: full.ai },
      dedupeKey: `tip_checked:${id}`,
    });
    return this.present(saved);
  }

  /** AI đọc dữ liệu; số không khớp dữ liệu và câu bộ kiểm tra báo sai bị bỏ. Lỗi / hết lượt vẫn trả phiếu không có AI */
  private async read(
    userId: string,
    tip: TipRow,
    evidence: Record<string, unknown>,
    base: TipReport,
  ): Promise<TipReport> {
    let out: CheckOutput | null;
    try {
      out = await this.aiUsage.run(userId, 'tip_check', () =>
        this.llm.json<CheckOutput>({
          tier: 'brief',
          feature: 'tip_check',
          userId,
          system: CHECK_PROMPT,
          user: JSON.stringify(evidence),
          schema: CHECK_SCHEMA,
          effort: 'medium',
          maxTokens: 4000,
        }),
      );
    } catch (e) {
      if (e instanceof AiQuotaError) return { ...base, ai: 'quota', aiMessage: e.message };
      throw e;
    }
    if (!out)
      return { ...base, ai: 'failed', aiMessage: 'Cố vấn chưa đọc được dữ liệu lúc này, bạn có thể soi lại sau.' };

    // Lớp 1 (không tốn AI): mỗi số trong ý phải có trong dữ liệu
    let dropped = 0;
    const checkData = { evidence, statementsVnd: billionSectionsInVnd(evidence.market) };
    let points = (out.dataSays ?? []).filter((p) => {
      const bad = unmatchedNumbers(withoutPeriodCounts(p.point), checkData);
      if (bad.length) {
        dropped++;
        this.log.warn(`Soi lời khuyên ${tip.id}: bỏ ý có số không khớp dữ liệu (${bad.join(', ')})`);
      }
      return !bad.length;
    });
    let verdict = out.verdict?.trim() || null;

    // Lớp 2: bộ kiểm tra đối chiếu phần còn lại với chính dữ liệu đã dùng
    const answer = [...points.map((p) => p.point), verdict ?? ''].join('\n');
    const ev: Evidence[] = [
      {
        id: 'market',
        tool: tip.assetType === 'crypto' ? 'get_crypto_analysis' : 'get_stock_analysis',
        input: { symbol: tip.symbol },
        content: JSON.stringify(evidence.market),
      },
      { id: 'news', tool: 'get_news', input: { query: tip.symbol }, content: JSON.stringify(evidence.news) },
      {
        id: 'tip',
        tool: 'tip_context',
        input: {},
        content: JSON.stringify({
          tip: evidence.tip,
          hotScore: evidence.hotScore,
          personal: evidence.personal,
          priceAtCheck: evidence.priceAtCheck,
        }),
      },
    ];
    const v = await this.verifier.verify(answer, ev, userId).catch(() => null);
    for (const issue of v?.status === 'issues' ? v.issues : []) {
      const q = issue.quote.trim().toLowerCase();
      const before = points.length;
      points = points.filter((p) => !p.point.toLowerCase().includes(q));
      dropped += before - points.length;
      if (verdict?.toLowerCase().includes(q)) verdict = null;
    }

    return {
      ...base,
      ai: 'ok',
      dataSays: points.slice(0, 6),
      unverifiable: (out.unverifiable ?? []).slice(0, 5),
      verdict,
      questions: (out.questions ?? []).slice(0, 3),
      droppedPoints: dropped,
    };
  }

  private async marketData(assetType: TipAssetType, symbol: string): Promise<Record<string, unknown> | null> {
    try {
      if (assetType === 'stock') return await this.toolData.stock(symbol);
      return { source: 'Binance (giá, nến ngày)', ...(await this.market.cryptoDetail(symbol)) };
    } catch (e) {
      this.log.warn(`Soi lời khuyên: không lấy được dữ liệu ${symbol}: ${(e as Error).message}`);
      return null;
    }
  }

  private async news(assetType: TipAssetType, symbol: string) {
    const since = new Date(Date.now() - NEWS_DAYS * DAY);
    try {
      if (assetType === 'stock') {
        const rows = await this.prisma.newsTag.findMany({
          where: { tickers: { has: symbol }, publishedAt: { gte: since } },
          orderBy: { publishedAt: 'desc' },
          take: 10,
        });
        return rows.map((r) => ({
          title: r.title,
          url: r.url,
          publishedAt: r.publishedAt.toISOString(),
          impact: r.impact,
        }));
      }
      const items = searchCryptoNews(await this.cryptoNews.all(), symbol.replace(/USDT$/, ''), 20);
      return items
        .filter((n) => new Date(n.publishedAt) >= since)
        .slice(0, 10)
        .map((n) => ({ title: n.title, url: n.url, publishedAt: n.publishedAt, impact: null, source: n.source }));
    } catch {
      return [];
    }
  }

  private benchmark(assetType: TipAssetType) {
    if (assetType === 'crypto') {
      const btc = this.market.binance.quotes.get('BTCUSDT')?.price;
      return btc ? { name: 'BTC', value: btc } : null;
    }
    const vni = this.market.snapshot().indices.find((i) => i.symbol === 'VNINDEX')?.price;
    return vni ? { name: 'VNINDEX', value: vni } : null;
  }

  /** Chỉ số thô hiển thị nhanh trên phiếu (có cả khi AI tắt) */
  private facts(
    assetType: TipAssetType,
    price: number | null,
    t: Partial<TechnicalIndicators> | null,
    data: Record<string, unknown> | null,
  ): TipReport['facts'] {
    const src = assetType === 'crypto' ? 'Binance' : 'Vietcap';
    const n = (v: number, d = 2) => v.toLocaleString('vi-VN', { maximumFractionDigits: d });
    const out: TipReport['facts'] = [];
    if (price !== null)
      out.push({ label: 'Giá lúc soi', value: `${n(price)} ${assetType === 'crypto' ? 'USDT' : '₫'}`, source: src });
    const r = t?.returnPct ?? {};
    if (r['1w'] !== null && r['1w'] !== undefined) out.push({ label: '1 tuần', value: `${n(r['1w'])}%`, source: src });
    if (r['1m'] !== null && r['1m'] !== undefined) out.push({ label: '1 tháng', value: `${n(r['1m'])}%`, source: src });
    if (t?.fromHigh52wPct !== null && t?.fromHigh52wPct !== undefined)
      out.push({ label: 'So với đỉnh 52 tuần', value: `${n(t.fromHigh52wPct)}%`, source: src });
    if (t?.rsi14 !== null && t?.rsi14 !== undefined) out.push({ label: 'RSI14', value: n(t.rsi14, 1), source: src });
    if (t?.lastVolumeVsAvg20 !== null && t?.lastVolumeVsAvg20 !== undefined)
      out.push({ label: 'Khối lượng / TB 20 phiên', value: `${n(t.lastVolumeVsAvg20, 1)} lần`, source: src });
    const pe = (data?.valuationHistory as { pe?: { currentPercentile?: number } } | null | undefined)?.pe
      ?.currentPercentile;
    if (pe !== undefined && pe !== null)
      out.push({ label: 'P/E so với 8 năm của chính nó', value: `cao hơn ${n(pe, 0)}% số quý`, source: 'Vietcap' });
    const analyst = (
      data?.company as { analystView?: { rating: string; targetPrice: number } | null } | null | undefined
    )?.analystView;
    if (analyst)
      out.push({
        label: 'Vietcap Research',
        value: `${analyst.rating}, mục tiêu ${n(analyst.targetPrice, 0)} ₫`,
        source: 'Vietcap Research',
      });
    return out;
  }

  private async personal(
    userId: string,
    assetType: TipAssetType,
    symbol: string,
    price: number | null,
    amountVnd: number | null,
    claims: TipClaims,
  ): Promise<TipPersonal> {
    const [valuation, profile, plan] = await Promise.all([
      this.portfolio.valuation(userId),
      this.prisma.investorProfile.findUnique({ where: { userId }, select: { riskType: true, maxDrawdownPct: true } }),
      this.prisma.investmentPlan.findFirst({
        where: { userId, assetType, symbol, status: 'active' },
        select: { id: true, nextReviewAt: true, targetPrice: true, stopPrice: true },
      }),
    ]);
    const today = vnDateKey();
    return personalImpact({
      assetType,
      symbol,
      price,
      usdtVnd: this.market.usdtVnd.rate,
      valuation,
      profile,
      amountVnd,
      claims,
      plan: plan
        ? {
            id: plan.id,
            nextReviewAt: plan.nextReviewAt.toISOString().slice(0, 10),
            targetPrice: plan.targetPrice,
            stopPrice: plan.stopPrice,
            due: plan.nextReviewAt.toISOString().slice(0, 10) <= today,
          }
        : null,
    });
  }

  /** Đổi số tiền giả định: chỉ tính lại "với riêng bạn", không gọi AI */
  async setAmount(userId: string, id: string, amountVnd: number | null): Promise<TipCheck> {
    const tip = await this.own(userId, id);
    if (tip.status !== 'analyzed') throw new BadRequestException('Phiếu chưa soi xong');
    const personal = await this.personal(
      userId,
      tip.assetType as TipAssetType,
      tip.symbol,
      tip.priceAtCheck,
      amountVnd,
      tip.claims as unknown as TipClaims,
    );
    const saved = await this.prisma.tipCheck.update({
      where: { id },
      data: { amountVnd, personal: personal as unknown as Prisma.InputJsonValue },
    });
    return this.present(saved);
  }

  // ---------- Quyết định ----------

  async decide(userId: string, id: string, dto: TipDecisionDto): Promise<TipCheck> {
    const tip = await this.own(userId, id);
    if (tip.status !== 'analyzed') throw new BadRequestException('Hãy soi xong rồi mới chọn');
    const assetType = tip.assetType as TipAssetType;
    let planId = tip.planId;

    if (dto.decision === 'watch') {
      await this.watchlist.add(userId, { assetType, symbol: tip.symbol });
      await this.ensureDropAlert(userId, tip, dto.dropPct ?? DEFAULT_DROP_PCT);
    }
    if (dto.decision === 'plan') {
      if (!dto.planId) throw new BadRequestException('Thiếu kế hoạch vừa lưu');
      const plan = await this.prisma.investmentPlan.findFirst({
        where: { id: dto.planId, userId, assetType, symbol: tip.symbol },
        select: { id: true },
      });
      if (!plan) throw new NotFoundException('Không tìm thấy kế hoạch cho mã này');
      planId = plan.id;
    }

    const saved = await this.prisma.tipCheck.update({
      where: { id },
      data: { decision: dto.decision, decidedAt: new Date(), planId },
    });
    void this.analytics.track('tip_decided', { userId, props: { decision: dto.decision } });
    return this.present(saved);
  }

  /**
   * Cảnh báo khi giá giảm `dropPct`% so với giá lúc soi (giá hiện tại đã thấp hơn thì tính từ giá hiện tại).
   * Giữ chỗ bằng cập nhật có điều kiện nên bấm "Theo dõi" nhiều lần / cùng lúc chỉ tạo một cảnh báo.
   */
  private async ensureDropAlert(userId: string, tip: TipRow, dropPct: number) {
    if (tip.priceAlertId) {
      const exists = await this.prisma.priceAlert.findFirst({ where: { id: tip.priceAlertId, userId } });
      if (exists) return;
      await this.prisma.tipCheck.updateMany({
        where: { id: tip.id, priceAlertId: tip.priceAlertId },
        data: { priceAlertId: null },
      });
    }
    const claimed = await this.prisma.tipCheck.updateMany({
      where: { id: tip.id, priceAlertId: null },
      data: { priceAlertId: 'pending' },
    });
    if (!claimed.count) return;
    const current = this.assets.priceNative(tip.assetType, tip.symbol).value;
    const ref = Math.min(...[tip.priceAtCheck, current].filter((v): v is number => v !== null && v > 0));
    let alertId: string | null = null;
    if (Number.isFinite(ref)) {
      const raw = ref * (1 - dropPct / 100);
      const targetPrice = tip.assetType === 'stock' ? Math.round(raw / 10) * 10 : Number(raw.toPrecision(6));
      const alert = await this.priceAlerts
        .create(userId, {
          assetType: tip.assetType as TipAssetType,
          symbol: tip.symbol,
          direction: 'below',
          targetPrice,
          note: `Soi lời khuyên${tip.sourceName ? ` (${tip.sourceName})` : ''}: giảm ${dropPct}% so với lúc soi`.slice(
            0,
            200,
          ),
        })
        .catch((e: Error) => {
          this.log.warn(`Soi lời khuyên ${tip.id}: không tạo được cảnh báo giá: ${e.message}`);
          return null;
        });
      alertId = alert?.id ?? null;
    }
    await this.prisma.tipCheck.update({ where: { id: tip.id }, data: { priceAlertId: alertId } });
  }

  async planDraft(userId: string, id: string): Promise<TipPlanDraft> {
    const tip = await this.own(userId, id);
    return buildPlanDraft({
      assetType: tip.assetType as TipAssetType,
      symbol: tip.symbol,
      sourceName: tip.sourceName,
      text: tip.text,
      claims: tip.claims as unknown as TipClaims,
    });
  }

  /** Cuộc trò chuyện "Hỏi tiếp cố vấn" mở đầu bằng tin gốc + tóm tắt phiếu; gọi lại trả cuộc trò chuyện cũ */
  async conversation(userId: string, id: string): Promise<TipConversation> {
    return this.prisma.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`tip:${id}`}))`;
      const tip = await db.tipCheck.findFirst({ where: { id, userId } });
      if (!tip) throw new NotFoundException('Không tìm thấy phiếu soi');
      if (tip.conversationId) {
        const c = await db.conversation.findFirst({ where: { id: tip.conversationId, userId }, select: { id: true } });
        if (c) return { conversationId: c.id };
      }
      if (tip.status !== 'analyzed') throw new BadRequestException('Hãy soi xong rồi mới hỏi tiếp cố vấn');
      const view = await this.present(tip);
      const c = await db.conversation.create({
        data: {
          userId,
          title: `Soi lời khuyên ${view.displayName}`,
          messages: {
            create: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: `Tôi nhận được lời khuyên này${tip.sourceName ? ` từ ${tip.sourceName}` : ''} và vừa soi bằng app:\n\n"""${tip.text}"""`,
                  },
                ],
              },
              { role: 'assistant', content: [{ type: 'text', text: tipSummaryMarkdown(view) }] },
            ],
          },
        },
      });
      await db.tipCheck.update({ where: { id }, data: { conversationId: c.id } });
      return { conversationId: c.id };
    });
  }

  // ---------- Đọc / xoá ----------

  async list(userId: string, q: TipListQuery): Promise<TipListPage> {
    const limit = q.limit ?? 20;
    const rows = await this.prisma.tipCheck.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const page = await this.detectBought(userId, rows.slice(0, limit));
    return {
      items: page.map((r) => toTipListItem(r, this.assets.priceNative(r.assetType, r.symbol).value)),
      nextCursor: rows.length > limit ? page[page.length - 1].id : null,
    };
  }

  async get(userId: string, id: string): Promise<TipCheck> {
    const [tip] = await this.detectBought(userId, [await this.own(userId, id)]);
    return this.present(tip);
  }

  async remove(userId: string, id: string): Promise<OkResponse> {
    const { count } = await this.prisma.tipCheck.deleteMany({ where: { id, userId } });
    if (!count) throw new NotFoundException('Không tìm thấy phiếu soi');
    return { ok: true };
  }

  /**
   * "Đã mua theo": sổ có lệnh mua đúng mã trong 7 ngày sau khi soi (kể cả khi trước đó chọn bỏ qua). Không hỏi, không
   * chặn — chỉ ghi lại để sau này nhìn lại. Chỉ xét phiếu chưa có dấu và còn trong khoảng 60 ngày gần đây.
   */
  private async detectBought(userId: string, rows: TipRow[]): Promise<TipRow[]> {
    const open = rows.filter((r) => !r.boughtAt && r.createdAt.getTime() > Date.now() - 60 * DAY);
    if (!open.length) return rows;
    const since = new Date(Math.min(...open.map((r) => r.createdAt.getTime())));
    const buys = await this.prisma.transaction.findMany({
      where: {
        userId,
        type: 'buy',
        deletedAt: null,
        createdAt: { gte: since },
        symbol: { in: [...new Set(open.map((r) => r.symbol))] },
      },
      select: { assetType: true, symbol: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const updated = new Map<string, TipRow>();
    for (const r of open) {
      const end = r.createdAt.getTime() + BOUGHT_WINDOW_DAYS * DAY;
      const hit = buys.find(
        (b) =>
          b.assetType === r.assetType &&
          b.symbol === r.symbol &&
          b.createdAt >= r.createdAt &&
          b.createdAt.getTime() <= end,
      );
      if (hit) {
        await this.prisma.tipCheck.updateMany({
          where: { id: r.id, boughtAt: null },
          data: { boughtAt: hit.createdAt },
        });
        updated.set(r.id, { ...r, boughtAt: hit.createdAt });
      }
    }
    return rows.map((r) => updated.get(r.id) ?? r);
  }

  private async own(userId: string, id: string) {
    const tip = await this.prisma.tipCheck.findFirst({ where: { id, userId } });
    if (!tip) throw new NotFoundException('Không tìm thấy phiếu soi');
    return tip;
  }

  private present(row: TipRow): Promise<TipCheck> {
    return Promise.resolve(toTipCheck(row, this.assets.priceNative(row.assetType, row.symbol)));
  }
}
