import type Anthropic from '@anthropic-ai/sdk';

type Msg = Anthropic.Beta.BetaMessageParam;

/**
 * Lịch sử chat quá dài: không cắt bớt các lượt cũ. Sửa phần đầu lịch sử làm mất hiệu lực các khối thinking đã lưu
 * (model mới từ chối hoặc bỏ qua) và dễ tách rời cặp tool_use / tool_result. Thay vào đó đặt trần kích thước và
 * mời người dùng mở cuộc trò chuyện mới.
 */
export const MAX_HISTORY_CHARS = 600_000;

export function historyChars(messages: Msg[]) {
  return messages.reduce((n, m) => n + JSON.stringify(m.content).length, 0);
}

/**
 * Lượt trước bị huỷ / lỗi giữa lúc chạy công cụ thì tin cuối là assistant có tool_use chưa có tool_result, gửi lên
 * sẽ bị API từ chối. Trả về khối tool_result báo lỗi cần NỐI THÊM vào cuối (không sửa các tin đã có); null nếu hợp lệ.
 */
export function missingToolResults(messages: Msg[]): Anthropic.Beta.BetaToolResultBlockParam[] | null {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant' || typeof last.content === 'string') return null;
  const ids = last.content.filter((b) => b.type === 'tool_use').map((b) => b.id);
  if (!ids.length) return null;
  return ids.map((id) => ({
    type: 'tool_result',
    tool_use_id: id,
    content: 'Lượt trước bị dừng trước khi công cụ chạy xong; không có kết quả.',
    is_error: true,
  }));
}
