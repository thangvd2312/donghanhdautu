import type Anthropic from '@anthropic-ai/sdk';
import { missingToolResults } from './history';
import { estimateCost } from './pricing';

describe('estimateCost', () => {
  it('tính theo giá từng loại token', () => {
    // Opus 5.5: 1M input $4 + 100K output $2 + 1M cache đọc $0,2 + 100K cache ghi $0,5
    const cost = estimateCost('claude-opus-5-5', {
      input_tokens: 1_000_000,
      output_tokens: 100_000,
      cache_read_input_tokens: 1_000_000,
      cache_creation_input_tokens: 100_000,
    });
    expect(cost).toBeCloseTo(6.7);
  });

  it('model chưa có giá hoặc thiếu usage: không rõ (null), không phải 0', () => {
    expect(estimateCost('MiniMax-M2', { input_tokens: 10, output_tokens: 10 })).toBeNull();
    expect(estimateCost('claude-opus-5-5', null)).toBeNull();
    expect(estimateCost('claude-opus-5-5', { input_tokens: 10 })).toBeNull();
  });
});

describe('missingToolResults', () => {
  const user: Anthropic.Beta.BetaMessageParam = { role: 'user', content: [{ type: 'text', text: 'FPT?' }] };
  const toolCall: Anthropic.Beta.BetaMessageParam = {
    role: 'assistant',
    content: [
      { type: 'text', text: 'Để tôi xem' },
      { type: 'tool_use', id: 'tu_1', name: 'get_stock', input: { symbol: 'FPT' } },
    ],
  };

  it('lượt trước dừng giữa lúc chạy công cụ: trả kết quả lỗi cho đúng từng tool_use', () => {
    expect(missingToolResults([user, toolCall])).toEqual([
      expect.objectContaining({ type: 'tool_result', tool_use_id: 'tu_1', is_error: true }),
    ]);
  });

  it('lịch sử hợp lệ thì không cần nối thêm', () => {
    const done: Anthropic.Beta.BetaMessageParam = {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: '{}' }],
    };
    const answer: Anthropic.Beta.BetaMessageParam = { role: 'assistant', content: [{ type: 'text', text: 'OK' }] };
    expect(missingToolResults([user, toolCall, done, answer])).toBeNull();
    expect(missingToolResults([])).toBeNull();
  });
});
