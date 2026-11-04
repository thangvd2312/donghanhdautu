import { ValidateBy, ValidationOptions } from 'class-validator';

/** Ngày dạng YYYY-MM-DD có thật trên lịch (chặn 2026-02-31, 2026-13-01…) */
export function isDateKey(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function IsDateKey(options?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isDateKey',
      validator: {
        validate: isDateKey,
        defaultMessage: () => 'Ngày không hợp lệ (cần dạng YYYY-MM-DD và có thật trên lịch)',
      },
    },
    options,
  );
}

/** Cộng số ngày vào một ngày dạng YYYY-MM-DD (theo lịch, không phụ thuộc múi giờ) */
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Số ngày từ `from` tới `to` (YYYY-MM-DD) */
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
