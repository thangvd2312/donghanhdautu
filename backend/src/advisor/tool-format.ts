/** Round to 2 decimals for the numbers the AI reads. */
export function round(v: number) {
  return Math.round(v * 100) / 100;
}

/** Host of a URL without `www.`, for the "reading article" label. */
export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 40);
  }
}

/** Giá trị nguồn không rõ kiểu → chuỗi (bỏ qua object) */
export function text(v: unknown) {
  return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
}
