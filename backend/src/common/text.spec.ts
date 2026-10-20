import { stripEmoji } from './text';

describe('stripEmoji', () => {
  it('bỏ emoji và ký hiệu hình cùng khoảng trắng theo sau', () => {
    expect(stripEmoji('⚠️ Lưu ý: rủi ro')).toBe('Lưu ý: rủi ro');
    expect(stripEmoji('Mua thêm 📈 khi giá về vùng hỗ trợ ✅')).toBe('Mua thêm khi giá về vùng hỗ trợ ');
    expect(stripEmoji('❌ Không nên')).toBe('Không nên');
  });
  it('giữ chữ tiếng Việt, số, mũi tên và dấu toán học', () => {
    const s = 'P/E 10,7 → 12,3 (+15%) ≥ trung vị; lãi suất 4,5%/năm #1 *đậm*';
    expect(stripEmoji(s)).toBe(s);
  });
  it('xử lý ký tự biến thể đứng riêng ở ranh giới chunk khi stream', () => {
    expect(stripEmoji('️ tiếp')).toBe(' tiếp');
  });
});
