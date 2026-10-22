import type { InvestorProfile as InvestorProfileRow } from '@prisma/client';
import type { InvestorProfile, RiskType } from '@dautu/contracts';

/**
 * Dòng Prisma → hợp đồng API, dựng từng trường để cột nội bộ (`id`, `userId`, `answers`, `updatedAt`) không lọt ra
 * phản hồi. Nơi cần đáp án khảo sát (advisor, brief) đọc thẳng dòng Prisma, không qua hàm này.
 */
export function toInvestorProfile(row: InvestorProfileRow): InvestorProfile {
  return {
    riskScore: row.riskScore,
    riskType: row.riskType as RiskType,
    goal: row.goal,
    horizon: row.horizon,
    maxDrawdownPct: row.maxDrawdownPct,
    fomoProne: row.fomoProne,
    alertThresholdPct: row.alertThresholdPct,
    morningBrief: row.morningBrief,
    closingBrief: row.closingBrief,
    weeklyBrief: row.weeklyBrief,
    macroAlerts: row.macroAlerts,
  };
}
