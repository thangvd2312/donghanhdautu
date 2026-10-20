import { fitEvidence } from './verifier.service';

const ev = (id: string, len: number) => ({ id, tool: 'get_stock_analysis', input: {}, content: 'x'.repeat(len) });

describe('fitEvidence', () => {
  it('giữ nguyên dữ liệu cổ phiếu đầy đủ (~65k ký tự)', () => {
    const [e] = fitEvidence([ev('a', 65_000)]);
    expect(e.content.length).toBe(65_000);
    expect('truncated' in e).toBe(false);
  });
  it('cắt mục quá dài và đánh dấu truncated', () => {
    const [e] = fitEvidence([ev('a', 120_000)]);
    expect(e.content.length).toBe(80_000);
    expect(e).toMatchObject({ truncated: true });
  });
  it('tổng vượt trần thì chia đều giới hạn cho các mục', () => {
    const out = fitEvidence([ev('a', 80_000), ev('b', 80_000), ev('c', 80_000), ev('d', 80_000), ev('e', 80_000)]);
    const total = out.reduce((s, e) => s + e.content.length, 0);
    expect(total).toBeLessThanOrEqual(300_000);
    expect(out.every((e) => 'truncated' in e)).toBe(true);
  });
});
