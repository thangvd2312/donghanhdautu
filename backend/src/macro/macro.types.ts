import type { MacroFact } from '@prisma/client';

/** Một số liệu vừa đọc được từ nguồn, trước khi lưu */
export interface FactInput {
  key: string;
  label: string;
  value: string;
  numericValue: number | null;
  unit: string;
  asOf: string;
  document?: string;
  note?: string;
  sourceName: string;
  sourceUrl: string;
  /** Khoảng giá trị hợp lý — ngoài khoảng này coi như đọc sai, không lưu */
  sane: [number, number];
}

export interface MacroChange {
  fact: MacroFact;
  previousValue: string;
  /** Thay đổi chính sách (lãi suất điều hành, lãi suất Fed) — cần cảnh báo người dùng */
  policy: boolean;
}
