import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  GroupTargets,
  PortfolioAlertKind,
  PortfolioAlertPreview,
  PortfolioAlertRule,
  PortfolioAlertRuleRequest,
  PortfolioAlertSettings,
  TargetSuggestion,
} from '@dautu/contracts';
import { PortfolioService } from '../portfolio/portfolio.service';
import { PrismaService } from '../prisma/prisma.service';
import { RISK_TYPE_LABEL } from '../profile/quiz';
import { PortfolioAlertHistory } from './alert-history.service';
import type { AlertHistory } from './alert-history.service';
import type { PreviewRuleDto } from './dto/portfolio-alert.dto';
import { evaluate } from './evaluators';
import { notifyDecision } from './notify';
import { checkOf, toPortfolioAlertRule } from './portfolio-alerts.presenter';
import {
  ALERT_KINDS,
  defaultRule,
  LIMITS,
  normalizeTargets,
  referenceTargets,
  validateRule,
  validateTargets,
} from './rule-config';
import type { RuleConfig } from './rule-config';
import { PortfolioAlertRuleStore } from './rule-store.service';
import { toConfig } from './rule-row';

/**
 * Cảnh báo theo tình trạng danh mục, phía người dùng: cài đặt, lưu quy tắc và xem trước (không gửi gì).
 * Đánh giá trên toàn bộ tài sản của người dùng (gộp mọi danh mục, như trang Hôm nay). Lượt kiểm tra định kỳ của worker
 * nằm ở `PortfolioAlertsRunner`.
 */
@Injectable()
export class PortfolioAlertsService {
  private log = new Logger(PortfolioAlertsService.name);

  constructor(
    private prisma: PrismaService,
    private portfolio: PortfolioService,
    private store: PortfolioAlertRuleStore,
    private history: PortfolioAlertHistory,
  ) {}

  async settings(userId: string): Promise<PortfolioAlertSettings> {
    const [list, profile, goals] = await Promise.all([
      this.store.configs(userId),
      this.prisma.investorProfile.findUnique({ where: { userId }, select: { riskType: true } }),
      this.prisma.goal.findMany({
        where: { userId, status: 'active', targetAllocation: { not: Prisma.DbNull } },
        select: { name: true, targetAllocation: true },
        orderBy: { targetDate: 'asc' },
        take: 5,
      }),
    ]);
    const rules = await Promise.all(
      list.map(async ({ kind, row, config }) =>
        toPortfolioAlertRule(config, row, await this.store.lastNotifiedAt(userId, kind)),
      ),
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
    return toPortfolioAlertRule(toConfig(k, row), row, await this.store.lastNotifiedAt(userId, k));
  }

  private async evaluateFor(userId: string, c: RuleConfig, cachedHistory: boolean) {
    const v = await this.portfolio.valuation(userId);
    const h = c.kind === 'drawdown' ? await this.history.get(userId, cachedHistory) : null;
    return evaluate(c, v, h);
  }

  /** Quy tắc nào sẽ báo ngay lúc này và vì sao — theo bản nháp đang sửa nếu có; không gửi, không ghi gì */
  async preview(userId: string, drafts?: PreviewRuleDto[]): Promise<PortfolioAlertPreview> {
    const now = new Date();
    const list = await this.store.configs(userId);
    const configs = list.map(({ kind, config }) => {
      const d = drafts?.find((x) => x.kind === kind);
      if (!d) return config;
      const c = this.configFrom(kind, d);
      const errors = validateRule({ ...c, enabled: false });
      if (errors.length) throw new BadRequestException(errors);
      return c;
    });
    const v = await this.portfolio.valuation(userId);
    let history: AlertHistory | null = null;
    try {
      history = await this.history.get(userId, true);
    } catch (err) {
      this.log.warn(`Xem trước: không dựng được lịch sử: ${(err as Error).message}`);
    }
    const items = await Promise.all(
      configs.map(async (c) => {
        const e = evaluate(c, v, history);
        const decision = notifyDecision(e, c, await this.store.lastNotifiedAt(userId, c.kind), now);
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
}
