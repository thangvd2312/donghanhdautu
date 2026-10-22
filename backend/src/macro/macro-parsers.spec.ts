import { parseSbvFx, parseSbvCpi } from './macro-parsers';
import { num, pct2, toDate, toText, vn } from './macro-text';

describe('macro text helpers', () => {
  it('turns markup into plain text and parses Vietnamese numbers and dates', () => {
    expect(toText('<style>x{}</style><p>a&nbsp;b</p>\n<b>c</b>')).toBe(' a b c ');
    expect(num('4,500')).toBe(4.5);
    expect(num('25.123')).toBe(25123);
    expect(vn('4,500')).toBe('4,5');
    expect(vn('4.45')).toBe('4,45');
    expect(pct2(4)).toBe('4,00');
    expect(toDate('16/06/2023')?.toISOString()).toBe('2023-06-16T00:00:00.000Z');
    expect(toDate('x')).toBeNull();
  });
});

describe('macro parsers', () => {
  it('reads the central exchange rate with its document and date', () => {
    const html = '<p>1 Đô la Mỹ = 25.123 VND</p> <p>Số văn bản 123/TB-NHNN Ngày ban hành 01/03/2026</p>';
    expect(parseSbvFx(html)).toEqual([
      expect.objectContaining({
        key: 'vn.fx.central_usd',
        numericValue: 25123,
        asOf: '01/03/2026',
        document: '123/TB-NHNN',
        sane: [15000, 40000],
      }),
    ]);
  });

  it('fails loudly when the page no longer has the expected sentence', () => {
    expect(() => parseSbvFx('<p>trang đã đổi</p>')).toThrow('không thấy tỷ giá trung tâm');
    expect(() => parseSbvCpi('<p>trang đã đổi</p>')).toThrow('không thấy CPI tháng');
  });

  it('reads monthly CPI with the sign of the move', () => {
    const html = '<p>CPI tháng 2/2026 giảm 0,15% so với tháng trước</p>';
    const [mom] = parseSbvCpi(html);
    expect(mom).toMatchObject({ key: 'vn.cpi.mom', numericValue: -0.15, value: '-0,15%', asOf: 'tháng 02/2026' });
  });
});
