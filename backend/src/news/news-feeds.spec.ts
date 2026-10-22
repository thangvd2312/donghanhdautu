import type { NewsItem } from '@dautu/contracts';
import { parseFeed, searchNews } from './news-feeds';

const feed = { url: 'u', source: 'Src', category: 'Cat' };

describe('parseFeed', () => {
  it('maps items, strips markup and drops items without title or link', () => {
    const xml = `<rss><channel>
      <item><title><![CDATA[FPT &amp; VCB]]></title><link> https://x/1 </link><description><![CDATA[<b>hi</b> there &amp; more]]></description><pubDate>Wed, 01 Jan 2025 00:00:00 GMT</pubDate></item>
      <item><title>no link</title></item>
    </channel></rss>`;
    expect(parseFeed(xml, feed)).toEqual([
      {
        title: 'FPT & VCB',
        url: 'https://x/1',
        summary: 'hi there & more',
        source: 'Src',
        category: 'Cat',
        publishedAt: '2025-01-01T00:00:00.000Z',
      },
    ]);
  });

  it('accepts a feed with a single item', () => {
    const xml = '<rss><channel><item><title>A</title><link>l</link></item></channel></rss>';
    expect(parseFeed(xml, feed)).toHaveLength(1);
  });
});

describe('searchNews', () => {
  const item = (title: string, publishedAt: string): NewsItem => ({
    title,
    url: title,
    summary: '',
    source: 's',
    category: 'c',
    publishedAt,
  });
  const items = [item('fpt tăng', '2025-01-02'), item('fpt vcb', '2025-01-01'), item('khác', '2025-01-03')];

  it('returns the latest items without a query', () => {
    expect(searchNews(items, '  ', 2).map((i) => i.title)).toEqual(['fpt tăng', 'fpt vcb']);
  });

  it('ranks by matched terms, then recency, and ignores 1-letter terms', () => {
    expect(searchNews(items, 'fpt, vcb a', 10).map((i) => i.title)).toEqual(['fpt vcb', 'fpt tăng']);
  });
});
