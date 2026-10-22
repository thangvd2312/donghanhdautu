/** Dòng PortfolioAlertRule (DB) → cấu hình đánh giá; dùng chung cho service và trang Hôm nay */
import type { Prisma, PortfolioAlertRule as RuleRow } from '@prisma/client';
import type { GroupTargets, PortfolioAlertCheck, PortfolioAlertKind, PortfolioAlertStatus } from '@dautu/contracts';
import { defaultRule, normalizeTargets, RuleConfig } from './rules';

export function toConfig(kind: PortfolioAlertKind, row: RuleRow | null | undefined): RuleConfig {
  if (!row) return defaultRule(kind);
  return {
    kind,
    enabled: row.enabled,
    thresholdPct: row.thresholdPct,
    windowDays: kind === 'drawdown' ? (row.windowDays ?? defaultRule(kind).windowDays) : null,
    targets: kind === 'drift' && row.targets ? normalizeTargets(row.targets as Partial<GroupTargets>) : null,
    cooldownDays: row.cooldownDays,
  };
}

export function parseCheck(json: Prisma.JsonValue | null): PortfolioAlertCheck | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  if (typeof o.at !== 'string' || typeof o.status !== 'string') return null;
  return {
    at: o.at,
    status: o.status as PortfolioAlertStatus,
    title: typeof o.title === 'string' ? o.title : '',
    reason: typeof o.reason === 'string' ? o.reason : '',
  };
}
