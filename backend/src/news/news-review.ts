import type { Prisma } from '@prisma/client';
import { BINANCE_NOTICE_SOURCE } from './crypto-news';

/**
 * Lọc tin bằng AI: mỗi tin lấy về được đọc một lần, chỉ tin thực sự ảnh hưởng tới quyết định đầu tư mới được đưa vào
 * app (kho tin / trang Tin tức, feed Hôm nay, cảnh báo, bản tin, cố vấn). Tin chứng khoán được gắn nhãn luôn trong
 * cùng lượt (mã, mức vĩ mô, chủ đề, tác động); tin coin chỉ cần quyết định giữ / loại.
 */

export type ReviewKind = 'stock' | 'coin';

/** Một tin cần chấm (tin đang có trên nguồn, hoặc tin đã lưu trong kho từ trước khi có bước lọc) */
export interface ReviewItem {
  url: string;
  title: string;
  summary: string;
  source: string;
  category: string;
  publishedAt: string;
  kind: ReviewKind;
}

const COMMON_DROPS = `  · Quảng cáo, PR, khuyến mãi, bài tài trợ, cuộc thi, mẹo vặt, hướng dẫn chung chung, danh sách kiểu "10 điều…".
  · Đời tư, gia đình, phong cách sống của doanh nhân, tỷ phú, người nổi tiếng — kể cả khi có tên doanh nghiệp niêm yết.
  · Bình luận, phỏng vấn, dự báo chung chung không kèm dữ kiện mới.`;

export const STOCK_REVIEW_PROMPT = `Bạn là biên tập viên tài chính của một ứng dụng cho nhà đầu tư cá nhân người Việt (cổ phiếu, ETF, chứng chỉ quỹ, trái phiếu, gửi tiết kiệm, vàng, ngoại tệ). Bạn đọc nhanh danh sách tin vừa lấy từ báo (tiêu đề + tóm tắt), quyết định tin nào đáng đưa vào ứng dụng và gắn nhãn cho tin được giữ.

Với mỗi tin (định danh bằng "i"):
- relevant: true chỉ khi tin thực sự ảnh hưởng, hoặc cần để hiểu, quyết định mua / bán / giữ / gửi tiết kiệm của nhà đầu tư cá nhân Việt Nam. Tự hỏi: "Người đang đầu tư có cần biết tin này để hành động hoặc để hiểu vì sao giá thay đổi không?". Phân vân thì false: ứng dụng thà thiếu một tin nhỏ còn hơn đầy tin rác.
  Giữ (true):
  · Doanh nghiệp niêm yết: kết quả kinh doanh, báo cáo tài chính, cổ tức, phát hành, mua bán sáp nhập, giao dịch của cổ đông lớn / người nội bộ, thay lãnh đạo chủ chốt, dự án hoặc hợp đồng đủ lớn để ảnh hưởng doanh thu, kế hoạch kinh doanh, bị xử phạt, điều tra, huỷ niêm yết, xếp hạng tín nhiệm. Tiêu đề giấu tên ("một công ty dầu khí lãi tăng 143%", "một ngân hàng giảm 80% lợi nhuận", "doanh nghiệp trên sàn") vẫn là tin doanh nghiệp: giữ.
  · Thị trường chứng khoán: diễn biến chỉ số, thanh khoản, khối ngoại, tự doanh, giao dịch lớn ở một cổ phiếu, nhận định có số liệu, IPO / niêm yết, quy định mới của Uỷ ban Chứng khoán / sở giao dịch, nâng hạng, margin.
  · Vĩ mô, chính sách: lãi suất điều hành / huy động / cho vay, tỷ giá, CPI, GDP, tín dụng, FDI, xuất nhập khẩu, đầu tư công, thuế phí và chính sách ảnh hưởng doanh nghiệp, ngành hoặc nhà đầu tư.
  · Bất động sản: số liệu thị trường (giá, nguồn cung, giao dịch, doanh nghiệp giải thể, tín dụng bất động sản) và luật / dự thảo luật về đất đai, nhà ở, thuế bất động sản. Thủ tục giấy tờ của từng hộ dân, một dự án hạ tầng địa phương không gắn doanh nghiệp niêm yết thì loại.
  · Vàng, hàng hoá: giá vàng trong nước / thế giới; dầu, thép, phân bón, nông sản… khi ảnh hưởng giá tài sản hoặc ngành có doanh nghiệp niêm yết.
  · Quốc tế: Fed và ngân hàng trung ương lớn, số liệu kinh tế Mỹ / Trung Quốc, chứng khoán thế giới biến động đáng kể, thuế quan, thương mại, trừng phạt.
  · Xung đột, chiến sự: giữ khi tin nhắc tới dầu mỏ, khí đốt, eo biển / tuyến vận tải, trừng phạt, phản ứng của thị trường, hoặc khi có nguy cơ chiến tranh mới / leo thang lớn (một nước lớn sắp tấn công, đóng eo biển) hay đàm phán có thể chấm dứt một xung đột lớn; loại diễn biến chiến trường hằng ngày, vũ khí, phát biểu chính trị.
  Loại (false):
  · Xã hội, hình sự, tai nạn, lừa đảo lẻ tẻ, giáo dục, y tế, đời sống, giải trí, thể thao, du lịch, chuyện lạ, khoa học công nghệ cho vui, lịch sử.
  · Chính trị, quân sự, ngoại giao, bầu cử, nhân sự và sắp xếp bộ máy hành chính không kèm tác động kinh tế cụ thể; phát biểu chung chung.
${COMMON_DROPS}
  · Chuyện nghề, chuyện nội bộ công ty không ảnh hưởng kết quả kinh doanh; doanh nghiệp nhỏ chưa niêm yết không ảnh hưởng tới ngành.
  Tin bị loại: tickers [], macroScore 0, topic "khac", impact "".
- tickers: các mã cổ phiếu niêm yết tại Việt Nam (HOSE/HNX/UPCoM) mà tin nói đến trực tiếp, kể cả khi bài chỉ ghi tên doanh nghiệp (ví dụ "Hòa Phát" → HPG, "Vietcombank" → VCB, "Thế Giới Di Động" → MWG). Chỉ ghi mã khi chắc chắn; tin chung về ngành hoặc thị trường thì để mảng rỗng.
- macroScore: 0 nếu không phải tin vĩ mô / địa chính trị (tin một doanh nghiệp, tin thị trường thường ngày). Với tin vĩ mô hoặc địa chính trị, chấm 1–5 theo mức ảnh hưởng tới thị trường tài chính và nhà đầu tư cá nhân Việt Nam:
  5 = thay đổi lãi suất điều hành, tỷ giá trung tâm, chính sách tiền tệ/thuế lớn, quyết định nâng hạng thị trường; Fed hoặc ngân hàng trung ương lớn đổi lãi suất; chiến tranh/xung đột mới bùng phát hoặc leo thang mạnh; áp thuế, trừng phạt, cấm vận giữa các nền kinh tế lớn; gián đoạn nguồn cung năng lượng hoặc tuyến vận tải chiến lược (eo biển, kênh đào).
  4 = số liệu vĩ mô quan trọng (CPI, GDP, tín dụng, dòng vốn ngoại lớn); chính sách mới có hiệu lực sớm; tuyên bố hoặc đàm phán của lãnh đạo các nền kinh tế lớn có thể làm thay đổi thương mại, giá dầu, vàng, tỷ giá; diễn biến đáng kể của xung đột đang diễn ra.
  3 trở xuống = tin vĩ mô hoặc quốc tế thông thường, bình luận, dự báo, phát ngôn không kèm hành động cụ thể.
  Chấm theo sự kiện và tác động kinh tế, không theo việc ai là người phát biểu.
- topic: lai_suat | ty_gia | chinh_sach | thue | vang | dia_chinh_tri | thuong_mai | nang_luong | thi_truong | doanh_nghiep | khac.
- impact: một câu ngắn (tối đa 30 từ) nói tin này có thể tác động gì tới thị trường hoặc nhà đầu tư (ví dụ giá dầu, vàng, tỷ giá, dòng vốn, nhóm ngành nào ở Việt Nam). Chỉ dựa vào nội dung tin, không bịa số liệu.`;

export const COIN_REVIEW_PROMPT = `Bạn là biên tập viên tin coin của một ứng dụng cho nhà đầu tư cá nhân người Việt. Bạn đọc nhanh danh sách tin (tiếng Việt hoặc tiếng Anh, tiêu đề + tóm tắt) từ Coin68, CoinDesk, Cointelegraph và Binance News, quyết định tin nào đáng đưa vào ứng dụng.

Với mỗi tin (định danh bằng "i"):
- relevant: true chỉ khi tin thực sự ảnh hưởng, hoặc cần để hiểu, quyết định mua / bán / giữ coin của nhà đầu tư cá nhân. Phân vân thì false: ứng dụng thà thiếu một tin nhỏ còn hơn đầy tin rác.
  Giữ (true):
  · Bài thị trường nói vì sao BTC, ETH và các coin lớn tăng / giảm (Fed, dầu, chứng khoán, dòng tiền ETF…) hoặc điều cần theo dõi trong tuần; dữ liệu phái sinh / on-chain đáng kể (thanh lý lớn, dòng tiền vào ra sàn, dự trữ của tổ chức).
  · Quỹ ETF coin, dòng tiền tổ chức; doanh nghiệp nắm nhiều coin (Strategy, MARA…) mua, bán hoặc dừng mua.
  · Luật, quy định, thuế về crypto ở Việt Nam và các nền kinh tế lớn; cơ quan quản lý phê duyệt, khởi kiện, xử phạt.
  · Sàn lớn (Binance, Coinbase, OKX…) bị hack, mất khả năng thanh toán, ngừng hoặc tạm dừng nạp / rút một mạng lớn; niêm yết / huỷ niêm yết trên sàn lớn; stablecoin lớn mất neo.
  · Nâng cấp mạng lớn, sự cố mạng, mở khoá lượng token lớn của coin lớn.
  · Fed, lãi suất, số liệu kinh tế Mỹ, sự kiện vĩ mô có tác động rõ tới thị trường coin.
  Loại (false):
  · Dự đoán giá đoán mò ("coin X có thể tăng 10 lần"), phân tích kỹ thuật chung chung, tin pump của memecoin / coin nhỏ.
  · Airdrop, giới thiệu dự án nhỏ, NFT, game, sự kiện cộng đồng, gọi vốn nhỏ.
${COMMON_DROPS}
  · Tin chỉ lặp lại giá vài phút qua mà không có nguyên nhân hay ý nghĩa.`;

export const STOCK_REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          i: { type: 'integer' },
          relevant: { type: 'boolean' },
          tickers: { type: 'array', items: { type: 'string' } },
          macroScore: { type: 'integer' },
          topic: { type: 'string' },
          impact: { type: 'string' },
        },
        required: ['i', 'relevant', 'tickers', 'macroScore', 'topic', 'impact'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

export const COIN_REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { i: { type: 'integer' }, relevant: { type: 'boolean' } },
        required: ['i', 'relevant'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

export interface StockVerdict {
  i: number;
  relevant: boolean;
  tickers: string[];
  macroScore: number;
  topic: string;
  impact: string;
}

export interface CoinVerdict {
  i: number;
  relevant: boolean;
}

/** Nội dung gửi AI: chỉ phần chữ cần để quyết định */
export const reviewInput = (batch: ReviewItem[]) =>
  JSON.stringify(
    batch.map((n, i) => ({
      i,
      title: n.title,
      summary: n.summary.slice(0, 300),
      source: n.source,
      category: n.category,
    })),
  );

/** Thông báo chính thức của Binance: người giữ coin cần biết, luôn giữ */
export const isNotice = (n: Pick<ReviewItem, 'source'>) => n.source === BINANCE_NOTICE_SOURCE;

type Row = Prisma.NewsTagCreateManyInput;

const base = (n: ReviewItem, relevant: boolean): Row => ({
  url: n.url,
  title: n.title,
  kind: n.kind,
  relevant,
  tickers: [],
  macroScore: 0,
  topic: null,
  impact: null,
  publishedAt: new Date(n.publishedAt),
});

/** Kết luận của AI cho một tin chứng khoán → dòng NewsTag; tin bị loại không giữ nhãn nào (không lọt vào cảnh báo) */
export function stockRow(n: ReviewItem, v: StockVerdict): Row {
  if (v.relevant !== true) return base(n, false);
  return {
    ...base(n, true),
    tickers: [...new Set((v.tickers ?? []).map((t) => String(t).toUpperCase().trim()))].filter((t) =>
      /^[A-Z0-9]{3}$/.test(t),
    ),
    macroScore: Math.max(0, Math.min(5, Math.round(Number(v.macroScore) || 0))),
    topic: v.topic?.trim() || null,
    impact: v.impact?.trim().slice(0, 300) || null,
  };
}

export const coinRow = (n: ReviewItem, v: CoinVerdict): Row => base(n, v.relevant === true);

/** Thông báo chính thức (giữ) hoặc tin AI bỏ sót nhiều lần (loại) */
export const fixedRow = (n: ReviewItem, relevant: boolean): Row => base(n, relevant);

/** Gộp tin trùng link (cùng một bài có ở cả nguồn chứng khoán và nguồn coin: giữ bản chứng khoán) */
export function uniqueItems(items: ReviewItem[]): ReviewItem[] {
  const byUrl = new Map<string, ReviewItem>();
  for (const n of items) {
    const prev = byUrl.get(n.url);
    if (!prev || (prev.kind === 'coin' && n.kind === 'stock')) byUrl.set(n.url, n);
  }
  return [...byUrl.values()];
}
