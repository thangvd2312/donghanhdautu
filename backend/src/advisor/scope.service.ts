import { Injectable } from '@nestjs/common';
import { LlmService } from '../alerts/llm.service';
import { TIME_PREFIX } from './advisor-messages';
import { SCOPE_PROMPT } from './prompt';

const SCHEMA = {
  type: 'object',
  properties: {
    scope: { type: 'string', enum: ['in_scope', 'off_topic'] },
    reason: { type: 'string' },
  },
  required: ['scope', 'reason'],
  additionalProperties: false,
};

/** Đoạn hội thoại trước đưa cho bộ lọc: đủ để hiểu câu nối tiếp ("còn mã kia?"), không cần cả câu trả lời dài */
const CONTEXT_CHARS = 800;

/** Câu trả lời cố định cho câu hỏi ngoài phạm vi: không gọi model cố vấn, không dùng công cụ */
export const OFF_TOPIC_REPLY = `Tôi là cố vấn đầu tư và tiết kiệm, nên chỉ trả lời các câu hỏi về tiền của bạn: cổ phiếu, vàng, crypto, chứng chỉ quỹ, gửi tiết kiệm, lãi suất, tỷ giá, danh mục và kế hoạch tài chính cá nhân. Câu này nằm ngoài phạm vi đó nên tôi xin phép không trả lời.

Bạn có thể hỏi tôi, ví dụ:
- Nhận xét danh mục hiện tại của tôi và cho tôi lời khuyên
- Có 100 triệu nhàn rỗi, nên gửi tiết kiệm hay mua vàng lúc này?
- Mỗi tháng tôi nên để dành bao nhiêu và quỹ dự phòng bao nhiêu là đủ?`;

export interface ScopeCheck {
  offTopic: boolean;
  /** Chủ đề bộ lọc nhận ra — lưu kèm lời từ chối để xem lại các trường hợp chặn nhầm */
  reason: string | null;
}

interface StoredMessage {
  role: string;
  content: unknown;
  visible: boolean;
}

/**
 * Lọc chủ đề trước khi gọi model cố vấn (đắt, có tìm web): câu hỏi rõ ràng ngoài đầu tư / tiết kiệm / tài chính
 * cá nhân nhận lời từ chối cố định. Dùng model nhanh; lỗi, chưa cấu hình hoặc không chắc thì cho qua —
 * system prompt của cố vấn vẫn giữ quy tắc phạm vi làm lớp thứ hai.
 */
@Injectable()
export class ScopeGuardService {
  constructor(private llm: LlmService) {}

  async check(message: string, context: string, userId: string): Promise<ScopeCheck> {
    const r = await this.llm.json<{ scope?: string; reason?: string }>({
      tier: 'fast',
      feature: 'scope_check',
      userId,
      system: SCOPE_PROMPT,
      user: JSON.stringify({ context, message }),
      schema: SCHEMA,
      maxTokens: 1000,
    });
    if (r?.scope !== 'off_topic') return { offTopic: false, reason: null };
    return { offTopic: true, reason: r.reason?.trim().slice(0, 200) || null };
  }
}

/** Câu người dùng hỏi gần nhất và đoạn đầu tin trả lời gần nhất của cuộc trò chuyện (đã cắt ngắn) */
export function recentContext(stored: StoredMessage[]): string {
  let question = '';
  let reply = '';
  for (let i = stored.length - 1; i >= 0 && !question; i--) {
    const m = stored[i];
    // visible = false: tool_result và lời nhắc nội bộ (đính chính sau đối chiếu nguồn), không phải lời người dùng
    if (!m.visible || !Array.isArray(m.content)) continue;
    const text = (m.content as { type?: string; text?: string }[])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (!text) continue;
    if (m.role === 'assistant') reply ||= text;
    else question = text.replace(TIME_PREFIX, '');
  }
  return [
    question && `Người dùng hỏi: ${question.slice(0, CONTEXT_CHARS)}`,
    reply && `Cố vấn trả lời: ${reply.slice(0, CONTEXT_CHARS)}`,
  ]
    .filter(Boolean)
    .join('\n');
}
