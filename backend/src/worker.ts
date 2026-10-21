import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { declareAppRole } from './runtime/app-role';
import { WorkerModule } from './worker/worker.module';

/**
 * Điểm vào của worker (pm2 app `dautu-worker`): cùng codebase với API nhưng không mở cổng HTTP.
 * Chạy cron, hàng đợi bản tin, gửi Telegram / Web Push, ghi nhịp tim. SIGTERM / SIGINT: dừng nhận việc mới,
 * chờ việc đang chạy xong (WORKER_SHUTDOWN_GRACE_MS) rồi thoát.
 */
async function bootstrap() {
  declareAppRole('worker');
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
}

bootstrap().catch((e: Error) => {
  new Logger('Worker').error(`Worker không khởi động được: ${e.stack ?? e.message}`);
  process.exit(1);
});
