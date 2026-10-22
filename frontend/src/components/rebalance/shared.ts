import { fmtNum } from '../../lib/format'

/** Số % gọn: bỏ phần thập phân nếu là số nguyên */
export const pctFmt = (n: number) => fmtNum(n, Number.isInteger(n) ? 0 : 2)
