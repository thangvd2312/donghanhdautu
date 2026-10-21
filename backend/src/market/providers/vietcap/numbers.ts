/** Tỷ lệ 0–1 của Vietcap → phần trăm làm tròn 2 số; không phải số thì null */
export function pct(v: unknown) {
  return typeof v === 'number' ? round(v * 100, 2) : null;
}

export function round(v: number, d: number) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
