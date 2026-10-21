import { PrismaClient } from '@prisma/client';
import { isNewWorkerAlive, WORKER_NAME } from './heartbeat.service';

/**
 * Bước kiểm tra của deploy: chờ worker MỚI ghi nhịp tim (khởi động sau mốc `--since`, nhịp còn mới).
 *   node --env-file=../.env dist/runtime/worker-check-cli.js --since <epoch giây> [--timeout 90]
 * Thoát mã 0 khi worker sống, 1 khi quá thời gian chờ (deploy coi là thất bại).
 */
async function main() {
  const args = process.argv.slice(2);
  const arg = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? Number(args[i + 1]) : NaN;
  };
  const since = arg('since');
  if (!Number.isFinite(since)) throw new Error('Cần --since <epoch giây> (lúc bắt đầu reload)');
  const timeoutSec = Number.isFinite(arg('timeout')) ? arg('timeout') : 90;

  const prisma = new PrismaClient();
  try {
    const deadline = Date.now() + timeoutSec * 1000;
    for (;;) {
      const row = await prisma.workerHeartbeat.findUnique({ where: { name: WORKER_NAME } });
      if (isNewWorkerAlive(row, since * 1000)) {
        console.log(
          `Worker "${WORKER_NAME}" đang chạy: version=${row!.version} startedAt=${row!.startedAt.toISOString()}`,
        );
        return;
      }
      if (Date.now() >= deadline) {
        console.error(
          row
            ? `Nhịp tim cuối: startedAt=${row.startedAt.toISOString()} beatAt=${row.beatAt.toISOString()} (cần startedAt sau ${new Date(since * 1000).toISOString()})`
            : 'Chưa có nhịp tim nào',
        );
        throw new Error(`Worker không lên trong ${timeoutSec} giây`);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: Error) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});
