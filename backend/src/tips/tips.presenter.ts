import type { TipCheck as TipRow } from '@prisma/client';
import type {
  PriceStatus,
  TipAssetType,
  TipCheck,
  TipClaims,
  TipDecision,
  TipListItem,
  TipPersonal,
  TipReport,
  TipReviewResult,
  TipScorePart,
  TipSourceKind,
  TipStatus,
} from '@dautu/contracts';
import { hotLevel } from './tips.logic';

export interface CurrentPrice {
  value: number | null;
  status: PriceStatus;
  source: string;
  asOf: string | null;
}

const base = (symbol: string) => symbol.replace(/USDT$/, '');
export const tipDisplayName = (assetType: string, symbol: string) => (assetType === 'crypto' ? base(symbol) : symbol);
const link = (assetType: string, symbol: string) =>
  assetType === 'crypto' ? `/crypto/${base(symbol)}` : `/stock/${symbol}`;
const changePct = (from: number | null, to: number | null) =>
  from && to !== null ? Math.round(((to - from) / from) * 10_000) / 100 : null;

/** Dòng Prisma → hợp đồng API, dựng từng trường (không lộ userId) */
export function toTipCheck(r: TipRow, price: CurrentPrice): TipCheck {
  return {
    id: r.id,
    text: r.text,
    sourceName: r.sourceName,
    sourceKind: r.sourceKind as TipSourceKind | null,
    assetType: r.assetType as TipAssetType,
    symbol: r.symbol,
    displayName: tipDisplayName(r.assetType, r.symbol),
    link: link(r.assetType, r.symbol),
    currency: r.assetType === 'crypto' ? 'USDT' : 'VND',
    claims: r.claims as unknown as TipClaims,
    status: r.status as TipStatus,
    priceAtCheck: r.priceAtCheck,
    priceSource: r.priceSource,
    benchmark: r.benchmark as TipCheck['benchmark'],
    benchmarkAtCheck: r.benchmarkAtCheck,
    price,
    changeSinceCheckPct: changePct(r.priceAtCheck, price.value),
    score: r.score,
    hotLevel: hotLevel(r.score),
    scoreParts: (r.scoreParts as unknown as TipScorePart[] | null) ?? [],
    personal: r.personal as unknown as TipPersonal | null,
    report: r.report as unknown as TipReport | null,
    decision: r.decision as TipDecision | null,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    boughtAt: r.boughtAt?.toISOString() ?? null,
    planId: r.planId,
    priceAlertId: r.priceAlertId,
    conversationId: r.conversationId,
    review30: r.review30 as unknown as TipReviewResult | null,
    review90: r.review90 as unknown as TipReviewResult | null,
    createdAt: r.createdAt.toISOString(),
  };
}

export function toTipListItem(r: TipRow, price: number | null): TipListItem {
  const text = r.text.replace(/\s+/g, ' ').trim();
  return {
    id: r.id,
    assetType: r.assetType as TipAssetType,
    symbol: r.symbol,
    displayName: tipDisplayName(r.assetType, r.symbol),
    sourceName: r.sourceName,
    direction: (r.claims as unknown as TipClaims).direction,
    status: r.status as TipStatus,
    score: r.score,
    hotLevel: hotLevel(r.score),
    decision: r.decision as TipDecision | null,
    boughtAt: r.boughtAt?.toISOString() ?? null,
    priceAtCheck: r.priceAtCheck,
    currency: r.assetType === 'crypto' ? 'USDT' : 'VND',
    changeSinceCheckPct: changePct(r.priceAtCheck, price),
    review30: r.review30 as unknown as TipReviewResult | null,
    review90: r.review90 as unknown as TipReviewResult | null,
    excerpt: text.length > 140 ? `${text.slice(0, 139)}…` : text,
    createdAt: r.createdAt.toISOString(),
  };
}

const num = (v: number) => v.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

/** Tóm tắt phiếu dạng Markdown làm tin mở đầu cuộc trò chuyện "Hỏi tiếp cố vấn" */
export function tipSummaryMarkdown(t: TipCheck): string {
  const c = t.claims;
  const unit = t.currency === 'USDT' ? 'USDT' : '₫';
  const lines = [
    `**Soi lời khuyên ${t.displayName}**${t.sourceName ? ` (nguồn: ${t.sourceName})` : ''}`,
    '',
    `Mức nóng: **${t.score ?? '?'}/100**${
      t.scoreParts.length
        ? ` — ${t.scoreParts
            .filter((p) => p.points)
            .map((p) => p.detail)
            .join('; ')}`
        : ''
    }`,
    '',
    '**Lời khuyên nói gì**',
    `- Hướng: ${{ buy: 'mua', sell: 'bán', hold: 'giữ', unknown: 'không rõ' }[c.direction]}`,
    c.targetPrice !== null ? `- Mục tiêu: ${num(c.targetPrice)} ${unit}` : '- Không có giá mục tiêu',
    c.stopPrice !== null ? `- Cắt lỗ: ${num(c.stopPrice)} ${unit}` : '- Không có điểm cắt lỗ',
    ...c.reasons.map((r) => `- Lý do: ${r}`),
  ];
  const r = t.report;
  if (r?.dataSays.length) lines.push('', '**Dữ liệu nói gì**', ...r.dataSays.map((d) => `- ${d.point} (${d.source})`));
  if (r?.unverifiable.length) lines.push('', '**Chưa kiểm chứng được**', ...r.unverifiable.map((u) => `- ${u}`));
  if (r?.verdict) lines.push('', r.verdict);
  if (t.priceAtCheck !== null)
    lines.push('', `_Giá lúc soi: ${num(t.priceAtCheck)} ${unit} (${t.priceSource ?? ''})._`);
  return lines.join('\n');
}
