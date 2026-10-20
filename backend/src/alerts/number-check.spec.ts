import { extractNumbers, unmatchedNumbers, writeChecked } from './number-check';

describe('extractNumbers', () => {
  it('đọc số kiểu Việt: chấm nghìn, phẩy thập phân, đơn vị tỷ / triệu / %', () => {
    const t = extractNumbers('Tổng 1.234.567 ₫, lãi 1,2 tỷ, nạp 300 triệu, FPT +3,4%, phí 15tr');
    expect(t.map((x) => [x.text, x.values[0]])).toEqual([
      ['1.234.567', 1_234_567],
      ['1,2 tỷ', 1.2e9],
      ['300 triệu', 3e8],
      ['+3,4%', 3.4],
      ['15tr', 1.5e7],
    ]);
  });

  it('đơn vị phải là cả từ', () => {
    expect(extractNumbers('có 15 trong số 20 mã').map((x) => x.values[0])).toEqual([15, 20]);
  });

  it('bỏ qua ngày, giờ, năm, số đếm nhỏ, mã có số và link', () => {
    expect(
      extractNumbers('Tuần 18/10 – 24/10/2026 lúc 08:30, năm 2026, 3 việc, chỉ số VN30, [tin](https://x.vn/a-123456)'),
    ).toEqual([]);
  });
});

describe('unmatchedNumbers', () => {
  const data = {
    numbersTable: '| Lãi/lỗ trong tuần | +2.000.000 ₫ (+1,9%) |\n| Tổng tài sản | 112.000.000 ₫ |',
    week: {
      profit: 2_000_000,
      returnPct: 1.9,
      endValue: 112_345_678,
      assets: [{ name: 'FPT', priceChangePct: -3.42 }],
    },
  };

  it('số làm tròn theo độ chính xác hiển thị vẫn khớp; số âm so theo trị tuyệt đối', () => {
    expect(unmatchedNumbers('Tài sản đạt khoảng 112,3 triệu, lãi 2 triệu (1,9%). FPT giảm 3,4%.', data)).toEqual([]);
  });

  it('số AI tự bịa ra thì bị báo', () => {
    expect(unmatchedNumbers('Lãi tuần này 5 triệu, FPT giảm 7%.', data)).toEqual(['5 triệu', '7%']);
  });
});

describe('writeChecked', () => {
  const data = { numbersTable: '| Lãi | +2.000.000 ₫ |' };
  it('đúng ngay lần đầu thì không viết lại', async () => {
    const write = jest.fn(() => Promise.resolve({ markdown: 'Lãi 2 triệu.' }));
    expect(await writeChecked(data, write)).toEqual({ result: { markdown: 'Lãi 2 triệu.' }, unmatched: [] });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('có số lạ thì viết lại một lần, nêu đúng số sai', async () => {
    const write = jest
      .fn()
      .mockResolvedValueOnce({ markdown: 'Lãi 9 triệu.' })
      .mockResolvedValueOnce({ markdown: 'Lãi 2 triệu.' });
    const r = await writeChecked(data, write);
    expect(r.unmatched).toEqual([]);
    expect(write).toHaveBeenLastCalledWith(expect.stringContaining('9 triệu'));
  });

  it('viết lại vẫn sai thì trả về các số không khớp', async () => {
    const write = jest.fn().mockResolvedValue({ markdown: 'Lãi 9 triệu.' });
    expect((await writeChecked(data, write)).unmatched).toEqual(['9 triệu']);
    expect(write).toHaveBeenCalledTimes(2);
  });
});
