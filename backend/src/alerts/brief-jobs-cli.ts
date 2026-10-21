import { PrismaClient } from '@prisma/client';

/**
 * Xem / chạy lại việc trong hàng đợi bản tin (dùng DATABASE_URL của backend/.env):
 *   npm run briefs:jobs                 thống kê 7 ngày + các việc lỗi
 *   npm run briefs:jobs -- retry failed đưa mọi việc "failed" về hàng đợi
 *   npm run briefs:jobs -- retry <id>   đưa một việc về hàng đợi
 * Worker đang chạy sẽ lấy việc trong vòng 15 giây.
 */
async function main() {
  const prisma = new PrismaClient();
  try {
    const [cmd, target] = process.argv.slice(2);
    if (cmd === 'retry') {
      if (!target) throw new Error('Cần id việc hoặc "failed"');
      const { count } = await prisma.briefJob.updateMany({
        where: target === 'failed' ? { status: 'failed' } : { id: target },
        data: { status: 'queued', attempts: 0, runAfter: new Date(), lockedAt: null, finishedAt: null },
      });
      console.log(`Đã đưa ${count} việc về hàng đợi`);
      return;
    }
    const since = new Date(Date.now() - 7 * 86_400_000);
    const stats = await prisma.briefJob.groupBy({
      by: ['day', 'kind', 'status'],
      where: { createdAt: { gte: since } },
      _count: true,
      orderBy: [{ day: 'desc' }, { kind: 'asc' }],
    });
    console.log('Hàng đợi bản tin 7 ngày qua');
    console.table(stats.map((s) => ({ ngày: s.day, loại: s.kind, trạng_thái: s.status, số_việc: s._count })));
    const failed = await prisma.briefJob.findMany({
      where: { status: 'failed', createdAt: { gte: since } },
      orderBy: { updatedAt: 'desc' },
      take: 30,
    });
    if (failed.length) {
      console.log('Việc lỗi (chạy lại: npm run briefs:jobs -- retry <id> | retry failed)');
      console.table(
        failed.map((j) => ({ id: j.id, ngày: j.day, loại: j.kind, lần_thử: j.attempts, lỗi: j.lastError })),
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
