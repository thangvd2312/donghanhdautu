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
    console.log(`Người dùng hoạt động: DAU ${r.active.dau} · WAU ${r.active.wau} · MAU ${r.active.mau}`);
    const h = (x: number | null) => (x === null ? '–' : `${Math.round(x * 10) / 10} giờ`);
    console.log(
      `Thời gian tới giá trị đầu tiên (đăng ký → xem danh mục có dữ liệu thật): ${r.timeToFirstValue.users} người, trung vị ${h(r.timeToFirstValue.median_hours)}, p90 ${h(r.timeToFirstValue.p90_hours)}`,
    );
    const f = r.funnel;
    console.log('Phễu người mới (trong khoảng báo cáo; 2 bước đầu là thiết bị khách ẩn danh)');
    console.table([
      { bước: 'Xem trang mẫu', số: f.demo_viewers, tỷ_lệ: '' },
      { bước: 'Bấm đăng ký / đăng nhập từ trang mẫu', số: f.demo_cta, tỷ_lệ: `${f.ctaPct ?? '–'}% người xem mẫu` },
      { bước: 'Đăng ký', số: f.signups, tỷ_lệ: '' },
      { bước: 'Làm khảo sát', số: f.onboarded, tỷ_lệ: `${f.onboardedPct ?? '–'}% người đăng ký` },
      { bước: 'Bỏ qua khảo sát', số: f.skipped_survey, tỷ_lệ: `${f.skippedPct ?? '–'}% người đăng ký` },
      { bước: 'Có giao dịch thật trong 7 ngày', số: f.activated_7d, tỷ_lệ: `${f.activatedPct ?? '–'}% người đăng ký` },
    ]);
    const iq = r.importQuality30Days;
    console.log(
      `Nhập CSV 30 ngày: ${iq.imports} lần thành công, ${iq.rows_imported}/${iq.rows_in_files} dòng được nhập; ${iq.error_rows} dòng lỗi (${iq.errorRowPct ?? '–'}%); ${iq.rejected} lần không nhập được (${iq.rejectedBy.map((x) => `${x.reason} ${x.count}`).join(', ') || 'không có'})`,
    );
    const pr = r.planReviews30Days;
    console.log(
      `Duy trì nhật ký: ${pr.users_reviewed}/${pr.users_with_plans} người có kế hoạch đã xem lại trong 30 ngày (${pr.reviewedPct ?? '–'}%); ${pr.overdue_plans} kế hoạch quá hạn xem lại > 7 ngày`,
    );
    console.log(
      `Chất lượng dữ liệu: ${r.dataQuality30Days.okPct ?? '–'}% lượt mở danh mục có giá đầy đủ và mới (${r.dataQuality30Days.byStatus.map((q) => `${q.status} ${q.user_days}`).join(', ') || 'chưa có'})`,
    );
    const aq = r.aiQuality30Days;
    console.log(
      `Chất lượng AI: ${aq.reports}/${aq.questions} câu trả lời bị báo sai (${aq.reportPct ?? '–'}%) — ${aq.byReason.map((f) => `${f.reason} ${f.reports}`).join(', ') || 'không có'}; tự đối chiếu nguồn: ${aq.verification.map((v) => `${v.status} ${v.answers}`).join(', ') || 'chưa có'}\n`,
    );
    console.log('Bản tin 30 ngày qua');
    console.table(r.briefs);
    console.log('Sự kiện 30 ngày qua');
    console.table(r.last30Days);
    console.log('Chi phí AI 30 ngày qua (USD ước tính; unknown_cost_calls = lượt không tính được chi phí)');
    console.table(r.aiCost30Days);
    console.log('Chi phí AI trên mỗi người dùng 30 ngày (USD, phần tính được; shared = chi phí chung không gắn người)');
    console.table([r.aiCostPerUser30Days]);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
