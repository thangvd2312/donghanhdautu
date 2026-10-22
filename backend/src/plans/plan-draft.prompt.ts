export const DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['thesis', 'horizon', 'exitConditions', 'reviewEveryDays', 'targetPrice', 'stopPrice', 'caveat'],
  properties: {
    thesis: { type: 'string' },
    horizon: { type: 'string' },
    exitConditions: { type: 'string' },
    reviewEveryDays: { type: 'integer' },
    targetPrice: { type: ['number', 'null'] },
    stopPrice: { type: ['number', 'null'] },
    caveat: { type: 'string' },
  },
};

export const DRAFT_PROMPT = `Bạn giúp một nhà đầu tư cá nhân người Việt viết BẢN NHÁP kế hoạch đầu tư cho một tài sản. Người dùng sẽ tự sửa và tự quyết định lưu; bạn không quyết định thay họ.

Viết bằng tiếng Việt, ngôi thứ nhất của người dùng ("Tôi mua vì..."), ngắn gọn, cụ thể, kiểm chứng được:
- thesis: 2–4 câu, lý do nắm giữ dựa trên dữ liệu được cung cấp (định giá, kết quả kinh doanh, xu hướng). Không bịa số liệu; chỉ dùng số có trong dữ liệu. Nếu dữ liệu ít, viết luận điểm dạng câu hỏi để người dùng tự điền.
- horizon: thời gian dự định nắm giữ, hợp với khung thời gian trong hồ sơ.
- exitConditions: 2–4 điều kiện cho thấy luận điểm sai hoặc cần xem lại (vd lợi nhuận giảm 2 quý liên tiếp, giá thủng MA200, lỗ vượt mức chịu được). Mỗi điều kiện một dòng bắt đầu bằng "- ".
- reviewEveryDays: chu kỳ xem lại hợp lý (cổ phiếu thường 30–90 ngày theo mùa báo cáo; crypto ngắn hơn).
- stopPrice: nếu có giá vốn hoặc giá hiện tại và mức lỗ tối đa chịu được, đề xuất mốc cắt lỗ = giá vốn (hoặc giá hiện tại nếu chưa mua) × (1 − maxDrawdownPct/100), làm tròn hợp lý; không có thì null.
- targetPrice: chỉ đề xuất khi dữ liệu định giá cho căn cứ rõ; không thì null.
- caveat: 1 câu nêu điều cần người dùng tự kiểm chứng thêm.
Đơn vị giá: cổ phiếu VND/cp, coin USDT, vàng VND/lượng (giá mua vào). Không khuyến nghị mua/bán; đây là khung kế hoạch để người dùng giữ kỷ luật.`;
