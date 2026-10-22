/**
 * Thẻ xem trước khi chia sẻ link (Open Graph). Zalo, Messenger, Telegram… không chạy JavaScript nên server điền sẵn tiêu đề và
 * mô tả theo đường dẫn vào index.html. Chỉ dùng thông tin có trong URL (mã đã kiểm định dạng), không gọi nguồn dữ liệu nào.
 */

const SITE = 'Đồng Hành Đầu Tư';
const SYMBOL = /^[A-Z0-9]{1,12}$/;

/** URL hỏng (vd %E0%A4) không được làm lỗi request: coi như không có mã */
function decode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return '';
  }
}

interface PagePreview {
  title: string;
  description: string;
  /** Đường dẫn chuẩn cho og:url (không kèm tham số lạ) */
  path: string;
}

const STATIC: Record<string, Omit<PagePreview, 'path'>> = {
  '/market': {
    title: 'Bảng giá',
    description: 'Cổ phiếu, vàng, crypto và tỷ giá cập nhật trong ngày, có ghi nguồn và thời điểm.',
  },
  '/news': { title: 'Tin tức', description: 'Tin thị trường và tin về các mã bạn quan tâm, kèm nguồn gốc bài viết.' },
  '/events': {
    title: 'Lịch sự kiện',
    description: 'Ngày GDKHQ, chia cổ tức, quyền mua và đại hội cổ đông của các mã bạn giữ và theo dõi, có nhắc trước.',
  },
  '/screener': {
    title: 'Lọc cổ phiếu',
    description:
      'Lọc toàn thị trường theo định giá, hiệu quả, tăng trưởng, thanh khoản và cổ tức; lưu bộ lọc để dùng lại.',
  },
  '/income': {
    title: 'Thu nhập cổ tức',
    description: 'Cổ tức đã nhận và sắp nhận theo tháng, ghi rõ căn cứ tính và mức chắc chắn.',
  },
  '/simulate': {
    title: 'Thử kịch bản',
    description:
      'Nếu cổ phiếu, vàng, crypto hay tỷ giá thay đổi thì danh mục của bạn thay đổi bao nhiêu — chỉ là mô phỏng.',
  },
  '/compare': {
    title: 'So sánh cổ phiếu',
    description: 'Đặt 2–4 cổ phiếu cạnh nhau: diễn biến giá cùng mốc, hiệu suất và chỉ tiêu cơ bản cùng kỳ.',
  },
  '/demo': { title: 'Trải nghiệm thử', description: 'Xem thử ứng dụng với danh mục mẫu, không cần đăng ký.' },
  '/register': {
    title: 'Đăng ký',
    description: 'Tạo tài khoản miễn phí để theo dõi danh mục, cổ tức và kế hoạch đầu tư.',
  },
};

/** Tiêu đề / mô tả theo trang; null = giữ mặc định của index.html */
export function pagePreview(path: string, query: Record<string, unknown> = {}): PagePreview | null {
  const clean = path.replace(/\/+$/, '') || '/';
  const stock = /^\/stock\/([^/]+)$/.exec(clean);
  if (stock) {
    const s = decode(stock[1]).toUpperCase();
    if (!SYMBOL.test(s)) return null;
    return {
      title: `Cổ phiếu ${s}`,
      description: `Giá, chỉ số tài chính, lịch sử cổ tức và lịch sự kiện của ${s} — có dẫn nguồn.`,
      path: `/stock/${s}`,
    };
  }
  const crypto = /^\/crypto\/([^/]+)$/.exec(clean);
  if (crypto) {
    const s = decode(crypto[1]).toUpperCase();
    if (!SYMBOL.test(s)) return null;
    const name = s.replace(/USDT$/, '') || s;
    return {
      title: `${name} (crypto)`,
      description: `Giá và biểu đồ ${name}, quy đổi sang VND.`,
      path: `/crypto/${s}`,
    };
  }
  if (clean === '/compare') {
    const raw = typeof query.symbols === 'string' ? query.symbols : '';
    const symbols = [
      ...new Set(
        raw
          .toUpperCase()
          .split(',')
          .map((x) => x.trim()),
      ),
    ].filter((x) => SYMBOL.test(x));
    if (symbols.length >= 2 && symbols.length <= 4) {
      return {
        title: `So sánh ${symbols.join(', ')}`,
        description: STATIC['/compare'].description,
        path: `/compare?symbols=${symbols.join(',')}`,
      };
    }
  }
  const fixed = STATIC[clean];
  return fixed ? { ...fixed, path: clean } : null;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Thay tiêu đề, mô tả, og:url trong index.html theo trang; không có preview thì trả nguyên văn */
export function withPreview(html: string, preview: PagePreview | null, origin: string) {
  if (!preview) return html;
  const title = escapeHtml(`${preview.title} · ${SITE}`);
  const description = escapeHtml(preview.description);
  const url = escapeHtml(`${origin.replace(/\/+$/, '')}${preview.path}`);
  const setMeta = (doc: string, attr: 'property' | 'name', key: string, value: string) =>
    doc.replace(new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`), `$1${value}$2`);
  let out = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
  out = setMeta(out, 'name', 'description', description);
  out = setMeta(out, 'property', 'og:title', title);
  out = setMeta(out, 'property', 'og:description', description);
  out = setMeta(out, 'property', 'og:url', url);
  out = setMeta(out, 'name', 'twitter:title', title);
  out = setMeta(out, 'name', 'twitter:description', description);
  return out;
}
