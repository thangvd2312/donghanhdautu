import type { PlanDetail, PlanReview } from './types'

export const DECISION: Record<PlanReview['decision'], string> = {
  keep: 'Giữ nguyên kế hoạch',
  adjust: 'Điều chỉnh kế hoạch',
  close: 'Kết thúc kế hoạch',
}

/** Câu hỏi gửi cố vấn để đánh giá một kế hoạch dựa trên dữ liệu mới nhất */
export function planAdvisorQuestion(p: PlanDetail): string {
  return `Đánh giá giúp tôi kế hoạch đầu tư ${p.displayName} của tôi dựa trên dữ liệu mới nhất.
Luận điểm của tôi: ${p.thesis}
Điều kiện để xem lại / bán: ${p.exitConditions}
${p.stopPrice != null ? `Mốc cắt lỗ: ${p.stopPrice}. ` : ''}${p.targetPrice != null ? `Mốc chốt lời: ${p.targetPrice}.` : ''}
Với từng điều kiện, cho tôi biết đã xảy ra chưa; tách rõ điều kiện tôi đặt, dữ kiện có nguồn và nhận định của bạn.`
}
