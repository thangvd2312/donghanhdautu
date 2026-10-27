import { toDocs } from './news-docs.service';

describe('toDocs', () => {
  it('adds tags to stock news, coins and notice importance to coin news, stock wins on duplicate url', () => {
    const base = { summary: '', source: 'S', category: 'C', publishedAt: '2026-10-27T01:00:00.000Z' };
    const out = toDocs(
      [{ ...base, title: 'VCB lãi lớn', url: 'u1' }],
      [
        { ...base, title: 'Delist', url: 'u2', lang: 'en', coins: ['abc'], notice: 'delisting' },
        { ...base, title: 'dup', url: 'u1', lang: 'en', coins: [] },
      ],
      new Map([['u1', { tickers: ['vcb'], macroScore: 3 }]]),
    );
    expect(out.find((d) => d.url === 'u1')).toMatchObject({ kind: 'stock', tickers: ['VCB'], importance: 3 });
    expect(out.find((d) => d.url === 'u2')).toMatchObject({ kind: 'coin', tickers: ['ABC'], importance: 4 });
    expect(out).toHaveLength(2);
  });
});
