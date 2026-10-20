import { PrismaClient } from '@prisma/client';
import { usageReport } from './report';

/** In báo cáo sử dụng: `npm run report:usage -- [số tuần]` (dùng DATABASE_URL của backend/.env) */
async function main() {
  const prisma = new PrismaClient();
  try {
    const weeks = Number(process.argv[2]) || 8;
    const r = await usageReport(prisma, { weeks });
    console.log(`Báo cáo sử dụng lúc ${r.generatedAt}\n`);
    console.log('Cohort theo tuần đăng ký');
    console.table(
      r.cohorts.map((c) => ({
        tuần: c.week,
        'đăng ký': c.signups,
        'làm khảo sát': c.onboarded,
        'kích hoạt 7 ngày': `${c.activated} (${c.activationPct ?? '–'}%)`,
        D7: c.d7_eligible ? `${c.d7_retained}/${c.d7_eligible} (${c.d7Pct}%)` : 'chưa đủ ngày',
        D30: c.d30_eligible ? `${c.d30_retained}/${c.d30_eligible} (${c.d30Pct}%)` : 'chưa đủ ngày',
      })),
    );
    console.log(`Người dùng hoạt động: DAU ${r.active.dau} · WAU ${r.active.wau} · MAU ${r.active.mau}\n`);
    console.log('Bản tin 30 ngày qua');
    console.table(r.briefs);
    console.log('Sự kiện 30 ngày qua');
    console.table(r.last30Days);
    console.log('Chi phí AI 30 ngày qua (USD ước tính; unknown_cost_calls = lượt không tính được chi phí)');
    console.table(r.aiCost30Days);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
