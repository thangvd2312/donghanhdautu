import {
  HL_END,
  HL_START,
  foldVi,
  queryTerms,
  rangesFromHighlight,
  snippet,
  termRanges,
  toParts,
} from './news-highlight';

const mark = (s: string) => s.replace(/\[/g, HL_START).replace(/\]/g, HL_END);
const show = (parts: { text: string; hit: boolean }[] | undefined) =>
  parts?.map((p) => (p.hit ? `[${p.text}]` : p.text)).join('');

describe('news-highlight', () => {
  it('reads match ranges from a whole-field highlight', () => {
    const text = 'Giảm lãi suất huy động';
    expect(rangesFromHighlight(text, mark('Giảm [lãi] [suất] huy động'))).toEqual([
      { start: 5, end: 8 },
      { start: 9, end: 13 },
    ]);
  });

  it('ignores a highlight whose text differs from the stored text', () => {
    expect(rangesFromHighlight('abc', mark('[ab]x'))).toEqual([]);
  });

  it('joins matches separated only by spaces into one highlighted part', () => {
    const text = 'Giảm lãi suất huy động';
    expect(show(toParts(text, rangesFromHighlight(text, mark('Giảm [lãi] [suất] huy động'))))).toBe(
      'Giảm [lãi suất] huy động',
    );
  });

  it('folds Vietnamese without changing positions (incl. đ and emoji)', () => {
    expect(foldVi('Lãi suất ĐỒNG')).toBe('lai suat dong');
    const s = '📈 Giá vàng';
    expect(foldVi(s)).toHaveLength(s.length);
  });

  it('splits query terms, folds them and drops 1-letter terms', () => {
    expect(queryTerms('  Lãi suất, "VCB" a ')).toEqual(['lai', 'suat', 'vcb']);
    expect(queryTerms(undefined)).toEqual([]);
  });

  it('matches whole words only, with or without accents', () => {
    const text = 'Ngân hàng giảm lãi suất; VCBS tăng';
    expect(show(toParts(text, termRanges(text, ['lai', 'suat'])))).toBe('Ngân hàng giảm [lãi suất]; VCBS tăng');
    expect(termRanges('Ngân hàng', ['an'])).toEqual([]);
    expect(termRanges('VCBS tăng', ['vcb'])).toEqual([]);
    expect(show(toParts('Mã VCB-ACB tăng', termRanges('Mã VCB-ACB tăng', ['vcb'])))).toBe('Mã [VCB]-ACB tăng');
  });

  it('cuts a long summary around the first match at word boundaries', () => {
    const text = `${'mở đầu '.repeat(30)}lãi suất ${'phần sau '.repeat(40)}`.trim();
    const parts = snippet(text, termRanges(text, ['lai']), 120)!;
    const s = show(parts)!;
    expect(s.startsWith('… ')).toBe(true);
    expect(s.endsWith(' …')).toBe(true);
    expect(s).toContain('[lãi]');
    expect(s.length).toBeLessThanOrEqual(126);
  });

  it('returns no snippet without a match and the whole text when short', () => {
    expect(snippet('ngắn', [])).toBeUndefined();
    expect(show(snippet('Fed giữ lãi suất', termRanges('Fed giữ lãi suất', ['fed'])))).toBe('[Fed] giữ lãi suất');
  });
});
