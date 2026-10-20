/**
 * Bộ câu hỏi khảo sát khẩu vị rủi ro. Mỗi lựa chọn có điểm 0-4 (trừ các câu chỉ để phân loại).
 * Câu hỏi được dùng chung cho frontend (render) và backend (chấm điểm).
 */
export interface QuizOption {
  value: string;
  label: string;
  score?: number;
}

export interface QuizQuestion {
  id: string;
  question: string;
  hint?: string;
  options: QuizOption[];
}

export const QUIZ: QuizQuestion[] = [
  {
    id: 'goal',
    question: 'Mục tiêu chính của bạn khi đầu tư là gì?',
    options: [
      { value: 'preserve', label: 'Giữ giá trị tài sản, không mất tiền là được', score: 0 },
      { value: 'accumulate', label: 'Tích luỹ tài sản đều đặn trong nhiều năm', score: 2 },
      { value: 'trade', label: 'Kiếm lợi nhuận nhanh từ biến động giá (lướt sóng)', score: 4 },
    ],
  },
  {
    id: 'horizon',
    question: 'Bao lâu nữa bạn có thể cần dùng đến số tiền này?',
    options: [
      { value: 'short', label: 'Dưới 1 năm', score: 0 },
      { value: 'medium', label: 'Từ 1 đến 3 năm', score: 2 },
      { value: 'long', label: 'Trên 3 năm', score: 4 },
    ],
  },
  {
    id: 'drawdown',
    question: 'Danh mục của bạn giảm bao nhiêu thì bạn mất ngủ và muốn bán hết?',
    options: [
      { value: '5', label: 'Giảm 5%', score: 0 },
      { value: '10', label: 'Giảm 10%', score: 1 },
      { value: '20', label: 'Giảm 20%', score: 2 },
      { value: '30', label: 'Giảm 30%', score: 3 },
      { value: '50', label: 'Giảm 50% vẫn bình thường nếu doanh nghiệp còn tốt', score: 4 },
    ],
  },
  {
    id: 'reaction',
    question: 'Một mã bạn đang giữ giảm 15% trong 1 tuần mà không có tin gì. Bạn làm gì?',
    options: [
      { value: 'sell_all', label: 'Bán hết ngay cho an toàn', score: 0 },
      { value: 'sell_some', label: 'Bán bớt một phần', score: 1 },
      { value: 'hold', label: 'Giữ nguyên, xem lại lý do đã mua', score: 3 },
      { value: 'buy_more', label: 'Mua thêm vì giá rẻ hơn', score: 4 },
    ],
  },
  {
    id: 'experience',
    question: 'Kinh nghiệm đầu tư của bạn?',
    options: [
      { value: 'none', label: 'Mới bắt đầu (dưới 1 năm)', score: 0 },
      { value: 'some', label: '1–3 năm', score: 2 },
      { value: 'experienced', label: 'Trên 3 năm, đã qua ít nhất 1 lần thị trường sập', score: 4 },
    ],
  },
  {
    id: 'income_share',
    question: 'Số tiền đầu tư chiếm bao nhiêu trong tổng tài sản của bạn?',
    options: [
      { value: 'most', label: 'Gần như toàn bộ', score: 0 },
      { value: 'half', label: 'Khoảng một nửa', score: 2 },
      { value: 'small', label: 'Một phần nhỏ, mất cũng không ảnh hưởng cuộc sống', score: 4 },
    ],
  },
  {
    id: 'emergency',
    question: 'Bạn đã có quỹ dự phòng (đủ chi tiêu 3–6 tháng) chưa?',
    options: [
      { value: 'no', label: 'Chưa có', score: 0 },
      { value: 'yes', label: 'Có rồi', score: 3 },
    ],
  },
  {
    id: 'margin',
    question: 'Bạn có dùng margin (vay tiền công ty chứng khoán) không?',
    options: [
      { value: 'never', label: 'Không bao giờ', score: 1 },
      { value: 'sometimes', label: 'Thỉnh thoảng', score: 3 },
      { value: 'often', label: 'Thường xuyên', score: 4 },
    ],
  },
  {
    id: 'decision',
    question: 'Bạn thường quyết định mua một mã dựa vào đâu?',
    hint: 'Trả lời thật lòng — câu này giúp cố vấn biết lúc nào cần "kéo tay" bạn lại.',
    options: [
      { value: 'groups', label: 'Theo khuyến nghị của hội nhóm / môi giới / người quen', score: 0 },
      { value: 'news', label: 'Thấy tin tốt hoặc giá đang tăng mạnh', score: 0 },
      { value: 'chart', label: 'Tự xem biểu đồ kỹ thuật', score: 2 },
      { value: 'fundamental', label: 'Tự đọc báo cáo tài chính, định giá doanh nghiệp', score: 2 },
    ],
  },
  {
    id: 'fomo_history',
    question: 'Bạn đã từng mua vội vì sợ lỡ cơ hội rồi bị lỗ chưa?',
    options: [
      { value: 'often', label: 'Nhiều lần', score: 0 },
      { value: 'once', label: 'Một vài lần', score: 1 },
      { value: 'never', label: 'Chưa bao giờ', score: 2 },
    ],
  },
];

export type QuizAnswers = Record<string, string>;

export function scoreQuiz(answers: QuizAnswers) {
  let score = 0;
  let max = 0;
  for (const q of QUIZ) {
    const scores = q.options.map((o) => o.score ?? 0);
    max += Math.max(...scores);
    const picked = q.options.find((o) => o.value === answers[q.id]);
    if (!picked) throw new Error(`Thiếu câu trả lời cho: ${q.question}`);
    score += picked.score ?? 0;
  }
  const riskScore = Math.round((score / max) * 100);
  // Không cho người tầm ngắn hạn / chưa có quỹ dự phòng bị xếp vào nhóm mạo hiểm
  let capped = riskScore;
  if (answers.horizon === 'short' || answers.emergency === 'no') capped = Math.min(capped, 45);
  if (answers.income_share === 'most') capped = Math.min(capped, 55);

  const riskType =
    capped < 30 ? 'conservative' : capped < 55 ? 'balanced' : capped < 75 ? 'growth' : 'aggressive';

  return {
    riskScore: capped,
    riskType,
    goal: answers.goal,
    horizon: answers.horizon,
    maxDrawdownPct: Number(answers.drawdown),
    fomoProne:
      ['groups', 'news'].includes(answers.decision) || ['often', 'once'].includes(answers.fomo_history),
  };
}

export const RISK_TYPE_LABEL: Record<string, string> = {
  conservative: 'Thận trọng',
  balanced: 'Cân bằng',
  growth: 'Tăng trưởng',
  aggressive: 'Mạo hiểm',
};

/** Tỷ trọng tham khảo theo kiểu nhà đầu tư — điểm xuất phát để cố vấn so sánh, không phải chân lý */
export const REFERENCE_ALLOCATION: Record<string, Record<string, number>> = {
  conservative: { 'tiền gửi/tiền mặt': 40, vàng: 25, 'cổ phiếu cơ bản tốt': 30, crypto: 0, 'dự phòng khác': 5 },
  balanced: { 'tiền gửi/tiền mặt': 25, vàng: 15, 'cổ phiếu cơ bản tốt': 55, crypto: 5 },
  growth: { 'tiền gửi/tiền mặt': 15, vàng: 10, 'cổ phiếu': 65, crypto: 10 },
  aggressive: { 'tiền gửi/tiền mặt': 10, vàng: 5, 'cổ phiếu': 65, crypto: 20 },
};
