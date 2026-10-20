/**
 * Đối soát bảng Holding với sổ giao dịch: cùng tài sản phải khớp số lượng và giá vốn.
 * Chạy sau khi deploy: `node --env-file=../.env dist/portfolio/reconcile.js` (trong thư mục backend).
 * Không sửa dữ liệu; thoát mã 1 nếu có chênh lệch.
 */
import { PrismaClient } from '@prisma/client';
import { computeLedger } from './ledger';
import { toLedgerTx } from './transactions';

async function main() {
  const db = new PrismaClient();
  const users = await db.user.findMany({ select: { id: true } });
  let mismatches = 0;
  for (const { id } of users) {
    const [holdings, txs] = await Promise.all([
      db.holding.findMany({ where: { userId: id } }),
      db.transaction.findMany({ where: { userId: id, deletedAt: null } }),
    ]);
    if (!holdings.length && !txs.length) continue;
    const ledger = computeLedger(txs.map(toLedgerTx));
    const fromHoldings = new Map<string, { q: number; c: number }>();
    for (const h of holdings) {
      const k = `${h.assetType}:${h.symbol}`;
      const cur = fromHoldings.get(k) ?? { q: 0, c: 0 };
      fromHoldings.set(k, { q: cur.q + h.quantity, c: cur.c + h.quantity * (h.assetType === 'cash' ? 1 : h.avgCost) });
    }
    const fromLedger = new Map<string, { q: number; c: number }>();
    for (const p of ledger.positions) {
      if (p.quantity.gt(0)) fromLedger.set(`${p.assetType}:${p.symbol}`, { q: p.quantity.toNumber(), c: p.costBasis.toNumber() });
    }
    for (const cur of ['VND', 'USDT'] as const) {
      const q = ledger.cash[cur].toNumber();
      if (q > 0) fromLedger.set(`cash:${cur}`, { q, c: q });
    }
    for (const k of new Set([...fromHoldings.keys(), ...fromLedger.keys()])) {
      const a = fromHoldings.get(k);
      const b = fromLedger.get(k);
      // Tiền mặt USDT: Holding lưu giá vốn theo VND nên chỉ so số lượng
      const costOk = k === 'cash:USDT' || (a && b && Math.abs(a.c - b.c) <= 1e-6 * Math.max(1, a.c));
      if (!a || !b || Math.abs(a.q - b.q) > 1e-8 * Math.max(1, a.q) || !costOk) {
        mismatches++;
        console.log(`LỆCH user=${id} ${k} holding=${JSON.stringify(a)} ledger=${JSON.stringify(b)}`);
      }
    }
  }
  console.log(mismatches ? `Có ${mismatches} chênh lệch` : `Khớp: ${users.length} người dùng`);
  await db.$disconnect();
  process.exit(mismatches ? 1 : 0);
}

void main();
