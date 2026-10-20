import type { Candle } from './providers/vietcap.provider';

/**
 * Tính sẵn chỉ báo kỹ thuật trên server để AI không phải tự nhẩm (dễ sai).
 * Nến ngày, mới nhất ở cuối.
 */
export function technicals(candles: Candle[]) {
  const closes = candles.map((c) => c.close);
  const n = closes.length;
  if (n < 2) return { note: 'Không đủ dữ liệu lịch sử' };
  const last = closes[n - 1];
  const sma = (p: number) => (n >= p ? avg(closes.slice(-p)) : null);
  const ret = (bars: number) => (n > bars ? pctChange(closes[n - 1 - bars], last) : null);
  const year = candles.slice(-250);
  const hi = Math.max(...year.map((c) => c.high));
  const lo = Math.min(...year.map((c) => c.low));
  const vol20 = avg(candles.slice(-20).map((c) => c.volume));
  const daily = closes.slice(-250).map((c, i, a) => (i ? Math.log(c / a[i - 1]) : 0)).slice(1);
  const ma20 = sma(20);
  const ma50 = sma(50);
  const ma200 = sma(200);
  const macd = macdLine(closes);

  return {
    lastClose: last,
    lastDate: new Date(candles[n - 1].time * 1000).toISOString().slice(0, 10),
    ma20: r(ma20),
    ma50: r(ma50),
    ma200: r(ma200),
    priceVsMa50Pct: ma50 ? r(pctChange(ma50, last)) : null,
    priceVsMa200Pct: ma200 ? r(pctChange(ma200, last)) : null,
    trend:
      ma50 && ma200
        ? last > ma50 && ma50 > ma200
          ? 'uptrend (giá > MA50 > MA200)'
          : last < ma50 && ma50 < ma200
            ? 'downtrend (giá < MA50 < MA200)'
            : 'sideway / chưa rõ xu hướng'
        : 'chưa đủ 200 phiên để xác định',
    rsi14: r(rsi(closes, 14)),
    macd: macd ? { macd: r(macd.macd), signal: r(macd.signal), histogram: r(macd.macd - macd.signal) } : null,
    returnPct: { '1w': r(ret(5)), '1m': r(ret(21)), '3m': r(ret(63)), '6m': r(ret(126)), '1y': r(ret(249)) },
    high52w: hi,
    low52w: lo,
    fromHigh52wPct: r(pctChange(hi, last)),
    avgVolume20: Math.round(vol20),
    lastVolumeVsAvg20: vol20 ? r(candles[n - 1].volume / vol20) : null,
    annualVolatilityPct: daily.length > 20 ? r(stdev(daily) * Math.sqrt(250) * 100) : null,
    maxDrawdown1yPct: r(maxDrawdown(closes.slice(-250))),
  };
}

function avg(a: number[]) {
  return a.reduce((s, x) => s + x, 0) / a.length;
}

function stdev(a: number[]) {
  const m = avg(a);
  return Math.sqrt(avg(a.map((x) => (x - m) ** 2)));
}

function pctChange(from: number, to: number) {
  return ((to - from) / from) * 100;
}

function r(v: number | null) {
  return v === null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100;
}

function rsi(closes: number[], period: number) {
  if (closes.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

function ema(values: number[], period: number) {
  const k = 2 / (period + 1);
  const out: number[] = [];
  values.forEach((v, i) => out.push(i ? v * k + out[i - 1] * (1 - k) : v));
  return out;
}

function macdLine(closes: number[]) {
  if (closes.length < 35) return null;
  const e12 = ema(closes, 12);
  const e26 = ema(closes, 26);
  const line = closes.map((_, i) => e12[i] - e26[i]);
  const signal = ema(line, 9);
  return { macd: line[line.length - 1], signal: signal[signal.length - 1] };
}

function maxDrawdown(closes: number[]) {
  let peak = closes[0];
  let mdd = 0;
  for (const c of closes) {
    peak = Math.max(peak, c);
    mdd = Math.min(mdd, (c - peak) / peak);
  }
  return mdd * 100;
}
