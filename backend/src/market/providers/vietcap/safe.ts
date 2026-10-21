import { Logger } from '@nestjs/common';

const log = new Logger('Vietcap');

/** Gọi nguồn dữ liệu; lỗi thì ghi cảnh báo và trả giá trị dự phòng để một nguồn hỏng không làm hỏng cả màn hình */
export async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    log.warn(`${label}: ${(e as Error).message}`);
    return fallback;
  }
}
