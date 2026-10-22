import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Logger,
  Module,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Prisma } from '@prisma/client';
import type { PortfolioAlertRule as RuleRow } from '@prisma/client';
import type {
  GroupTargets,
  PortfolioAlertCheck,
  PortfolioAlertKind,
  PortfolioAlertPreview,
  PortfolioAlertPreviewRequest,
  PortfolioAlertRule,
  PortfolioAlertRuleRequest,
  PortfolioAlertSettings,
  TargetSuggestion,
} from '@dautu/contracts';
import { AlertsModule } from '../alerts/alerts.module';
import { NotifierService } from '../alerts/notifier.service';
import { CurrentUser, JwtAuthGuard } from '../auth/auth.module';
import type { AuthUser } from '../auth/auth.module';
import { MarketModule } from '../market/market.module';
import { MarketService } from '../market/market.service';
import { vnDateKey } from '../market/types';
import { HistoryService } from '../portfolio/history.service';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { PortfolioService } from '../portfolio/portfolio.service';
import { PrismaService } from '../prisma/prisma.module';
import { REFERENCE_ALLOCATION, RISK_TYPE_LABEL } from '../profile/quiz';
import { parseCheck, toConfig } from './rule-row';
import {
  ALERT_KINDS,
  DEDUPE_PREFIX,
  dedupeKey,
  defaultRule,
  evaluate,
  Evaluation,
  LIMITS,
  MAX_WINDOW_DAYS,
  normalizeTargets,
  notificationFor,
  notifyDecision,
  RuleConfig,
  validateRule,
  validateTargets,
} from './rules';

/** Xem trước gọi liên tục khi người dùng sửa ngưỡng: lịch sử (cần giá nhiều ngày) giữ lại một lúc */
const PREVIEW_HISTORY_TTL_MS = 5 * 60_000;

class RuleDto implements PortfolioAlertRuleRequest {
  @IsBoolean() enabled!: boolean;
  @IsNumber() thresholdPct!: number;
  @IsOptional() @IsInt() windowDays?: number | null;
  @IsOptional() @IsObject() targets?: GroupTargets | null;
  @IsInt() cooldownDays!: number;
}

class PreviewRuleDto extends RuleDto {
  @IsIn(ALERT_KINDS) kind!: PortfolioAlertKind;
}

class PreviewDto implements PortfolioAlertPreviewRequest {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ALERT_KINDS.length)
  @ValidateNested({ each: true })
  @Type(() => PreviewRuleDto)
  rules?: PreviewRuleDto[];
}

const checkOf = (e: Evaluation, at: Date): PortfolioAlertCheck => ({
  at: at.toISOString(),
  status: e.status,
  title: e.headline,
  reason: e.reason,
});

/** Mức tham khảo theo kiểu nhà đầu tư (profile/quiz) → 4 nhóm; "dự phòng khác" tính vào tiền mặt */
export function referenceTargets(riskType: string): GroupTargets | null {
  const ref = REFERENCE_ALLOCATION[riskType];
  if (!ref) return null;
  const t: GroupTargets = { stock: 0, crypto: 0, gold: 0, cash: 0 };
  for (const [k, v] of Object.entries(ref)) {
    if (k.startsWith('cổ phiếu')) t.stock += v;
    else if (k === 'crypto') t.crypto += v;
    else if (k === 'vàng') t.gold += v;
    else t.cash += v;
  }
  return validateTargets(t) ? null : t;
}

/**
 * Cảnh báo theo tình trạng danh mục: cài đặt, xem trước (không gửi gì) và lượt kiểm tra của worker
 * (worker/scheduled-jobs.ts). Đánh giá trên toàn bộ tài sản của người dùng (gộp mọi danh mục, như trang Hôm nay).
 */
@Injectable()
export class PortfolioAlertsService {
  private log = new Logger(PortfolioAlertsService.name);
  private previewHistory = new Map<string, { at: number; data: { today: string; points: HistoryPointList } }>();

  constructor(
    private prisma: PrismaService,
    private market: MarketService,
    private portfolio: PortfolioService,
    private history: HistoryService,
    private notifier: NotifierService,
  ) {}

  /** Cấu hình cả ba loại (chưa lưu thì là mặc định đang tắt) + dòng DB nếu có */
  async configs(userId: string) {
    const rows = await this.prisma.portfolioAlertRule.findMany({ where: { userId } });
    return ALERT_KINDS.map((kind) => {
      const row = rows.find((r) => r.kind === kind) ?? null;
      return { kind, row, config: toConfig(kind, row) };
    });
  }

  /** Lần gần nhất đã gửi thông báo cho quy tắc này (nguồn sự thật: bảng Notification, không lưu riêng) */
  async lastNotifiedAt(userId: string, kind: PortfolioAlertKind) {
    const n = await this.prisma.notification.findFirst({
      where: { userId, kind: 'portfolio_health', dedupeKey: { startsWith: `${DEDUPE_PREFIX}${kind}:` } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return n?.createdAt ?? null;
  }

  async settings(userId: string): Promise<PortfolioAlertSettings> {
    const [list, profile, goals] = await Promise.all([
      this.configs(userId),
      this.prisma.investorProfile.findUnique({ where: { userId }, select: { riskType: true } }),
      this.prisma.goal.findMany({
        where: { userId, status: 'active', targetAllocation: { not: Prisma.DbNull } },
        select: { name: true, targetAllocation: true },
        orderBy: { targetDate: 'asc' },
        take: 5,
      }),
    ]);
    const rules = await Promise.all(
      list.map(async ({ kind, row, config }) => this.present(config, row, await this.lastNotifiedAt(userId, kind))),
    );
    const suggestions: TargetSuggestion[] = [];
    const ref = profile ? referenceTargets(profile.riskType) : null;
    if (profile && ref) {
      suggestions.push({
        source: 'profile',
        label: `Tham khảo cho kiểu ${RISK_TYPE_LABEL[profile.riskType] ?? profile.riskType}`,
        targets: ref,
      });
    }
    for (const g of goals) {
      const t = g.targetAllocation as Partial<GroupTargets>;
      if (validateTargets(t)) continue;
      suggestions.push({ source: 'goal', label: `Theo mục tiêu "${g.name}"`, targets: normalizeTargets(t) });
    }
    return { rules, limits: LIMITS, suggestions };
  }

  /** Dựng từng trường (không lộ id / userId) */
  private present(c: RuleConfig, row: RuleRow | null, lastNotifiedAt: Date | null): PortfolioAlertRule {
    return {
      kind: c.kind,
      enabled: c.enabled,
      thresholdPct: c.thresholdPct,
      windowDays: c.windowDays,
      targets: c.targets,
      cooldownDays: c.cooldownDays,
      lastNotifiedAt: lastNotifiedAt?.toISOString() ?? null,
      lastCheck: row ? parseCheck(row.lastCheck) : null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }

  private configFrom(kind: PortfolioAlertKind, dto: PortfolioAlertRuleRequest): RuleConfig {
    return {
      kind,
      enabled: dto.enabled,
      thresholdPct: dto.thresholdPct,
      windowDays: kind === 'drawdown' ? (dto.windowDays ?? defaultRule(kind).windowDays) : null,
      targets: kind === 'drift' && dto.targets ? dto.targets : null,
      cooldownDays: dto.cooldownDays,
    };
  }

  async save(userId: string, kind: string, dto: PortfolioAlertRuleRequest): Promise<PortfolioAlertRule> {
    if (!ALERT_KINDS.includes(kind as PortfolioAlertKind)) throw new BadRequestException('Loại cảnh báo không hợp lệ');
    const k = kind as PortfolioAlertKind;
    const c = this.configFrom(k, dto);
    const errors = validateRule(c);
    if (errors.length) throw new BadRequestException(errors);
    const targets = c.targets ? normalizeTargets(c.targets) : null;
    const data = {
      enabled: c.enabled,
      thresholdPct: c.thresholdPct,
      windowDays: c.windowDays,
      targets: targets ?? Prisma.DbNull,
      cooldownDays: c.cooldownDays,
    };
    let row = await this.prisma.portfolioAlertRule.upsert({
      where: { userId_kind: { userId, kind: k } },
      create: { userId, kind: k, ...data },
      update: data,
    });
    // Ghi ngay kết quả theo cài đặt mới (không gửi thông báo) để trang Hôm nay khớp với cài đặt vừa lưu
    if (c.enabled) {
      try {
        const now = new Date();
        const e = await this.evaluateFor(userId, toConfig(k, row), true);
        row = await this.prisma.portfolioAlertRule.update({
          where: { id: row.id },
          data: { lastCheck: checkOf(e, now) as unknown as Prisma.InputJsonValue },
        });
      } catch (err) {
        this.log.warn(`Không kiểm tra được ${k} sau khi lưu: ${(err as Error).message}`);
      }
    }
    return this.present(toConfig(k, row), row, await this.lastNotifiedAt(userId, k));
  }

  private async evaluateFor(userId: string, c: RuleConfig, cachedHistory: boolean) {
    const v = await this.portfolio.valuation(userId);
    const h = c.kind === 'drawdown' ? await this.historyFor(userId, cachedHistory) : null;
    return evaluate(c, v, h);
  }

  private async historyFor(userId: string, cached: boolean) {
    const hit = this.previewHistory.get(userId);
    if (cached && hit && Date.now() - hit.at < PREVIEW_HISTORY_TTL_MS && hit.data.today === vnDateKey())
      return hit.data;
    // Một ngày đệm trước cửa sổ dài nhất để ngày đầu cửa sổ có mốc so sánh
    const data = await this.history.recentPoints(userId, MAX_WINDOW_DAYS + 1);
    if (this.previewHistory.size > 500) this.previewHistory.clear();
    this.previewHistory.set(userId, { at: Date.now(), data });
    return data;
  }

  /** Quy tắc nào sẽ báo ngay lúc này và vì sao — theo bản nháp đang sửa nếu có; không gửi, không ghi gì */
  async preview(userId: string, drafts?: PreviewRuleDto[]): Promise<PortfolioAlertPreview> {
    const now = new Date();
    const list = await this.configs(userId);
    const configs = list.map(({ kind, config }) => {
      const d = drafts?.find((x) => x.kind === kind);
      if (!d) return config;
      const c = this.configFrom(kind, d);
      const errors = validateRule({ ...c, enabled: false });
      if (errors.length) throw new BadRequestException(errors);
      return c;
    });
    const v = await this.portfolio.valuation(userId);
    let history: { today: string; points: HistoryPointList } | null = null;
    try {
      history = await this.historyFor(userId, true);
    } catch (err) {
      this.log.warn(`Xem trước: không dựng được lịch sử: ${(err as Error).message}`);
    }
    const items = await Promise.all(
      configs.map(async (c) => {
        const e = evaluate(c, v, history);
        const decision = notifyDecision(e, c, await this.lastNotifiedAt(userId, c.kind), now);
        return {
          kind: c.kind,
          enabled: c.enabled,
          status: e.status,
          headline: e.headline,
          reason: e.reason,
          items: e.items.map((i) => ({ key: i.key, label: i.label, value: i.value, reference: i.reference })),
          wouldNotify: decision.notify,
          nextAllowedAt: decision.nextAllowedAt?.toISOString() ?? null,
        };
      }),
    );
    return { items, generatedAt: now.toISOString() };
  }

  /**
   * Lượt kiểm tra của worker. `drawdown` chỉ chạy sau phiên (cần giá đóng cửa và lịch sử nhiều ngày); trong phiên chỉ
   * kiểm tra tập trung và lệch tỷ trọng (định giá hiện tại). Lỗi của một người không chặn người khác.
   */
  async runAll(opts: { drawdown: boolean }, now = new Date()) {
    const kinds: PortfolioAlertKind[] = opts.drawdown ? [...ALERT_KINDS] : ['concentration', 'drift'];
    const rows = await this.prisma.portfolioAlertRule.findMany({ where: { enabled: true, kind: { in: kinds } } });
    if (!rows.length) return { users: 0, sent: 0, skipped: 0 };
    await this.market.ensureFresh();
    const byUser = new Map<string, RuleRow[]>();
    for (const r of rows) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);
    const total = { users: byUser.size, sent: 0, skipped: 0 };
    for (const [userId, list] of byUser) {
      try {
        const r = await this.runUser(userId, list, now);
        total.sent += r.sent;
        total.skipped += r.skipped;
      } catch (err) {
        this.log.error(`Cảnh báo danh mục của ${userId}: ${(err as Error).message}`);
      }
    }
    this.log.log(
      `Cảnh báo danh mục: ${total.users} người, gửi ${total.sent}, bỏ qua ${total.skipped} quy tắc vì dữ liệu chưa tin cậy`,
    );
    return total;
  }

  private async runUser(userId: string, rows: RuleRow[], now: Date) {
    const v = await this.portfolio.valuation(userId);
    const history = rows.some((r) => r.kind === 'drawdown') ? await this.historyFor(userId, false) : null;
    let sent = 0;
    let skipped = 0;
    for (const row of rows) {
      const c = toConfig(row.kind as PortfolioAlertKind, row);
      const e = evaluate(c, v, history);
      if (e.status === 'skipped') {
        skipped++;
        this.log.log(`Bỏ qua ${c.kind} của ${userId}: ${e.headline}. ${e.reason}`);
      }
      await this.prisma.portfolioAlertRule.update({
        where: { id: row.id },
        data: { lastCheck: checkOf(e, now) as unknown as Prisma.InputJsonValue },
      });
      const decision = notifyDecision(e, c, await this.lastNotifiedAt(userId, c.kind), now);
      if (!decision.notify) continue;
      const created = await this.notifier.send(userId, {
        kind: 'portfolio_health',
        dedupeKey: dedupeKey(c.kind, vnDateKey(now)),
        ...notificationFor(e),
      });
      if (created) sent++;
    }
    return { sent, skipped };
  }
}

type HistoryPointList = Awaited<ReturnType<HistoryService['recentPoints']>>['points'];

@UseGuards(JwtAuthGuard)
@Controller('portfolio-alerts')
class PortfolioAlertsController {
  constructor(private alerts: PortfolioAlertsService) {}

  @Get()
  settings(@CurrentUser() user: AuthUser): Promise<PortfolioAlertSettings> {
    return this.alerts.settings(user.id);
  }

  @Post('preview')
  preview(@CurrentUser() user: AuthUser, @Body() dto: PreviewDto): Promise<PortfolioAlertPreview> {
    return this.alerts.preview(user.id, dto.rules);
  }

  @Put(':kind')
  save(@CurrentUser() user: AuthUser, @Param('kind') kind: string, @Body() dto: RuleDto): Promise<PortfolioAlertRule> {
    return this.alerts.save(user.id, kind, dto);
  }
}

@Module({
  imports: [MarketModule, PortfolioModule, AlertsModule],
  controllers: [PortfolioAlertsController],
  providers: [PortfolioAlertsService],
  exports: [PortfolioAlertsService],
})
export class PortfolioAlertsModule {}
