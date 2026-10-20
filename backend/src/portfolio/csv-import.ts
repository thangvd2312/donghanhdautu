/**
 * Đọc file CSV giao dịch: tách cột, nhận diện tiêu đề, chuyển từng dòng thành giao dịch.
 * Thuần (không gọi DB / mạng) để test được; kiểm tra mã tài sản và cả sổ nằm ở ImportService.
 */
import type { TransactionDto } from './transactions';
import type { TxType } from './ledger';

export const MAX_ROWS = 1000;
export const MAX_BYTES = 1_000_000;

export const FIELDS = [
  'date',
  'type',
  'assetType',
  'symbol',
  'quantity',
  'price',
  'amount',
  'fee',
  'tax',
  'currency',
  'fxRate',
  'note',
] as const;
export type Field = (typeof FIELDS)[number];
/** field → chỉ số cột (bỏ trống = không có cột) */
export type Mapping = Partial<Record<Field, number>>;

export const FIELD_LABEL: Record<Field, string> = {
  date: 'Ngày',
  type: 'Loại giao dịch',
  assetType: 'Loại tài sản',
  symbol: 'Mã',
  quantity: 'Số lượng',
  price: 'Giá',
  amount: 'Số tiền',
  fee: 'Phí',
  tax: 'Thuế',
  currency: 'Tiền tệ',
  fxRate: 'Tỷ giá',
  note: 'Ghi chú',
};

/** Bỏ dấu tiếng Việt, chữ thường, chỉ giữ chữ số và chữ cái */
export function slug(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const HEADER_ALIASES: Record<Field, string[]> = {
  date: ['ngay', 'ngaygiaodich', 'date', 'tradedate', 'ngaygd'],
  type: ['loai', 'loaigiaodich', 'type', 'side', 'muaban', 'giaodich'],
  assetType: ['loaitaisan', 'taisan', 'assettype', 'asset'],
  symbol: ['ma', 'mack', 'machungkhoan', 'symbol', 'ticker', 'coin', 'maco'],
  quantity: ['soluong', 'kl', 'khoiluong', 'quantity', 'qty', 'volume'],
  price: ['gia', 'giakhop', 'dongia', 'price'],
  amount: ['sotien', 'amount', 'giatri', 'thanhtien'],
  fee: ['phi', 'phigiaodich', 'fee', 'fees', 'commission'],
  tax: ['thue', 'tax', 'thuetncn'],
  currency: ['tiente', 'currency', 'donvitien'],
  fxRate: ['tygia', 'tigia', 'fxrate', 'rate', 'exchangerate'],
  note: ['ghichu', 'note', 'notes', 'memo'],
};

/** Nhận diện cột theo tiêu đề (tiếng Việt có/không dấu hoặc tiếng Anh) */
export function autoMapping(headers: string[]): Mapping {
  const m: Mapping = {};
  headers.forEach((h, i) => {
    const s = slug(h);
    for (const f of FIELDS) {
      if (m[f] === undefined && HEADER_ALIASES[f].includes(s)) {
        m[f] = i;
        break;
      }
    }
  });
  return m;
}

/** Đoán dấu phân cách cột từ dòng tiêu đề: , ; hoặc tab (Excel tiếng Việt hay xuất bằng ;) */
export function detectDelimiter(text: string) {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const counts = [',', ';', '\t'].map((d) => [d, first.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

/** CSV theo RFC 4180: hỗ trợ ô trong ngoặc kép, "" là dấu ngoặc kép, xuống dòng trong ô */
export function parseCsv(input: string, delimiter = detectDelimiter(input)): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  // Bỏ dòng trống hoàn toàn
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Đọc số theo dấu thập phân người dùng chọn; bỏ dấu phân cách hàng nghìn, khoảng trắng, ký hiệu tiền */
export function parseNumber(raw: string, decimal: '.' | ','): number | null {
  let s = raw.trim().replace(/\s|₫|đ|vnd|usdt|\$/gi, '');
  if (!s) return null;
  const thousands = decimal === '.' ? ',' : '.';
  s = s.split(thousands).join('');
  if (decimal === ',') s = s.replace(',', '.');
  if (!/^-?\d*\.?\d+$/.test(s)) return NaN;
  return Number(s);
}

/** Ngày: YYYY-MM-DD, DD/MM/YYYY, D/M/YYYY, DD-MM-YYYY, DD.MM.YYYY → YYYY-MM-DD; sai trả null */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (r) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s)))
    [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

const TYPE_ALIASES: Record<TxType, string[]> = {
  buy: ['mua', 'buy', 'b', 'muavao'],
  sell: ['ban', 'sell', 's', 'banra'],
  deposit: ['nap', 'naptien', 'deposit', 'nop', 'noptien'],
  withdraw: ['rut', 'ruttien', 'withdraw', 'withdrawal'],
  dividend: ['cotuc', 'cotuctienmat', 'dividend', 'div'],
  fee: ['phi', 'fee', 'phiquanly', 'philuuky'],
  opening: ['sodudauky', 'dauky', 'opening', 'sodu'],
};
const ASSET_ALIASES: Record<'stock' | 'crypto' | 'gold' | 'cash', string[]> = {
  stock: ['cophieu', 'stock', 'ck', 'chungkhoan', 'cp'],
  crypto: ['crypto', 'coin', 'tienso', 'tienmahoa'],
  gold: ['vang', 'gold'],
  cash: ['tienmat', 'cash', 'tien'],
};

function lookup<K extends string>(aliases: Record<K, string[]>, raw: string): K | null {
  const s = slug(raw);
  for (const k of Object.keys(aliases) as K[]) if (aliases[k].includes(s) || s === k) return k;
  return null;
}

export interface RowResult {
  /** Số dòng trong file (tính cả dòng tiêu đề), để báo lỗi đúng chỗ */
  line: number;
  cells: string[];
  dto: TransactionDto | null;
  errors: string[];
}

/** Một dòng CSV → TransactionDto, hoặc danh sách lỗi dễ hiểu */
export function rowToDto(cells: string[], line: number, mapping: Mapping, decimal: '.' | ','): RowResult {
  const errors: string[] = [];
  const get = (f: Field) => (mapping[f] === undefined ? '' : (cells[mapping[f]] ?? '').trim());
  const num = (f: Field) => {
    const raw = get(f);
    const v = parseNumber(raw, decimal);
    if (v !== null && (Number.isNaN(v) || v < 0)) {
      errors.push(`${FIELD_LABEL[f]} "${raw}" không phải số hợp lệ`);
      return undefined;
    }
    return v ?? undefined;
  };

  const date = parseDate(get('date'));
  if (!date)
    errors.push(get('date') ? `Ngày "${get('date')}" không đúng dạng (YYYY-MM-DD hoặc DD/MM/YYYY)` : 'Thiếu ngày');
  const type = get('type') ? lookup(TYPE_ALIASES, get('type')) : null;
  if (!type) errors.push(get('type') ? `Không hiểu loại giao dịch "${get('type')}"` : 'Thiếu loại giao dịch');

  const symbol = get('symbol') || undefined;
  let assetType = get('assetType') ? lookup(ASSET_ALIASES, get('assetType')) : null;
  if (get('assetType') && !assetType) errors.push(`Không hiểu loại tài sản "${get('assetType')}"`);
  // Mua/bán/đầu kỳ không ghi loại tài sản: mặc định là cổ phiếu
  if (!assetType && type && ['buy', 'sell', 'opening'].includes(type) && symbol) assetType = 'stock';

  const currencyRaw = get('currency').toUpperCase();
  const currency = currencyRaw === 'USDT' ? 'USDT' : currencyRaw === '' || currencyRaw === 'VND' ? 'VND' : null;
  if (!currency) errors.push(`Tiền tệ "${get('currency')}" chỉ nhận VND hoặc USDT`);

  const dto: TransactionDto = {
    type: type ?? 'buy',
    date: date ?? '',
    assetType: assetType ?? undefined,
    symbol,
    quantity: num('quantity'),
    price: num('price'),
    amount: num('amount'),
    fee: num('fee'),
    tax: num('tax'),
    currency: currency ?? undefined,
    fxRate: num('fxRate'),
    note: get('note').slice(0, 500) || undefined,
  };
  if (type && ['buy', 'sell', 'opening'].includes(type)) {
    if (!symbol) errors.push('Thiếu mã tài sản');
    if (!dto.quantity) errors.push('Thiếu số lượng');
    if (dto.price === undefined || (type !== 'opening' && !dto.price)) errors.push('Thiếu giá');
  }
  if (type && ['deposit', 'withdraw', 'dividend', 'fee'].includes(type) && !dto.amount) errors.push('Thiếu số tiền');
  return { line, cells, dto: errors.length ? null : dto, errors };
}

/** Khoá so trùng: cùng ngày, loại, tài sản, số lượng, giá, số tiền */
export function dupKey(t: {
  date: string;
  type: string;
  assetType?: string | null;
  symbol?: string | null;
  quantity?: number | null;
  price?: number | null;
  amount?: number | null;
}) {
  const n = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(Number(v)));
  return [t.date, t.type, t.assetType ?? '', t.symbol ?? '', n(t.quantity), n(t.price), n(t.amount)].join('|');
}

/** File mẫu (UTF-8, dấu phẩy, số không có dấu phân cách hàng nghìn, thập phân bằng dấu chấm) */
export const TEMPLATE_CSV = `ngay,loai,loai_tai_san,ma,so_luong,gia,so_tien,phi,thue,tien_te,ty_gia,ghi_chu
2026-01-05,nap,,,,,50000000,,,VND,,Nạp tiền vào tài khoản chứng khoán
2026-01-06,mua,co_phieu,FPT,100,95000,,14250,,VND,,
2026-03-10,ban,co_phieu,FPT,50,110000,,8250,5500,VND,,
2026-04-20,co_tuc,co_phieu,FPT,,,100000,,5000,VND,,Cổ tức tiền mặt
2026-05-02,mua,vang,SJL1L10,1,120000000,,,,VND,,
2026-06-01,mua,crypto,BTC,0.01,65000,,0.5,,USDT,25500,
`;
