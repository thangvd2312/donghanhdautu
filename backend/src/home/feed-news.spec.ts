import type { NewsTag } from '@prisma/client';
import type { NewsItem } from '../news/news.service';
import { selectFeedNews } from './feed-news';

const item = (title: string, publishedAt: string): NewsItem => ({
  title,
  url: `https://x/${title}`,
  summary: '',
  source: 's',
  category: 'c',
  publishedAt,
});
const tag = (url: string, over: Partial<NewsTag>) =>
  [url, { url, tickers: [], macroScore: 0, impact: null, topic: null, ...over } as unknown as NewsTag] as const;

describe('selectFeedNews', () => {
  const held = new Set(['FPT']);
  const tickers = ['FPT', 'VCB'];

  it('puts news about held tickers before news about merely watched ones, then newest first', () => {
    const recent = [
      item('a', '2026-03-04T01:00:00Z'),
      item('b', '2026-03-04T02:00:00Z'),
      item('c', '2026-03-04T03:00:00Z'),
    ];
    const tags = new Map([
      tag('https://x/a', { tickers: ['FPT'] }),
      tag('https://x/b', { tickers: ['VCB'] }),
      tag('https://x/c', { tickers: ['VCB'] }),
    ]);
    const { related } = selectFeedNews(recent, tags, tickers, held);
    expect(related.map((n) => n.title)).toEqual(['a', 'c', 'b']);
    expect(related[0]).toMatchObject({ aboutHolding: true, tickers: ['FPT'] });
  });

  it('keeps macro news scored 4+ that is not already related, best score first, at most 3', () => {
    const recent = ['m1', 'm2', 'm3', 'm4', 'rel'].map((t, i) => item(t, `2026-03-04T0${i}:00:00Z`));
    const tags = new Map([
      tag('https://x/m1', { macroScore: 4 }),
      tag('https://x/m2', { macroScore: 5 }),
      tag('https://x/m3', { macroScore: 4 }),
      tag('https://x/m4', { macroScore: 4 }),
      tag('https://x/rel', { macroScore: 5, tickers: ['FPT'] }),
    ]);
    const { related, macro } = selectFeedNews(recent, tags, tickers, held);
    expect(related.map((n) => n.title)).toEqual(['rel']);
    expect(macro.map((n) => n.title)).toEqual(['m2', 'm4', 'm3']);
  });

  it('returns nothing when no ticker is tracked', () => {
    const { related } = selectFeedNews([item('a', '2026-03-04T01:00:00Z')], new Map(), [], new Set());
    expect(related).toEqual([]);
  });
});
