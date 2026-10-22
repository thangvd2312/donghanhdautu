import { BadRequestException } from '@nestjs/common';
import type { ReportPeriod } from '@dautu/contracts';
import { isDateKey } from '../common/dates';
import { daysBetween } from '../plans/plan-rules';

/** Kỳ tự chọn dài nhất (ngày), như phạm vi "Tất cả" của màn Lịch sử */
const MAX_REPORT_DAYS = 1100;
const MIN_DATE = '1990-01-01';

export const vnDate = (d: string) => d.split('-').reverse().join('/');

function lastDayOfMonth(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function prevMonth(month: string) {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

interface PeriodQuery {
  month?: string;
  from?: string;
  to?: string;
}

/**
 * Kỳ báo cáo: `month` (YYYY-MM), hoặc `from` + `to`, hoặc mặc định tháng trọn vẹn gần nhất. Người mới có giao dịch
 * đầu tiên trong tháng này thì mặc định là tháng này (tới hôm nay) để không mở ra một báo cáo trống.
 */
export function resolvePeriod(q: PeriodQuery, today: string, dataStart: string | null): ReportPeriod {
  const make = (from: string, to: string, month: string | null): ReportPeriod => ({
    from,
    to,
    month,
    label: month ? `Tháng ${month.slice(5, 7)}/${month.slice(0, 4)}` : `${vnDate(from)} – ${vnDate(to)}`,
    inProgress: to >= today,
    days: daysBetween(from, to) + 1,
  });
  const ofMonth = (month: string) => {
    const from = `${month}-01`;
    if (from > today) throw new BadRequestException('Tháng này chưa tới');
    const last = lastDayOfMonth(month);
    return make(from, last < today ? last : today, month);
  };

  if (q.month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(q.month) || `${q.month}-01` < MIN_DATE) {
      throw new BadRequestException('Tháng không hợp lệ (cần dạng YYYY-MM)');
    }
    return ofMonth(q.month);
  }
  if (q.from || q.to) {
    if (!q.from || !q.to) throw new BadRequestException('Kỳ tự chọn cần cả ngày bắt đầu và ngày kết thúc');
    if (!isDateKey(q.from) || !isDateKey(q.to)) throw new BadRequestException('Ngày không hợp lệ (YYYY-MM-DD)');
    if (q.from > q.to) throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc');
    if (q.to > today) throw new BadRequestException('Ngày kết thúc không được ở tương lai');
    if (q.from < MIN_DATE) throw new BadRequestException('Ngày bắt đầu quá xa trong quá khứ');
    if (daysBetween(q.from, q.to) + 1 > MAX_REPORT_DAYS) {
      throw new BadRequestException(`Kỳ tự chọn dài tối đa ${MAX_REPORT_DAYS} ngày`);
    }
    return make(q.from, q.to, null);
  }
  const current = today.slice(0, 7);
  const last = prevMonth(current);
  if (dataStart && dataStart > lastDayOfMonth(last)) return ofMonth(current);
  return ofMonth(last);
}

/** Kiểm tra kỳ có nằm trước ngày giao dịch đầu tiên không (khỏi dựng lịch sử) */
export function periodHasData(period: ReportPeriod, dataStart: string | null) {
  return dataStart !== null && dataStart <= period.to;
}
