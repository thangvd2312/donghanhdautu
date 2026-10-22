import { Prisma } from '@prisma/client';
import type { RebalanceAction } from '@dautu/contracts';
import type { RebalanceGroup } from './rebalance.types';

export const D = Prisma.Decimal;
export const Decimal = Prisma.Decimal;
export type Dec = Prisma.Decimal;

export const GROUP_ORDER: RebalanceGroup[] = ['stock', 'crypto', 'gold', 'cash'];
export const CRYPTO_STEP = new D('0.000001');
export const GOLD_STEP = new D('0.1');
export const BOARD_LOT = 100;

export const UNIT: Record<'stock' | 'crypto' | 'gold', RebalanceAction['unit']> = {
  stock: 'cp',
  crypto: 'coin',
  gold: 'lượng',
};

/** Mã người dùng nhập → khoá so khớp: viết hoa, coin bỏ hậu tố USDT (BTC = BTCUSDT) */
export const symbolKey = (type: string, s: string) => {
  const u = s.trim().toUpperCase();
  return type === 'crypto' && u.length > 4 && u.endsWith('USDT') ? u.slice(0, -4) : u;
};
export const keyOf = (type: string, s: string) => `${type}:${symbolKey(type, s)}`;

export const rnd0 = (d: Dec) => d.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
export const round0 = (d: Dec) => rnd0(d).toNumber();
export const round2 = (d: Dec) => d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();
export const floorStep = (x: Dec, step: Dec) => (x.lte(0) ? new D(0) : x.div(step).floor().mul(step));
export const vnd = (n: number) =>
  Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export const pts = (n: number) => n.toFixed(1).replace('.', ',');
