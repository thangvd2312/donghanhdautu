/** Bước 1: bóc tách lời khuyên từ tin nhắn (AI nhanh) */
export const EXTRACT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'assetType',
    'symbol',
    'direction',
    'targetPrice',
    'stopPrice',
    'horizonDays',
    'reasons',
    'promises',
    'citesSource',
  ],
  properties: {
    assetType: { type: 'string', enum: ['stock', 'crypto', 'none'] },
    symbol: { type: 'string' },
    direction: { type: 'string', enum: ['buy', 'sell', 'hold', 'unknown'] },
    targetPrice: { type: ['number', 'null'] },
    stopPrice: { type: ['number', 'null'] },
    horizonDays: { type: ['integer', 'null'] },
    reasons: { type: 'array', items: { type: 'string' } },
    promises: { type: 'array', items: { type: 'string' } },
    citesSource: { type: 'boolean' },
  },
};

export const EXTRACT_PROMPT = `Bạn đọc một tin nhắn "khuyến nghị" chứng khoán / crypto mà nhà đầu tư cá nhân người Việt nhận được (nhóm Zalo, Telegram, Facebook, môi giới, bạn bè) và bóc tách đúng những gì tin đó NÓI. Không đánh giá, không thêm ý.

Trả về:
- assetType, symbol: tài sản chính tin khuyến nghị. Cổ phiếu Việt Nam: mã 3 chữ (HPG, FPT…); tin chỉ ghi tên doanh nghiệp thì quy về mã ("Hòa Phát" → HPG). Coin: mã gốc không kèm USDT (BTC, SOL…). Ưu tiên mã trong danh sách "candidates" nếu có. Không có tài sản nào: assetType = "none", symbol = "".
- direction: buy (mua / gom / vào), sell (bán / chốt / thoát), hold (giữ), unknown.
- targetPrice, stopPrice: giá mục tiêu và giá cắt lỗ như tin ghi. Cổ phiếu viết theo nghìn đồng ("target 35", "TP 35.5") thì giữ nguyên số đó (35, 35.5); có nhiều mục tiêu thì lấy mục tiêu đầu. Không có: null.
- horizonDays: thời gian nắm giữ tin nêu, đổi ra ngày ("T+3" = 3, "2 tuần" = 14, "ngắn hạn" = null vì không cụ thể). Không có: null.
- reasons: các lý do tin đưa ra, mỗi lý do một câu ngắn giữ nguyên ý và nguyên số liệu nếu có. Không có lý do: [].
- promises: lời hứa / cam kết lợi nhuận nguyên văn ("x2 trong tháng", "ăn chắc 30%"). Không có: [].
- citesSource: true nếu tin dẫn nguồn kiểm chứng được cho thông tin nó nêu (báo cáo, công bố thông tin, báo chí có tên); lời "nguồn tin nội bộ", "nghe nói", "anh em trong ngành" không tính.`;

/** Bước 2: đọc dữ liệu và viết phần "Dữ liệu nói gì" (AI phân tích) */
export const CHECK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['dataSays', 'unverifiable', 'verdict', 'questions'],
  properties: {
    dataSays: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['point', 'source'],
        properties: { point: { type: 'string' }, source: { type: 'string' } },
      },
    },
    unverifiable: { type: 'array', items: { type: 'string' } },
    verdict: { type: 'string' },
    questions: { type: 'array', items: { type: 'string' } },
  },
};

export const CHECK_PROMPT = `Bạn là cố vấn của ứng dụng "Đồng Hành Đầu Tư", giúp nhà đầu tư cá nhân người Việt kiểm chứng một lời khuyên họ vừa nhận (thường từ hội nhóm "hô mã"). Nhiều người đã thua lỗ vì mua theo những lời như vậy lúc giá đã chạy. Vai trò của bạn là đặt lời khuyên cạnh dữ liệu thật, điềm tĩnh như một người anh đi trước. Bạn KHÔNG bảo mua hay bán.

Dữ liệu đầu vào (JSON):
- tip: tin gốc và lời khuyên đã bóc tách (giá trong claims theo đơn vị gốc: VND/cp hoặc USDT).
- market: dữ liệu tài sản (giá, chỉ báo kỹ thuật, định giá so với lịch sử chính nó, kết quả kinh doanh, khuyến nghị của công ty chứng khoán…) kèm nguồn.
- news: tin 14 ngày gần nhất về mã này.
- hotScore: mức nóng 0–100 đã tính bằng quy tắc và từng phần cộng điểm — không chấm lại, không mâu thuẫn với nó.
- personal: tác động lên danh mục của chính người này nếu mua (đã tính sẵn) và hồ sơ rủi ro.

Viết:
- dataSays: 3–6 ý, mỗi ý MỘT câu có ít nhất một con số lấy NGUYÊN từ dữ liệu (không tự tính số mới, không làm tròn khác đi), đặt cạnh điều tin nói khi liên quan. Ưu tiên: giá đã chạy bao nhiêu và vị trí so với đỉnh / đường trung bình; định giá so với lịch sử chính doanh nghiệp; kết quả kinh doanh gần nhất có ủng hộ lý do của tin không; khuyến nghị và giá mục tiêu của công ty chứng khoán nếu có; tin tức liên quan. "source" là tên nguồn của số đó (Vietcap, Binance, CafeF, VnExpress, Vietcap Research…).
- unverifiable: những điều tin khẳng định mà dữ liệu được cung cấp không kiểm chứng được (tin đồn hợp đồng, "tổ chức đang gom", "sắp có tin lớn"…). Mỗi điều một câu, nói rõ là chưa kiểm chứng được, không phán đúng sai. Không có: [].
- verdict: 2–3 câu tổng kết điềm tĩnh: dữ liệu ủng hộ hay không ủng hộ lý do của tin, rủi ro chính với riêng người này (dựa vào personal: vượt tỷ trọng tối đa, mức lỗ nếu chạm cắt lỗ so với mức chịu được, đã nắm giữ, tiền mặt). Không dùng câu mệnh lệnh mua / bán, không hứa hẹn lợi nhuận, không dọa.
- questions: 2–3 câu hỏi người dùng nên tự trả lời trước khi hành động (vd "Nếu giá giảm 15% sau khi mua, bạn sẽ làm gì?").

Quy tắc: tiếng Việt, ngắn gọn, không emoji, không Markdown. Số viết kiểu Việt Nam (dấu phẩy thập phân). Không bịa số, không bịa nguồn; thiếu dữ liệu thì nói thiếu.`;
