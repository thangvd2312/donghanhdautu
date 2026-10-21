/** Danh mục tiêu chí của bộ lọc cổ phiếu: nhãn, đơn vị, khoảng hợp lệ, và cách ánh xạ sang tên trường của Vietcap. */

export type CriterionKey =
  | 'exchange'
  | 'sector'
  | 'marketCap'
  | 'price'
  | 'adtv'
  | 'pe'
  | 'pb'
  | 'roe'
  | 'profitGrowth'
  | 'revenueGrowth'
  | 'netMargin'
  | 'grossMargin'
  | 'dividendYield';

export type CriterionGroup = 'Cơ bản' | 'Định giá' | 'Hiệu quả' | 'Tăng trưởng' | 'Cổ tức';
export type CriterionUnit = '₫' | 'tỷ ₫' | '%' | 'x' | null;

export interface Preset {
  label: string;
  min?: number;
  max?: number;
}

export interface Option {
  value: string;
  label: string;
}

export interface Criterion {
  key: CriterionKey;
  label: string;
  group: CriterionGroup;
  type: 'range' | 'multi';
  unit: CriterionUnit;
  min?: number;
  max?: number;
  step?: number;
  options?: Option[];
  presets?: Preset[];
  hint: string;
  period: string | null;
}

/** Cách một tiêu chí khoảng được hỏi ở Vietcap và đọc lại từ kết quả */
export interface VietcapSource {
  /** `name` trong phần tử filter */
  name: string;
  /** Nhân giá trị người dùng (đơn vị của tiêu chí) với hệ số này để ra đơn vị thô của Vietcap (VND) */
  multiplier: number;
  extraName?: string;
  extraName2?: string;
  /** Tên trường trong kết quả (cũng là tên dùng để sắp xếp) */
  field: string;
  /** Chặn dưới tối thiểu: P/E, P/B bằng 0 hoặc âm là mã không có lợi nhuận/vốn dương, không có ý nghĩa để so sánh */
  positiveOnly?: boolean;
}

export const EXCHANGES: Option[] = [
  { value: 'HOSE', label: 'HOSE' },
  { value: 'HNX', label: 'HNX' },
  { value: 'UPCOM', label: 'UPCOM' },
];

/** Mã ICB cấp 1 của Vietcap; nhãn lấy từ nguồn khi có, đây là bản dự phòng đã kiểm tra 21/10/2026 */
export const FALLBACK_SECTORS: Option[] = [
  { value: '1000', label: 'Nguyên vật liệu' },
  { value: '3000', label: 'Hàng Tiêu dùng' },
  { value: '2000', label: 'Công nghiệp' },
  { value: '0001', label: 'Dầu khí' },
  { value: '6000', label: 'Viễn thông' },
  { value: '4000', label: 'Dược phẩm và Y tế' },
  { value: '7000', label: 'Tiện ích Cộng đồng' },
  { value: '5000', label: 'Dịch vụ Tiêu dùng' },
  { value: '8600', label: 'Bất động sản' },
  { value: '8301', label: 'Ngân hàng' },
  { value: '9000', label: 'Công nghệ Thông tin' },
  { value: '8500', label: 'Bảo hiểm' },
  { value: '8700', label: 'Dịch vụ tài chính' },
];

export const VIETCAP_SOURCES: Partial<Record<CriterionKey, VietcapSource>> = {
  marketCap: { name: 'marketCap', multiplier: 1e9, field: 'marketCap' },
  price: { name: 'marketPrice', multiplier: 1, field: 'marketPrice' },
  adtv: { name: 'adtv', multiplier: 1e9, extraName: '30Days', field: 'adtv30Days' },
  pe: { name: 'ttmPe', multiplier: 1, field: 'ttmPe', positiveOnly: true },
  pb: { name: 'ttmPb', multiplier: 1, field: 'ttmPb', positiveOnly: true },
  roe: { name: 'ttmRoe', multiplier: 1, field: 'ttmRoe' },
  profitGrowth: {
    name: 'npatmiGrowth',
    multiplier: 1,
    extraName: 'Yoy',
    extraName2: 'Qm1',
    field: 'npatmiGrowthYoyQm1',
  },
  revenueGrowth: { name: 'revenueGrowth', multiplier: 1, extraName: 'Yoy', field: 'revenueGrowthYoy' },
  netMargin: { name: 'netMargin', multiplier: 1, field: 'netMargin' },
  grossMargin: { name: 'grossMargin', multiplier: 1, field: 'grossMargin' },
};

/** Khoảng hợp lệ lấy theo thanh trượt của Vietcap (đơn vị của tiêu chí) */
export const CRITERIA: Criterion[] = [
  {
    key: 'exchange',
    label: 'Sàn niêm yết',
    group: 'Cơ bản',
    type: 'multi',
    unit: null,
    options: EXCHANGES,
    hint: 'HOSE và HNX là hai sàn chính thức; UPCoM là sàn của công ty đại chúng chưa niêm yết, thường ít thanh khoản hơn.',
    period: null,
  },
  {
    key: 'sector',
    label: 'Ngành (ICB cấp 1)',
    group: 'Cơ bản',
    type: 'multi',
    unit: null,
    options: FALLBACK_SECTORS,
    hint: 'Nhóm doanh nghiệp theo lĩnh vực kinh doanh chính; so sánh P/E hay ROE nên làm trong cùng một ngành.',
    period: null,
  },
  {
    key: 'marketCap',
    label: 'Vốn hoá',
    group: 'Cơ bản',
    type: 'range',
    unit: 'tỷ ₫',
    min: 0,
    max: 2_000_000,
    step: 100,
    presets: [
      { label: 'Dưới 1.000 tỷ', max: 1000 },
      { label: '1.000–10.000 tỷ', min: 1000, max: 10000 },
      { label: 'Trên 10.000 tỷ', min: 10000 },
    ],
    hint: 'Tổng giá trị thị trường của công ty (giá nhân số cổ phiếu); công ty nhỏ thường biến động mạnh hơn.',
    period: 'Theo giá khớp gần nhất',
  },
  {
    key: 'price',
    label: 'Giá cổ phiếu',
    group: 'Cơ bản',
    type: 'range',
    unit: '₫',
    min: 0,
    max: 2_000_000,
    step: 100,
    presets: [
      { label: 'Dưới 10.000 ₫', max: 10000 },
      { label: '10.000–50.000 ₫', min: 10000, max: 50000 },
      { label: 'Trên 50.000 ₫', min: 50000 },
    ],
    hint: 'Giá một cổ phiếu cao hay thấp không nói công ty đắt hay rẻ; chỉ cho biết cần bao nhiêu tiền để mua một lô 100 cổ phiếu.',
    period: 'Giá khớp gần nhất',
  },
  {
    key: 'adtv',
    label: 'Giá trị giao dịch bình quân',
    group: 'Cơ bản',
    type: 'range',
    unit: 'tỷ ₫',
    min: 0,
    max: 2000,
    step: 1,
    presets: [
      { label: 'Dưới 10 tỷ/phiên', max: 10 },
      { label: '10–50 tỷ/phiên', min: 10, max: 50 },
      { label: 'Trên 50 tỷ/phiên', min: 50 },
    ],
    hint: 'Số tiền giao dịch trung bình mỗi phiên; càng cao càng dễ mua bán mà không làm lệch giá.',
    period: 'Bình quân 30 phiên gần nhất',
  },
  {
    key: 'pe',
    label: 'P/E',
    group: 'Định giá',
    type: 'range',
    unit: 'x',
    min: 0,
    max: 100,
    step: 0.5,
    presets: [
      { label: 'Dưới 10', min: 0, max: 10 },
      { label: '10–20', min: 10, max: 20 },
      { label: 'Trên 20', min: 20 },
    ],
    hint: 'Giá cổ phiếu chia lợi nhuận một cổ phiếu; P/E thấp nghĩa là trả ít tiền hơn cho mỗi đồng lợi nhuận, nhưng không chắc đã rẻ.',
    period: 'TTM (4 quý gần nhất); công ty lỗ không hiện',
  },
  {
    key: 'pb',
    label: 'P/B',
    group: 'Định giá',
    type: 'range',
    unit: 'x',
    min: 0,
    max: 100,
    step: 0.1,
    presets: [
      { label: 'Dưới 1', min: 0, max: 1 },
      { label: '1–2', min: 1, max: 2 },
      { label: 'Trên 2', min: 2 },
    ],
    hint: 'Giá cổ phiếu so với giá trị sổ sách; dưới 1 nghĩa là thị trường định giá thấp hơn vốn chủ sở hữu ghi trên sổ.',
    period: 'TTM (quý gần nhất)',
  },
  {
    key: 'roe',
    label: 'ROE',
    group: 'Hiệu quả',
    type: 'range',
    unit: '%',
    min: -50,
    max: 50,
    step: 0.5,
    presets: [
      { label: 'Trên 10%', min: 10 },
      { label: 'Trên 15%', min: 15 },
      { label: 'Trên 20%', min: 20 },
    ],
    hint: 'Lợi nhuận sau thuế trên vốn chủ sở hữu: công ty sinh lời bao nhiêu từ vốn của cổ đông.',
    period: 'TTM (4 quý gần nhất)',
  },
  {
    key: 'netMargin',
    label: 'Biên lợi nhuận ròng',
    group: 'Hiệu quả',
    type: 'range',
    unit: '%',
    min: -100,
    max: 100,
    step: 1,
    presets: [
      { label: 'Trên 10%', min: 10 },
      { label: 'Trên 20%', min: 20 },
    ],
    hint: 'Trong 100 đồng doanh thu, công ty giữ lại bao nhiêu đồng lợi nhuận sau thuế.',
    period: 'Kỳ báo cáo gần nhất theo Vietcap',
  },
  {
    key: 'grossMargin',
    label: 'Biên lợi nhuận gộp',
    group: 'Hiệu quả',
    type: 'range',
    unit: '%',
    min: -100,
    max: 100,
    step: 1,
    presets: [
      { label: 'Trên 20%', min: 20 },
      { label: 'Trên 40%', min: 40 },
    ],
    hint: 'Phần doanh thu còn lại sau khi trừ giá vốn hàng bán; phản ánh sức mạnh định giá của sản phẩm.',
    period: 'Kỳ báo cáo gần nhất theo Vietcap',
  },
  {
    key: 'profitGrowth',
    label: 'Tăng trưởng lợi nhuận',
    group: 'Tăng trưởng',
    type: 'range',
    unit: '%',
    min: -100,
    max: 500,
    step: 1,
    presets: [
      { label: 'Tăng trên 20%', min: 20 },
      { label: 'Tăng dương', min: 0 },
      { label: 'Đang giảm', max: 0 },
    ],
    hint: 'Lợi nhuận sau thuế của cổ đông công ty mẹ quý gần nhất thay đổi bao nhiêu so với cùng kỳ năm trước.',
    period: 'Quý gần nhất so với cùng kỳ năm trước',
  },
  {
    key: 'revenueGrowth',
    label: 'Tăng trưởng doanh thu',
    group: 'Tăng trưởng',
    type: 'range',
    unit: '%',
    min: -100,
    max: 500,
    step: 1,
    presets: [
      { label: 'Tăng trên 10%', min: 10 },
      { label: 'Tăng trên 20%', min: 20 },
      { label: 'Đang giảm', max: 0 },
    ],
    hint: 'Doanh thu quý gần nhất thay đổi bao nhiêu so với cùng kỳ năm trước.',
    period: 'Quý gần nhất so với cùng kỳ năm trước',
  },
  {
    key: 'dividendYield',
    label: 'Tỷ suất cổ tức tiền mặt',
    group: 'Cổ tức',
    type: 'range',
    unit: '%',
    min: 0,
    max: 100,
    step: 0.5,
    presets: [
      { label: 'Có cổ tức tiền mặt', min: 0.01 },
      { label: 'Trên 3%', min: 3 },
      { label: 'Trên 5%', min: 5 },
    ],
    hint: 'Cổ tức tiền mặt đã chia trong 12 tháng chia cho giá hiện tại; tỷ suất cao bất thường có thể do giá giảm mạnh.',
    period: 'Cổ tức tiền mặt 12 tháng gần nhất / giá hiện tại (tính từ lịch sử quyền)',
  },
];

export const CRITERIA_BY_KEY = new Map(CRITERIA.map((c) => [c.key, c]));

/** Khóa sắp xếp nhận được và tên trường sắp xếp ở Vietcap */
export const SORT_FIELDS: Partial<Record<CriterionKey, string>> = Object.fromEntries(
  Object.entries(VIETCAP_SOURCES).map(([k, v]) => [k, v.field]),
);
