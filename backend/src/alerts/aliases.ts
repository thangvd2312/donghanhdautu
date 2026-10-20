/**
 * Tên thường gọi của các doanh nghiệp niêm yết lớn — dùng khi không có AI, để tin tức
 * viết "Hòa Phát" thay vì "HPG" vẫn khớp được với mã người dùng đang nắm giữ.
 */
const ALIASES: Record<string, string[]> = {
  ACB: ['Ngân hàng Á Châu'],
  BCM: ['Becamex'],
  BID: ['BIDV'],
  BSR: ['Lọc hóa dầu Bình Sơn', 'Bình Sơn'],
  BVH: ['Bảo Việt'],
  CTG: ['VietinBank', 'Vietinbank'],
  DCM: ['Đạm Cà Mau'],
  DGC: ['Hóa chất Đức Giang', 'Đức Giang'],
  DIG: ['DIC Corp'],
  DPM: ['Đạm Phú Mỹ'],
  DXG: ['Đất Xanh'],
  EIB: ['Eximbank'],
  FPT: ['Tập đoàn FPT'],
  GAS: ['PV Gas'],
  GEX: ['Gelex'],
  GMD: ['Gemadept'],
  GVR: ['Cao su Việt Nam'],
  HCM: ['Chứng khoán HSC', 'HSC'],
  HDB: ['HDBank'],
  HPG: ['Hòa Phát', 'Hoà Phát'],
  HSG: ['Hoa Sen'],
  HVN: ['Vietnam Airlines'],
  KBC: ['Kinh Bắc'],
  KDH: ['Khang Điền'],
  LPB: ['LPBank', 'Lộc Phát'],
  MBB: ['MB Bank', 'MBBank', 'Ngân hàng Quân đội'],
  MCH: ['Masan Consumer'],
  MSN: ['Masan'],
  MWG: ['Thế Giới Di Động', 'Bách Hóa Xanh'],
  NKG: ['Thép Nam Kim', 'Nam Kim'],
  NVL: ['Novaland'],
  PDR: ['Phát Đạt'],
  PLX: ['Petrolimex'],
  PNJ: ['Phú Nhuận'],
  POW: ['PV Power'],
  PVD: ['PV Drilling'],
  PVS: ['PTSC'],
  REE: ['Cơ điện lạnh REE'],
  SAB: ['Sabeco'],
  SHB: ['Ngân hàng SHB'],
  SSB: ['SeABank'],
  SSI: ['Chứng khoán SSI'],
  STB: ['Sacombank'],
  TCB: ['Techcombank'],
  TPB: ['TPBank'],
  VCB: ['Vietcombank'],
  VCI: ['Vietcap'],
  VHM: ['Vinhomes'],
  VIB: ['Ngân hàng VIB'],
  VIC: ['Vingroup'],
  VJC: ['Vietjet'],
  VND: ['VNDirect'],
  VNM: ['Vinamilk'],
  VPB: ['VPBank'],
  VRE: ['Vincom Retail'],
};

/** Tin có nhắc tới mã (chữ in hoa đứng riêng) hoặc tên thường gọi của doanh nghiệp không */
export function mentionsCompany(text: string, ticker: string): boolean {
  if (new RegExp(`(^|[^A-Z0-9])${ticker}([^A-Z0-9]|$)`).test(text)) return true;
  const lower = text.toLowerCase();
  return (ALIASES[ticker] ?? []).some((a) => lower.includes(a.toLowerCase()));
}
