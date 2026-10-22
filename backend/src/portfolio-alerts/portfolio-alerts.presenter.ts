import type { PortfolioAlertRule as RuleRow } from '@prisma/client';
import type { PortfolioAlertCheck, PortfolioAlertRule } from '@dautu/contracts';
import type { Evaluation } from './evaluators';
import { parseCheck } from './rule-row';
import type { RuleConfig } from './rule-config';

export const checkOf = (e: Evaluation, at: Date): PortfolioAlertCheck => ({
  at: at.toISOString(),
  status: e.status,
  title: e.headline,
  reason: e.reason,
});

/** Dựng từng trường (không lộ id / userId) */
export function toPortfolioAlertRule(
  c: RuleConfig,
  row: RuleRow | null,
  lastNotifiedAt: Date | null,
): PortfolioAlertRule {
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
