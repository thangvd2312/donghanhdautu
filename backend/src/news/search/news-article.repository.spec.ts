import { toTsQuery, toTsTitlePhrase } from './news-article.repository';

describe('toTsQuery', () => {
  it('folds accents and requires every word', () => {
    expect(toTsQuery('Lãi suất ĐỒNG')).toBe('lai & suat & dong');
  });

  it('keeps only letters and digits so the query cannot break to_tsquery', () => {
    expect(toTsQuery(`VCB's "tỷ giá" | !x & (y)`)).toBe('vcb & ty & gia');
    expect(toTsQuery('VCB-ACB')).toBe('vcb & acb');
  });

  it('returns null without a usable word', () => {
    expect(toTsQuery('a ! &')).toBeNull();
    expect(toTsQuery(undefined)).toBeNull();
  });
});

describe('toTsTitlePhrase', () => {
  it('builds an adjacent-words query limited to the title weight', () => {
    expect(toTsTitlePhrase('Ngân hàng Nhà nước')).toBe('ngan:A <-> hang:A <-> nha:A <-> nuoc:A');
    expect(toTsTitlePhrase('VCB')).toBeNull();
  });
});
