import { Injectable } from '@nestjs/common';
import type { Holding, InvestorProfile } from '@prisma/client';
import { normalizeCrypto } from '../market/crypto-symbol';
import { PrismaService } from '../prisma/prisma.service';

export type AlertRecipient = { id: string; profile: InvestorProfile | null; holdings: Holding[] };

/** Một coin người dùng quan tâm: `pair` BTCUSDT, `base` BTC; `held` = đang giữ (không thì chỉ đang theo dõi) */
export interface UserCoin {
  pair: string;
  base: string;
  held: boolean;
}
export type CoinRecipient = AlertRecipient & { coins: UserCoin[] };

/** Who a scan should look at: people holding assets, and people who opted in to macro alerts. */
@Injectable()
export class AlertAudience {
  constructor(private prisma: PrismaService) {}

  withHoldings(): Promise<AlertRecipient[]> {
    return this.prisma.user.findMany({
      where: { holdings: { some: {} } },
      select: { id: true, profile: true, holdings: true },
    });
  }

  /** Người đang giữ hoặc đang theo dõi coin, kèm danh sách coin (đang giữ trước); `userIds` = chỉ những người này */
  async withCoins(userIds?: string[]): Promise<CoinRecipient[]> {
    const users = await this.prisma.user.findMany({
      where: {
        ...(userIds && { id: { in: userIds } }),
        OR: [{ holdings: { some: { assetType: 'crypto' } } }, { watchlist: { some: { assetType: 'crypto' } } }],
      },
      select: {
        id: true,
        profile: true,
        holdings: true,
        watchlist: { where: { assetType: 'crypto' }, select: { symbol: true } },
      },
    });
    return users.map(({ watchlist, ...u }) => {
      const coins = new Map<string, UserCoin>();
      const add = (symbol: string, held: boolean) => {
        const pair = normalizeCrypto(symbol);
        if (!coins.has(pair) || held) coins.set(pair, { pair, base: pair.replace(/USDT$/, ''), held });
      };
      for (const h of u.holdings) if (h.assetType === 'crypto' && Number(h.quantity) > 0) add(h.symbol, true);
      for (const w of watchlist) add(w.symbol, false);
      return { ...u, coins: [...coins.values()].sort((a, b) => Number(b.held) - Number(a.held)) };
    });
  }

  wantingMacro(): Promise<AlertRecipient[]> {
    return this.prisma.user.findMany({
      where: { profile: { macroAlerts: true } },
      select: { id: true, profile: true, holdings: true },
    });
  }
}
