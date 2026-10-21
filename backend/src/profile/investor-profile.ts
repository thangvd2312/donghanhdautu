import type { InvestorProfile as InvestorProfileRow } from '@prisma/client';
import type { InvestorProfile, RiskType } from '@dautu/contracts';

/**
 * Dòng Prisma → hợp đồng API. Chỉ khẳng định kiểu của `riskType` (cột lưu chuỗi, luôn do `scoreQuiz` ghi); mọi cột
 * khác giữ nguyên nên phản hồi JSON không đổi.
 */
export function toInvestorProfile(row: InvestorProfileRow): InvestorProfile {
  return { ...row, riskType: row.riskType as RiskType };
}
