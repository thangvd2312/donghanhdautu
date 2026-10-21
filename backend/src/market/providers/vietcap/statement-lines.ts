export const KIND_LABEL = {
  bank: 'ngân hàng',
  securities: 'công ty chứng khoán',
  insurance: 'công ty bảo hiểm',
  corporate: 'doanh nghiệp',
} as const;

export const KIND_NOTE = {
  bank: 'Ngân hàng: dòng tiền kinh doanh chủ yếu phản ánh biến động tiền gửi và cho vay, không dùng để đánh giá chất lượng lợi nhuận như doanh nghiệp thường. Đọc theo NIM, nợ xấu, CASA, tăng trưởng tín dụng, CAR.',
  securities:
    'Công ty chứng khoán: nợ vay chủ yếu tài trợ cho vay margin và danh mục tự doanh, dòng tiền kinh doanh biến động theo dư nợ margin — không dùng nợ vay ròng hay dòng tiền/lợi nhuận như doanh nghiệp thường. Đọc theo cơ cấu doanh thu (môi giới, cho vay margin, tự doanh, ngân hàng đầu tư), dư nợ margin/vốn chủ và ROE.',
  insurance:
    'Công ty bảo hiểm: phần lớn nợ phải trả là dự phòng nghiệp vụ, tài sản chủ yếu là danh mục đầu tư — không dùng nợ vay ròng hay dòng tiền/lợi nhuận như doanh nghiệp thường. Đọc theo doanh thu phí bảo hiểm, tỷ lệ bồi thường, lợi nhuận hoạt động đầu tư và ROE.',
  corporate: undefined,
} as const;

/** Mã trường các dòng chính — doanh nghiệp thường. Nhãn bỏ trống thì dùng tên dòng của Vietcap */
export const CORP_BS: [string, string?][] = [
  ['bsa2'],
  ['bsa5'],
  ['bsa8'],
  ['bsa15'],
  ['bsa1', 'Tài sản ngắn hạn'],
  ['bsa53', 'Tổng tài sản'],
  ['bsa55', 'Nợ ngắn hạn'],
  ['bsa56', 'Vay ngắn hạn'],
  ['bsa71', 'Vay dài hạn'],
  ['bsa54', 'Nợ phải trả'],
  ['bsa78'],
  ['bsa90', 'Lợi nhuận chưa phân phối'],
];
export const BANK_BS: [string, string?][] = [
  ['bsa53', 'Tổng tài sản'],
  ['bsb104', 'Cho vay khách hàng (gộp)'],
  ['bsb105', 'Dự phòng rủi ro cho vay khách hàng'],
  ['bsb106'],
  ['bsb113'],
  ['bsb116'],
  ['bsb112'],
  ['bsa54', 'Tổng nợ phải trả'],
  ['bsa78', 'Vốn chủ sở hữu'],
  ['bsa90', 'Lợi nhuận chưa phân phối'],
];
export const CORP_CF: [string, string?][] = [
  ['cfa1', 'Lợi nhuận trước thuế'],
  ['cfa2', 'Khấu hao'],
  ['cfa18', 'Dòng tiền từ hoạt động kinh doanh'],
  ['cfa19', 'Chi mua sắm, xây dựng TSCĐ'],
  ['cfa26', 'Dòng tiền từ hoạt động đầu tư'],
  ['cfa29', 'Tiền vay nhận được'],
  ['cfa30', 'Tiền trả nợ gốc vay'],
  ['cfa32', 'Cổ tức đã trả'],
  ['cfa34', 'Dòng tiền từ hoạt động tài chính'],
  ['cfa35', 'Lưu chuyển tiền thuần trong kỳ'],
];
