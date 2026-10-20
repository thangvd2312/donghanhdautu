/**
 * Bỏ emoji và ký hiệu hình (⚠ ✅ ❌ 📈…) khỏi chữ của AI trước khi hiển thị. Prompt đã cấm nhưng
 * model thỉnh thoảng vẫn dùng — lọc bằng code để giao diện luôn giữ giọng chuyên nghiệp.
 * Giữ nguyên mũi tên chữ (→ ←), dấu toán học và chữ số.
 */
const PICTOGRAPHS = /(?:\p{Emoji_Presentation}|[☀-➿⭐⭕✅❌])️? ?|️/gu;

export function stripEmoji(text: string) {
  return text.replace(PICTOGRAPHS, '');
}
