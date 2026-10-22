import { sleep } from './macro-text';

/** Header giống trình duyệt: tường lửa của sbv.gov.vn trả trang "Request Rejected" (HTTP 200) cho request thiếu header */
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Upgrade-Insecure-Requests': '1',
};

export const SBV = {
  rates: 'https://sbv.gov.vn/vi/l%C3%A3i-su%E1%BA%A5t1',
  fx: 'https://sbv.gov.vn/vi/t%E1%BB%B7-gi%C3%A1',
  cpi: 'https://sbv.gov.vn/vi/cpi',
};
export const FED = 'https://www.federalreserve.gov/monetarypolicy/openmarket.htm';

/** Tải một trang HTML công khai, thử lại tối đa 3 lần; trang bị tường lửa chặn (HTTP 200 nhưng là trang từ chối) coi như lỗi */
export async function fetchPage(url: string): Promise<string> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const html = await r.text();
      if (/Request Rejected|The requested URL was rejected/i.test(html)) throw new Error('bị tường lửa của trang chặn');
      return html;
    } catch (e) {
      lastErr = e as Error;
      await sleep(8000 * (attempt + 1));
    }
  }
  throw lastErr ?? new Error('không tải được');
}
