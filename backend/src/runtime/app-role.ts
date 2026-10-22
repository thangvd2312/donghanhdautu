import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Cùng một codebase chạy hai vai trò (hai app pm2):
 *  - web: API HTTP, socket.io, poll giá realtime cho bảng giá. Không chạy lịch, hàng đợi, gửi thông báo.
 *  - worker: Nest application context không có HTTP; chạy cron, hàng đợi bản tin, gửi Telegram / Web Push.
 */
type AppRole = 'web' | 'worker';

const APP_ROLES: readonly AppRole[] = ['web', 'worker'];

/** Không đặt (hoặc rỗng) = web để chạy local như trước; giá trị lạ thì dừng ngay lúc khởi động thay vì đoán */
export function parseAppRole(raw: string | undefined): AppRole {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === '') return 'web';
  if ((APP_ROLES as readonly string[]).includes(value)) return value as AppRole;
  throw new Error(`APP_ROLE="${raw}" không hợp lệ, chỉ nhận: ${APP_ROLES.join(' | ')}`);
}

/** Điểm vào khai báo vai trò của mình trước khi tạo ứng dụng, để biến môi trường dùng chung (.env) không đổi được nó */
export function declareAppRole(role: AppRole): void {
  process.env.APP_ROLE = role;
}

/** Vai trò của tiến trình hiện tại, đọc qua ConfigService (APP_ROLE) */
@Injectable()
export class AppRuntime {
  readonly role: AppRole;

  constructor(config: ConfigService) {
    this.role = parseAppRole(config.get<string>('APP_ROLE'));
  }

  get isWorker(): boolean {
    return this.role === 'worker';
  }

  /** Chỉ web giữ websocket Binance và poll bảng giá liên tục; worker lấy giá theo yêu cầu (MarketService.ensureFresh) */
  get pollsRealtimeMarket(): boolean {
    return this.role === 'web';
  }
}
