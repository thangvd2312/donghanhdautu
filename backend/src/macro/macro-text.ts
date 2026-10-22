export function toText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

/** "16/06/2023" → Date */
export function toDate(dmy: string) {
  const [d, m, y] = dmy.split('/').map(Number);
  return d && m && y ? new Date(Date.UTC(y, m - 1, d)) : null;
}

/** "4,500" → 4.5 */
export function num(s: string) {
  return Number(s.replace(/\./g, '').replace(',', '.'));
}

/** Chuẩn hoá cách viết số kiểu Việt Nam: "4,500" → "4,5"; "4.45" → "4,45" */
export function vn(s: string) {
  const n = num(s.includes(',') ? s : s.replace('.', ','));
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(n);
}

/** 3.75 → "3,75"; 4 → "4,00" (lãi suất Fed luôn viết 2 chữ số thập phân) */
export function pct2(n: number) {
  return new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
