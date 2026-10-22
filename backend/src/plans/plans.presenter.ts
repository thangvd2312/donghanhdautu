import type { InvestmentPlan, Prisma } from '@prisma/client';
import type { PlanReview as PlanReviewRow, PlanVersion as PlanVersionRow } from '@prisma/client';
import type { Plan, PlanDetail, PlanReview, TrackedAssetType } from '@dautu/contracts';
import { displaySymbol } from './plan-rules';

/** Plan row → `Plan` contract; `displayName` comes from the market (gold names live in the price board). */
export function toPlan(p: InvestmentPlan, displayName: string): Plan {
  return {
    id: p.id,
    assetType: p.assetType as TrackedAssetType,
    symbol: p.symbol,
    displayName,
    link:
      p.assetType === 'stock'
        ? `/stock/${p.symbol}`
        : p.assetType === 'crypto'
          ? `/crypto/${displaySymbol('crypto', p.symbol)}`
          : null,
    currency: p.assetType === 'crypto' ? ('USDT' as const) : ('VND' as const),
    thesis: p.thesis,
    horizon: p.horizon,
    exitConditions: p.exitConditions,
    targetPrice: p.targetPrice,
    stopPrice: p.stopPrice,
    reviewEveryDays: p.reviewEveryDays,
    nextReviewAt: p.nextReviewAt.toISOString().slice(0, 10),
    status: p.status as 'active' | 'closed',
    closedReason: p.closedReason,
    closedAt: p.closedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** Dòng Prisma → hợp đồng API, dựng từng trường (không lộ `planId`); Date → chuỗi ISO như JSON vẫn serialize */
export function presentReview(r: PlanReviewRow): PlanReview {
  return {
    id: r.id,
    decision: r.decision as PlanReview['decision'],
    note: r.note,
    priceAtReview: r.priceAtReview,
    pnlPctAtReview: r.pnlPctAtReview,
    reason: r.reason as PlanReview['reason'],
    emotion: r.emotion as PlanReview['emotion'],
    createdAt: r.createdAt.toISOString(),
  };
}

export function presentVersion(v: PlanVersionRow): PlanDetail['versions'][number] {
  return { id: v.id, snapshot: v.snapshot as Record<string, unknown>, createdAt: v.createdAt.toISOString() };
}

export function snapshot(p: InvestmentPlan): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(p)) as Prisma.InputJsonValue;
}

/** Plan row with the review date as a day key, the shape the pure plan rules work on. */
export function toPlanLite(p: InvestmentPlan) {
  return { ...p, nextReviewAt: p.nextReviewAt.toISOString().slice(0, 10) };
}
