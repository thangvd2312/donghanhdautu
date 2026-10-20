import {
  autoMapping,
  detectDelimiter,
  dupKey,
  parseCsv,
  parseDate,
  parseNumber,
  rowToDto,
  TEMPLATE_CSV,
} from './csv-import';

describe('parseCsv', () => {
  it('tách cột, ô có ngoặc kép, dấu phẩy và xuống dòng trong ô, BOM, CRLF', () => {
    const rows = parseCsv('﻿a,b,c\r\n1,"x, y","dòng 1\ndòng 2"\r\n"có ""ngoặc""",2,\r\n\r\n');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x, y', 'dòng 1\ndòng 2'],
      ['có "ngoặc"', '2', ''],
    ]);
  });

  it('nhận diện dấu ; của Excel tiếng Việt', () => {
    const text = 'ngay;loai;ma\n05/01/2026;mua;FPT';
    expect(detectDelimiter(text)).toBe(';');
    expect(parseCsv(text)[1]).toEqual(['05/01/2026', 'mua', 'FPT']);
  });
});

describe('parseNumber / parseDate', () => {
  it('đọc số theo dấu thập phân đã chọn', () => {
    expect(parseNumber('1,000,000', '.')).toBe(1_000_000);
    expect(parseNumber('25,500.5', '.')).toBe(25_500.5);
    expect(parseNumber('1.000.000', ',')).toBe(1_000_000);
    expect(parseNumber('0,05', ',')).toBe(0.05);
    expect(parseNumber('95 000 ₫', '.')).toBe(95_000);
    expect(parseNumber('', '.')).toBeNull();
    expect(parseNumber('abc', '.')).toBeNaN();
  });

  it('đọc ngày nhiều dạng, chặn ngày không tồn tại', () => {
    expect(parseDate('2026-01-05')).toBe('2026-01-05');
    expect(parseDate('5/1/2026')).toBe('2026-01-05');
    expect(parseDate('05-01-2026')).toBe('2026-01-05');
    expect(parseDate('31/02/2026')).toBeNull();
    expect(parseDate('2026/01/05')).toBeNull();
  });
});

describe('autoMapping + rowToDto', () => {
  const [headers, ...rows] = parseCsv(TEMPLATE_CSV);
  const mapping = autoMapping(headers);

  it('file mẫu: nhận đủ cột và mọi dòng hợp lệ', () => {
    expect(Object.keys(mapping).sort()).toEqual(
      [
        'amount',
        'assetType',
        'currency',
        'date',
        'fee',
        'fxRate',
        'note',
        'price',
        'quantity',
        'symbol',
        'tax',
        'type',
      ].sort(),
    );
    const parsed = rows.map((r, i) => rowToDto(r, i + 2, mapping, '.'));
    expect(parsed.flatMap((p) => p.errors)).toEqual([]);
    expect(parsed.map((p) => p.dto!.type)).toEqual(['deposit', 'buy', 'sell', 'dividend', 'bonus', 'buy', 'buy']);
    expect(parsed[4].dto).toMatchObject({ type: 'bonus', assetType: 'stock', symbol: 'FPT', quantity: 10 });
    expect(parsed[6].dto).toMatchObject({
      assetType: 'crypto',
      symbol: 'BTC',
      quantity: 0.01,
      currency: 'USDT',
      fxRate: 25500,
    });
  });

  it('tiêu đề tiếng Việt có dấu / tiếng Anh', () => {
    expect(autoMapping(['Ngày giao dịch', 'Loại', 'Mã CK', 'Số lượng', 'Giá'])).toEqual({
      date: 0,
      type: 1,
      symbol: 2,
      quantity: 3,
      price: 4,
    });
    expect(autoMapping(['Date', 'Side', 'Ticker', 'Qty', 'Price', 'Fee'])).toMatchObject({
      date: 0,
      type: 1,
      symbol: 2,
      fee: 5,
    });
  });

  it('báo lỗi rõ ràng theo từng dòng', () => {
    const m = autoMapping(['ngay', 'loai', 'ma', 'so_luong', 'gia', 'tien_te']);
    const r = rowToDto(['32/01/2026', 'đổi', 'FPT', '-5', '', 'EUR'], 7, m, '.');
    expect(r.line).toBe(7);
    expect(r.dto).toBeNull();
    expect(r.errors.join(' | ')).toMatch(/Ngày "32\/01\/2026"/);
    expect(r.errors.join(' | ')).toMatch(/loại giao dịch "đổi"/);
    expect(r.errors.join(' | ')).toMatch(/Số lượng "-5"/);
    expect(r.errors.join(' | ')).toMatch(/Tiền tệ "EUR"/);
  });

  it('mua/bán không ghi loại tài sản thì mặc định cổ phiếu; thiếu giá thì báo', () => {
    const m = autoMapping(['ngay', 'loai', 'ma', 'so_luong', 'gia']);
    expect(rowToDto(['2026-01-05', 'Mua', 'HPG', '100', '25000'], 2, m, '.').dto).toMatchObject({ assetType: 'stock' });
    expect(rowToDto(['2026-01-05', 'Bán', 'HPG', '100', ''], 3, m, '.').errors).toContain('Thiếu giá');
  });

  it('khoá so trùng không phụ thuộc cách viết số', () => {
    const a = dupKey({
      date: '2026-01-05',
      type: 'buy',
      assetType: 'stock',
      symbol: 'FPT',
      quantity: 100,
      price: 95000,
      amount: null,
    });
    const b = dupKey({
      date: '2026-01-05',
      type: 'buy',
      assetType: 'stock',
      symbol: 'FPT',
      quantity: 100.0,
      price: 95000.0,
    });
    expect(a).toBe(b);
  });
});
