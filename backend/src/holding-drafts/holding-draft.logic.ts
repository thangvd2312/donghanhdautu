import { z } from 'zod';
import type { HoldingDraftResponse } from '@dautu/contracts';

const warnings = z.array(z.string().max(500)).max(30);
const number = z.number().finite().positive().max(1e15).nullable();
const responseSchema = z.object({
  warnings,
  rows: z
    .array(
      z.object({
        assetType: z.enum(['stock', 'crypto', 'gold', 'cash']).nullable(),
        symbol: z.string().max(60).nullable(),
        quantity: number,
        avgCost: number,
        sourceText: z.string().min(1).max(4000),
        warnings,
      }),
    )
    .max(20),
});

/** Validate even when the provider claims structured output; never trust a cast of model JSON. */
export function validateHoldingDraft(raw: unknown, text: string, goldCodes: string[]): HoldingDraftResponse | null {
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) return null;
  const result = parsed.data;
  for (const row of result.rows) {
    // An extraction must point back to the actual transcript, not invent an utterance.
    if (!text.includes(row.sourceText)) return null;
    row.symbol = row.symbol?.trim().toUpperCase() || null;
    if (row.assetType === 'cash') {
      if (row.symbol !== 'VND') {
        row.assetType = null;
        row.warnings.push('Chỉ hỗ trợ tiền mặt VND trong lần khai báo này.');
      } else row.avgCost = 1;
    }
    if (row.assetType === 'gold' && row.symbol && !goldCodes.includes(row.symbol)) {
      row.symbol = null;
      row.warnings.push('Chọn chính xác loại vàng trước khi lưu.');
    }
    if (!row.assetType) row.warnings.push('Cần chọn loại tài sản.');
    if (!row.symbol) row.warnings.push('Cần xác nhận mã hoặc loại tài sản.');
    if (row.quantity === null) row.warnings.push('Cần bổ sung số lượng hoặc số tiền.');
    if (row.assetType !== 'cash' && row.avgCost === null)
      row.warnings.push('Chưa có giá vốn, hãy bổ sung trước khi nhập.');
    row.warnings = [...new Set(row.warnings)];
  }
  return result;
}
