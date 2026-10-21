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

  it('số làm tròn theo độ chính xác hiển thị vẫn khớp; số âm khớp khi văn bản nói giảm', () => {
    expect(unmatchedNumbers('Tài sản đạt khoảng 112,3 triệu, lãi 2 triệu (1,9%). FPT giảm 3,4%.', data)).toEqual([]);
  });

  it('số AI tự bịa ra thì bị báo', () => {
    expect(unmatchedNumbers('Lãi tuần này 5 triệu, FPT giảm 7%.', data)).toEqual(['5 triệu', '7%']);
  });
});

describe('unmatchedNumbers: dấu, loại số, tài sản', () => {
  const loss = {
    numbersTable:
      '| Lãi / lỗ trong tuần | **−1.000.000 ₫** (−1,2%) |\n| FPT | −3,4% | −2 triệu |\n| VNM | +5% | +3 triệu |',
    week: {
      profit: -1_000_000,
      returnPct: -1.2,
      assets: [
        { name: 'FPT', priceChangePct: -3.4, priceEffect: -2_000_000 },
        { name: 'VNM', priceChangePct: 5, priceEffect: 3_000_000 },
      ],
    },
  };

  it('lỗ viết thành lãi bị báo (cả khi có +, cả khi chỉ có chữ "lãi")', () => {
    expect(unmatchedNumbers('Danh mục lãi +1 triệu đồng.', { week: { profit: -1_000_000 } })).toEqual(['+1 triệu']);
    expect(unmatchedNumbers('Danh mục lãi 1 triệu đồng.', { week: { profit: -1_000_000 } })).toEqual(['1 triệu']);
    expect(unmatchedNumbers('Danh mục lãi 1 triệu đồng.', loss)).toEqual(['1 triệu']);
  });

  it('dấu đúng thì không báo (lỗ / giảm / − với số âm, lãi / tăng / + với số dương)', () => {
    expect(unmatchedNumbers('Danh mục lỗ 1 triệu (−1,2%).', loss)).toEqual([]);
    expect(unmatchedNumbers('FPT giảm 3,4%, VNM tăng 5%.', loss)).toEqual([]);
    expect(unmatchedNumbers('Danh mục lãi +1 triệu đồng.', { week: { profit: 1_000_000 } })).toEqual([]);
  });

  it('giảm viết thành tăng và ngược lại bị báo; "tăng lên X" là mức đạt tới, không bị coi là dấu', () => {
    expect(unmatchedNumbers('FPT tăng 3,4%.', loss)).toEqual(['3,4%']);
    expect(unmatchedNumbers('VNM giảm 5%.', loss)).toEqual(['5%']);
    expect(unmatchedNumbers('Tổng tài sản tăng lên 112 triệu.', { endValue: 112_000_000 })).toEqual([]);
  });

  it('mức giảm tối đa lưu dạng dương vẫn khớp "giảm"', () => {
    expect(unmatchedNumbers('Bạn chấp nhận giảm tối đa 20%.', { investor: { maxDrawdownPct: 20 } })).toEqual([]);
  });

  it('% đổi thành tiền hoặc tiền đổi thành % bị báo', () => {
    const d = { week: { profit: 2, returnPct: 5 } };
    expect(unmatchedNumbers('Lãi 2%.', d)).toEqual(['2%']);
    expect(unmatchedNumbers('Lãi 50 ₫.', { week: { profit: 2, returnPct: 50 } })).toEqual(['50']);
    expect(unmatchedNumbers('Lãi 2.000.000%.', { week: { profit: 2_000_000 } })).toEqual(['2.000.000%']);
  });

  it('số của tài sản A gán cho tài sản B bị báo', () => {
    expect(unmatchedNumbers('VNM giảm 3,4%.', loss)).toEqual(['3,4%']);
    expect(unmatchedNumbers('FPT tăng 5%.', loss)).toEqual(['5%']);
    expect(unmatchedNumbers('VNM đóng góp +2 triệu.', loss)).toEqual(['+2 triệu']);
    // Cùng một câu nói về hai tài sản: mỗi số gắn với tài sản nhắc ngay trước nó
    expect(unmatchedNumbers('FPT giảm 3,4% và VNM tăng 5%.', loss)).toEqual([]);
    expect(unmatchedNumbers('FPT giảm 5% và VNM tăng 3,4%.', loss)).toEqual(['5%', '3,4%']);
  });

  it('số của cả danh mục gán cho một tài sản bị báo, nhưng nói về tổng sau khi nhắc tài sản thì không', () => {
    expect(unmatchedNumbers('FPT lỗ 1,2%.', loss)).toEqual(['1,2%']);
    expect(unmatchedNumbers('Dù VNM tăng, tổng danh mục lỗ 1,2%.', loss)).toEqual([]);
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

describe('writeChecked: đảo dấu', () => {
  it('lần viết đầu đảo lỗ thành lãi thì viết lại, nêu đúng số sai', async () => {
    const data = { week: { profit: -1_000_000 } };
    const write = jest
      .fn()
      .mockResolvedValueOnce({ markdown: 'Danh mục lãi +1 triệu.' })
      .mockResolvedValueOnce({ markdown: 'Danh mục lỗ 1 triệu.' });
    const r = await writeChecked(data, write);
    expect(r).toEqual({ result: { markdown: 'Danh mục lỗ 1 triệu.' }, unmatched: [] });
    expect(write).toHaveBeenNthCalledWith(2, expect.stringContaining('+1 triệu'));
  });

  it('hai lần đều đảo dấu thì trả về số còn sai (nơi gọi bỏ nhận định)', async () => {
    const write = jest.fn(() => Promise.resolve({ markdown: 'Danh mục lãi +1 triệu.' }));
    expect((await writeChecked({ week: { profit: -1_000_000 } }, write)).unmatched).toEqual(['+1 triệu']);
  });
});
