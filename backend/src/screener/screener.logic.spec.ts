import { CRITERIA } from './screener.catalog';
import {
  DEFAULT_SORT,
  Filter,
  ScreenerInputError,
  cacheKey,
  inRange,
  mapRow,
  toVietcapFilters,
  toVietcapRequest,
  validateFilters,
  validateSort,
} from './screener.logic';

const bad = (raw: unknown) => () => validateFilters(raw);

describe('validateFilters', () => {
  it('chấp nhận khoảng chỉ có min hoặc chỉ có max và sắp theo danh mục', () => {
    expect(
      validateFilters([
        { key: 'roe', min: 15 },
        { key: 'pe', max: 10 },
      ]),
    ).toEqual([
      { key: 'pe', max: 10 },
      { key: 'roe', min: 15 },
    ]);
  });

  it('từ chối tiêu chí lạ, lặp, hoặc sai dạng', () => {
    expect(bad([{ key: 'xyz', min: 1 }])).toThrow('Tiêu chí lọc không tồn tại: xyz');
    expect(
      bad([
        { key: 'pe', min: 1 },
        { key: 'pe', max: 5 },
      ]),
    ).toThrow('bị lặp');
    expect(bad('pe')).toThrow(ScreenerInputError);
    expect(bad([{ min: 1 }])).toThrow(ScreenerInputError);
  });

  it('từ chối min > max, thiếu cả hai, không phải số', () => {
    expect(bad([{ key: 'pe', min: 20, max: 10 }])).toThrow('không được lớn hơn');
    expect(bad([{ key: 'pe' }])).toThrow('nhập giá trị');
    expect(bad([{ key: 'pe', min: '5' }])).toThrow('phải là số');
    expect(bad([{ key: 'pe', min: NaN }])).toThrow('phải là số');
  });

  it('từ chối giá trị ngoài khoảng của tiêu chí', () => {
    expect(bad([{ key: 'pe', max: 101 }])).toThrow('phải nằm trong khoảng');
    expect(bad([{ key: 'roe', min: -51 }])).toThrow('phải nằm trong khoảng');
  });

  it('kiểm tra tiêu chí chọn nhiều', () => {
    expect(validateFilters([{ key: 'exchange', values: ['HNX', 'HOSE', 'HNX'] }])).toEqual([
      { key: 'exchange', values: ['HNX', 'HOSE'] },
    ]);
    expect(bad([{ key: 'exchange', values: [] }])).toThrow('ít nhất một');
    expect(bad([{ key: 'exchange' }])).toThrow('ít nhất một');
    expect(bad([{ key: 'exchange', values: ['NYSE'] }])).toThrow('Giá trị không hợp lệ');
    expect(bad([{ key: 'sector', values: ['9999'] }])).toThrow('Giá trị không hợp lệ');
    expect(validateFilters([{ key: 'sector', values: ['8301'] }])).toHaveLength(1);
  });

  it('kiểu khoảng/chọn nhiều không lẫn nhau', () => {
    expect(bad([{ key: 'exchange', min: 1 }])).toThrow('ít nhất một');
    expect(bad([{ key: 'pe', values: ['1'] }])).toThrow('nhập giá trị');
  });

  it('không có điều kiện thì trả mảng rỗng', () => {
    expect(validateFilters(undefined)).toEqual([]);
    expect(validateFilters([])).toEqual([]);
  });
});

describe('validateSort', () => {
  it('mặc định vốn hoá giảm dần', () => {
    expect(validateSort(undefined, [])).toEqual(DEFAULT_SORT);
  });
  it('nhận các khóa giao diện gửi', () => {
    for (const key of ['marketCap', 'adtv', 'pe', 'pb', 'roe', 'profitGrowth']) {
      expect(validateSort({ key, dir: 'asc' }, [])).toEqual({ key, dir: 'asc' });
    }
  });
  it('từ chối khóa lạ, chiều sai, ngành/sàn, và cổ tức khi không lọc cổ tức', () => {
    expect(() => validateSort({ key: 'abc', dir: 'asc' }, [])).toThrow(ScreenerInputError);
    expect(() => validateSort({ key: 'pe', dir: 'up' }, [])).toThrow(ScreenerInputError);
    expect(() => validateSort({ key: 'exchange', dir: 'asc' }, [])).toThrow(ScreenerInputError);
    expect(() => validateSort({ key: 'dividendYield', dir: 'desc' }, [])).toThrow(ScreenerInputError);
    expect(validateSort({ key: 'dividendYield', dir: 'desc' }, [{ key: 'dividendYield', min: 3 }])).toEqual({
      key: 'dividendYield',
      dir: 'desc',
    });
  });
});

describe('toVietcapFilters', () => {
  const sort = DEFAULT_SORT;
  it('đổi tỷ ₫ sang VND, giữ ₫ và % nguyên, kèm kỳ mặc định', () => {
    const f: Filter[] = [
      { key: 'marketCap', min: 10000 },
      { key: 'adtv', min: 50, max: 200 },
      { key: 'price', max: 20000 },
      { key: 'roe', min: 15 },
      { key: 'profitGrowth', min: 20 },
    ];
    expect(toVietcapFilters(f, sort)).toEqual([
      { name: 'marketCap', conditionOptions: [{ type: 'range', from: 10_000e9 }] },
      { name: 'adtv', extraName: '30Days', conditionOptions: [{ type: 'range', from: 50e9, to: 200e9 }] },
      { name: 'marketPrice', conditionOptions: [{ type: 'range', to: 20000 }] },
      { name: 'ttmRoe', conditionOptions: [{ type: 'range', from: 15 }] },
      { name: 'npatmiGrowth', extraName: 'Yoy', extraName2: 'Qm1', conditionOptions: [{ type: 'range', from: 20 }] },
    ]);
  });
  it('P/E luôn có chặn dưới dương để loại mã lỗ và mã không có số liệu', () => {
    expect(toVietcapFilters([{ key: 'pe', max: 10 }], sort)[0].conditionOptions).toEqual([
      { type: 'range', from: 0.01, to: 10 },
    ]);
    expect(toVietcapFilters([{ key: 'pb', min: 0.5 }], sort)[0].conditionOptions).toEqual([
      { type: 'range', from: 0.5 },
    ]);
  });
  it('sắp xếp theo P/E thêm chặn dưới dù chưa lọc', () => {
    expect(toVietcapFilters([], { key: 'pe', dir: 'asc' })).toEqual([
      { name: 'ttmPe', conditionOptions: [{ type: 'range', from: 0.01 }] },
    ]);
  });
  it('chọn nhiều: sàn viết thường, ngành giữ mã ICB; bỏ cổ tức', () => {
    const f: Filter[] = [
      { key: 'exchange', values: ['HOSE', 'HNX'] },
      { key: 'sector', values: ['8301'] },
      { key: 'dividendYield', min: 3 },
    ];
    expect(toVietcapFilters(f, sort)).toEqual([
      {
        name: 'exchange',
        conditionOptions: [
          { type: 'value', value: 'hsx' },
          { type: 'value', value: 'hnx' },
        ],
      },
      { name: 'sectorLv1', conditionOptions: [{ type: 'value', value: '8301' }] },
    ]);
  });
  it('yêu cầu phân trang theo trang 0 của nguồn và trường sắp xếp', () => {
    const req = toVietcapRequest([], { key: 'adtv', dir: 'asc' }, 2, 20);
    expect(req).toMatchObject({ page: 2, pageSize: 20, sortFields: ['adtv30Days'], sortOrders: ['ASC'] });
  });
});

describe('mapRow', () => {
  const row = {
    ticker: 'FPT',
    exchange: 'HSX',
    viOrganShortName: 'FPT',
    marketPrice: 57400,
    marketCap: 108_240_766_995_200,
    dailyPriceChangePercent: 0.123456,
    ttmPe: 10.7815906805,
    ttmRoe: 26.47472033,
  };
  it('values chỉ gồm chỉ tiêu đang lọc + vốn hoá + giá trị giao dịch (null khi nguồn không trả)', () => {
    const item = mapRow(
      row,
      [
        { key: 'pe', max: 10 },
        { key: 'roe', min: 15 },
        { key: 'exchange', values: ['HOSE'] },
      ],
      DEFAULT_SORT,
    );
    expect(item).toEqual({
      symbol: 'FPT',
      name: 'FPT',
      exchange: 'HOSE',
      price: 57400,
      changePct: 0.12,
      values: { marketCap: 108240.77, adtv: null, pe: 10.78, roe: 26.47 },
    });
  });
  it('có adtv khi lọc theo adtv, và cổ tức khi truyền vào', () => {
    const item = mapRow(
      { ...row, adtv30Days: 376_527_921_653 },
      [
        { key: 'adtv', min: 10 },
        { key: 'dividendYield', min: 1 },
      ],
      DEFAULT_SORT,
      3.456,
    );
    expect(item.values).toEqual({ marketCap: 108240.77, adtv: 376.53, dividendYield: 3.46 });
  });
  it('thiếu dữ liệu thì null, không phải 0', () => {
    expect(mapRow({ ticker: 'X', exchange: 'UPCOM' }, [{ key: 'roe', min: 1 }], DEFAULT_SORT)).toMatchObject({
      price: null,
      changePct: null,
      name: null,
      values: { marketCap: null, roe: null },
    });
  });
});

describe('inRange / cacheKey', () => {
  it('khoảng mở hai đầu và null', () => {
    expect(inRange(3, { key: 'dividendYield', min: 3 })).toBe(true);
    expect(inRange(2.9, { key: 'dividendYield', min: 3 })).toBe(false);
    expect(inRange(10, { key: 'dividendYield', max: 5 })).toBe(false);
    expect(inRange(null, { key: 'dividendYield', min: 0 })).toBe(false);
  });
  it('khóa cache đổi khi trang đổi', () => {
    expect(cacheKey([], DEFAULT_SORT, 1, 20)).not.toEqual(cacheKey([], DEFAULT_SORT, 2, 20));
  });
});

describe('danh mục', () => {
  it('nhóm và đơn vị nằm trong tập cho phép; khoảng có min/max/step', () => {
    for (const c of CRITERIA) {
      expect(['Cơ bản', 'Định giá', 'Hiệu quả', 'Tăng trưởng', 'Cổ tức']).toContain(c.group);
      expect(['₫', 'tỷ ₫', '%', 'x', null]).toContain(c.unit);
      if (c.type === 'range') expect([c.min, c.max, c.step].every((n) => typeof n === 'number')).toBe(true);
      expect(c.hint.length).toBeGreaterThan(10);
    }
  });
});
