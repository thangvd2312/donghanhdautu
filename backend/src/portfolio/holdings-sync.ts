import type { Prisma } from '@prisma/client';
import type { LedgerResult } from './ledger';

/** Ghi lại bảng Holding từ sổ: chỉ cập nhật dòng thay đổi để giữ id và mốc updatedAt có ý nghĩa */
export async function syncHoldings(
  db: Prisma.TransactionClient,
  userId: string,
  ledger: LedgerResult,
  usdtVndRate: number,
) {
  const desired = new Map<
    string,
    { assetType: string; symbol: string; quantity: number; avgCost: number; note: string | null }
  >();
  for (const p of ledger.positions) {
    if (!p.quantity.gt(0)) continue;
    desired.set(`${p.assetType}:${p.symbol}`, {
      assetType: p.assetType,
      symbol: p.symbol,
      quantity: p.quantity.toNumber(),
      avgCost: p.costBasis.div(p.quantity).toNumber(),
      note: p.note,
    });
  }
  for (const cur of ['VND', 'USDT'] as const) {
    if (!ledger.cash[cur].gt(0)) continue;
    desired.set(`cash:${cur}`, {
      assetType: 'cash',
      symbol: cur,
      quantity: ledger.cash[cur].toNumber(),
      // Tiền mặt: giá vốn theo VND cho mỗi đơn vị (USDT theo tỷ giá hiện tại)
      avgCost: cur === 'VND' ? 1 : usdtVndRate,
      note: null,
    });
  }

  const existing = await db.holding.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  const seen = new Set<string>();
  for (const h of existing) {
    const key = `${h.assetType}:${h.symbol}`;
    const want = desired.get(key);
    if (!want || seen.has(key)) {
      await db.holding.delete({ where: { id: h.id } });
      continue;
    }
    seen.add(key);
    if (!same(h.quantity, want.quantity) || !same(h.avgCost, want.avgCost) || h.note !== want.note) {
      await db.holding.update({ where: { id: h.id }, data: want });
    }
  }
  const missing = [...desired.entries()].filter(([k]) => !seen.has(k)).map(([, v]) => ({ ...v, userId }));
  if (missing.length) await db.holding.createMany({ data: missing });
}

function same(a: number, b: number) {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}
