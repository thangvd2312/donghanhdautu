import { Injectable } from '@nestjs/common';
import type { Holding, InvestorProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AlertRecipient = { id: string; profile: InvestorProfile | null; holdings: Holding[] };

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

  wantingMacro(): Promise<AlertRecipient[]> {
    return this.prisma.user.findMany({
      where: { profile: { macroAlerts: true } },
      select: { id: true, profile: true, holdings: true },
    });
  }
}
