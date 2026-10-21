import { Controller, Get } from '@nestjs/common';
import { HeartbeatService, WorkerStatus } from '../runtime/heartbeat.service';

/**
 * `ok: true` nghĩa là API đang trả lời (CI / deploy kiểm tra dựa vào đây) và không phụ thuộc worker.
 * `worker` cho biết nhịp tim worker còn mới không (ghi mỗi 30 giây, quá 90 giây là không ok) để giám sát.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly heartbeat: HeartbeatService) {}

  @Get()
  async health(): Promise<{ ok: true; worker: WorkerStatus }> {
    return { ok: true, worker: await this.heartbeat.status() };
  }
}
