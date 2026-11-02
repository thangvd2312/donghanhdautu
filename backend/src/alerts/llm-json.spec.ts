import { parseJsonObject } from './llm.service';

describe('parseJsonObject', () => {
  it('reads the object out of surrounding text', () => {
    expect(parseJsonObject('Đây là kết quả:\n```json\n{"items":[{"i":0}]}\n```')).toEqual({ items: [{ i: 0 }] });
  });

  it('keeps the first complete object when the model prints another one after it', () => {
    const text = '{"items":[{"i":0,"relevant":true}]}\n{"items":[{"i":1,"relevant":false}]}';
    expect(parseJsonObject(text)).toEqual({ items: [{ i: 0, relevant: true }] });
  });

  it('ignores braces and escaped quotes inside strings', () => {
    const text = '{"impact":"giá {dầu} \\"tăng\\" }"} rồi thêm chữ }';
    expect(parseJsonObject(text)).toEqual({ impact: 'giá {dầu} "tăng" }' });
  });

  it('returns null without an object and throws on a cut-off one', () => {
    expect(parseJsonObject('không có gì')).toBeNull();
    expect(() => parseJsonObject('{"items":[{"i":0}')).toThrow();
  });
});
