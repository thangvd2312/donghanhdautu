/**
 * Bảng giá model (USD / 1 triệu token) theo phiên bản để tính chi phí ước tính. Giá API trực tiếp của Anthropic;
 * đi qua router bên thứ ba thì giá thực có thể khác. Model không có trong bảng → chi phí "không rõ" (null), không phải 0.
 * Đổi giá: thêm phiên bản mới, không sửa phiên bản cũ (bản ghi cũ giữ priceVersion lúc tính).
 */
const BASE_VERSION = '2026-10-06';

interface Rate {
  input: number;
  output: number;
  cacheRead: number;
  /** Ghi cache (TTL 5 phút) = 1,25 × giá input */
  cacheWrite: number;
}

const rate = (input: number, output: number, cacheRead: number): Rate => ({
  input,
  output,
  cacheRead,
  cacheWrite: input * 1.25,
});

const PRICES: Record<string, Rate> = {
  'claude-fable-5-1': rate(10, 50, 0.25),
  'claude-opus-5-5': rate(4, 20, 0.2),
  'claude-sonnet-5-5': rate(2, 10, 0.2),
  // Prompt ≤ 100K token; cache đọc lấy 0,1 × input
  'claude-haiku-5-5': rate(0.1, 0.5, 0.01),
};

/**
 * Giá model đi qua router (tên model khác Anthropic) khai báo qua biến môi trường, USD / 1 triệu token:
 * AI_PRICES='{"ag/gemini-3.8-flash-low":{"input":0.3,"output":2.5}}' (cacheRead/cacheWrite tuỳ chọn).
 * Có khai báo thì phiên bản giá thêm hậu tố "+env" để biết số liệu tính theo giá tự khai.
 */
function envPrices(): Record<string, Rate> {
  try {
    const raw = JSON.parse(process.env.AI_PRICES || '{}') as Record<string, Partial<Rate>>;
    const out: Record<string, Rate> = {};
    for (const [model, r] of Object.entries(raw)) {
      if (typeof r.input !== 'number' || typeof r.output !== 'number') continue;
      out[model] = {
        ...rate(r.input, r.output, r.cacheRead ?? r.input * 0.1),
        ...(r.cacheWrite ? { cacheWrite: r.cacheWrite } : {}),
      };
    }
    return out;
  } catch {
    return {};
  }
}

const ENV_PRICES = envPrices();
Object.assign(PRICES, ENV_PRICES);

export const PRICE_VERSION = Object.keys(ENV_PRICES).length ? `${BASE_VERSION}+env` : BASE_VERSION;

export interface UsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/** Chi phí ước tính (USD) của một lần gọi; null khi thiếu usage hoặc chưa có giá của model */
export function estimateCost(model: string, usage: UsageLike | null | undefined): number | null {
  const r = PRICES[model];
  if (!r || !usage || usage.input_tokens == null || usage.output_tokens == null) return null;
  const m = 1_000_000;
  return (
    (usage.input_tokens * r.input +
      usage.output_tokens * r.output +
      (usage.cache_read_input_tokens ?? 0) * r.cacheRead +
      (usage.cache_creation_input_tokens ?? 0) * r.cacheWrite) /
    m
  );
}
