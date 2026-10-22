import { Injectable } from '@nestjs/common';
import { vnDateKey } from '../market/types';
import { HistoryService } from '../portfolio/history.service';
import { MAX_WINDOW_DAYS } from './rule-config';

/** Xem trước gọi liên tục khi người dùng sửa ngưỡng: lịch sử (cần giá nhiều ngày) giữ lại một lúc */
const PREVIEW_HISTORY_TTL_MS = 5 * 60_000;

type HistoryPointList = Awaited<ReturnType<HistoryService['recentPoints']>>['points'];
export interface AlertHistory {
  today: string;
  points: HistoryPointList;
}

/** Portfolio history long enough for the widest drawdown window, optionally served from a short per-user cache. */
@Injectable()
export class PortfolioAlertHistory {
  private cache = new Map<string, { at: number; data: AlertHistory }>();

  constructor(private history: HistoryService) {}

  async get(userId: string, cached: boolean): Promise<AlertHistory> {
    const hit = this.cache.get(userId);
    if (cached && hit && Date.now() - hit.at < PREVIEW_HISTORY_TTL_MS && hit.data.today === vnDateKey())
      return hit.data;
    // Một ngày đệm trước cửa sổ dài nhất để ngày đầu cửa sổ có mốc so sánh
    const data = await this.history.recentPoints(userId, MAX_WINDOW_DAYS + 1);
    if (this.cache.size > 500) this.cache.clear();
    this.cache.set(userId, { at: Date.now(), data });
    return data;
  }
}
