import type { LlmService } from '../alerts/llm.service';
import { recentContext, ScopeGuardService } from './scope.service';

const guard = (reply: unknown) => {
  const calls: { user: string; feature: string; tier: string }[] = [];
  const llm = {
    json: (o: { user: string; feature: string; tier: string }) => {
      calls.push(o);
      return Promise.resolve(reply);
    },
  } as unknown as LlmService;
  return { s: new ScopeGuardService(llm), calls };
};

describe('ScopeGuardService.check', () => {
  it('off_topic → chặn, giữ lý do', async () => {
    const { s, calls } = guard({ scope: 'off_topic', reason: 'Viết thơ tình' });
    expect(await s.check('Viết thơ tặng bạn gái', '', 'u1')).toEqual({ offTopic: true, reason: 'Viết thơ tình' });
    expect(calls[0]).toMatchObject({ tier: 'fast', feature: 'scope_check' });
    expect(JSON.parse(calls[0].user)).toEqual({ context: '', message: 'Viết thơ tặng bạn gái' });
  });
  it('in_scope → cho qua', async () => {
    const { s } = guard({ scope: 'in_scope', reason: 'Hỏi về HPG' });
    expect(await s.check('HPG thế nào?', '', 'u1')).toEqual({ offTopic: false, reason: null });
  });
  it('model lỗi / chưa cấu hình (null) → cho qua', async () => {
    const { s } = guard(null);
    expect((await s.check('Bất kỳ', '', 'u1')).offTopic).toBe(false);
  });
  it('kết quả lạ → cho qua', async () => {
    const { s } = guard({ scope: 'OFF_TOPIC' });
    expect((await s.check('Bất kỳ', '', 'u1')).offTopic).toBe(false);
  });
});

const text = (t: string) => [{ type: 'text', text: t }];

describe('recentContext', () => {
  it('cuộc trò chuyện mới → rỗng', () => {
    expect(recentContext([])).toBe('');
  });
  it('lấy câu hỏi gần nhất (bỏ tiền tố thời điểm) và tin trả lời gần nhất, bỏ tin ẩn', () => {
    const ctx = recentContext([
      { role: 'user', content: text('[Thời điểm hiện tại: thứ Sáu, 31/10/2026 09:00]\nCâu cũ'), visible: true },
      { role: 'assistant', content: text('Trả lời cũ'), visible: true },
      {
        role: 'user',
        content: text('[Thời điểm hiện tại: thứ Sáu, 31/10/2026 10:00]\nHPG có nên mua?'),
        visible: true,
      },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'x', input: {} }], visible: true },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{}' }], visible: false },
      { role: 'assistant', content: text('Chờ thêm, vì giá thép giảm.'), visible: true },
      { role: 'user', content: text('[Kiểm tra tự động — không phải tin nhắn của người dùng] …'), visible: false },
      { role: 'assistant', content: text('Đính chính: …'), visible: true },
    ]);
    expect(ctx).toBe('Người dùng hỏi: HPG có nên mua?\nCố vấn trả lời: Đính chính: …');
  });
  it('bản tin / phiếu soi mở đầu cuộc trò chuyện (không có tiền tố thời điểm) vẫn làm ngữ cảnh', () => {
    const ctx = recentContext([
      { role: 'user', content: text('Bản tin sáng 31/10'), visible: true },
      { role: 'assistant', content: text('VN-Index giảm 1%. ' + 'x'.repeat(2000)), visible: true },
    ]);
    expect(ctx.startsWith('Người dùng hỏi: Bản tin sáng 31/10\nCố vấn trả lời: VN-Index giảm 1%.')).toBe(true);
    expect(ctx.length).toBeLessThan(1700);
  });
});
