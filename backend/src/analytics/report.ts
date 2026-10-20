import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Báo cáo sử dụng (OBS-01), tính bằng SQL trên AnalyticsEvent + dữ liệu gốc. Định nghĩa:
 * - Cohort: người dùng theo tuần đăng ký (giờ VN, tuần bắt đầu thứ 2), từ bảng User.
 * - Kích hoạt: có giao dịch thật đầu tiên (tay hoặc CSV, không tính chuyển đổi dữ liệu cũ) trong 7 ngày sau đăng ký.
 * - Ngày hoạt động: ngày (giờ VN) có ít nhất một sự kiện thật (sample = false) do chính người dùng làm
 *   (không tính sự kiện hệ thống tự phát như brief_generated).
 * - Giữ chân D7: có hoạt động trong ngày 7–13 sau đăng ký; D30: ngày 30–59. Chỉ tính cho cohort đã đủ thời gian.
 * - DAU / WAU / MAU: số người dùng có hoạt động trong 1 / 7 / 30 ngày gần nhất.
 * - Bản tin: số bản tạo (không tính "Gửi thử"), số bản được mở, số bản có hỏi tiếp, trong 30 ngày.
 * Sự kiện chỉ có từ khi triển khai đo lường: cohort cũ hơn sẽ thiếu số liệu hoạt động.
 */
/**
 * Mốc thời gian để so với cột DateTime của Prisma (timestamp không múi giờ, lưu theo UTC). Truyền thẳng Date thì
 * Postgres đổi cột theo múi giờ của phiên (server đặt Asia/Ho_Chi_Minh) và lệch 7 giờ.
 */
const ts = (d: Date) => Prisma.sql`(${d.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;

/** Sự kiện hệ thống tự phát, không phải hành động của người dùng */
const SYSTEM = Prisma.join(['brief_generated', 'portfolio_valued']);

export async function usageReport(prisma: PrismaClient, opts: { weeks?: number; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const weeks = opts.weeks ?? 8;
  const since = new Date(now.getTime() - weeks * 7 * 86_400_000);
  const d30 = new Date(now.getTime() - 30 * 86_400_000);

  const cohorts = await prisma.$queryRaw<
    {
      week: string;
      signups: number;
      onboarded: number;
      activated: number;
      d7_eligible: number;
      d7_retained: number;
      d30_eligible: number;
      d30_retained: number;
    }[]
  >(Prisma.sql`
    WITH u AS (
      SELECT id, "createdAt" AS signup_at,
             date_trunc('week', "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS week
      FROM "User" WHERE "createdAt" >= ${ts(since)}
    ),
    active AS (
      SELECT DISTINCT "userId" AS user_id, ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day
      FROM "AnalyticsEvent" WHERE "userId" IS NOT NULL AND sample = false AND name NOT IN (${SYSTEM})
    ),
    first_tx AS (
      SELECT "userId" AS user_id, min("createdAt") AS at FROM "Transaction"
      WHERE source IN ('manual', 'csv') GROUP BY "userId"
    )
    SELECT u.week::text AS week,
      count(*)::int AS signups,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "InvestorProfile" p WHERE p."userId" = u.id))::int AS onboarded,
      count(*) FILTER (WHERE f.at <= u.signup_at + interval '7 days')::int AS activated,
      count(*) FILTER (WHERE u.signup_at + interval '14 days' <= ${ts(now)})::int AS d7_eligible,
      count(*) FILTER (WHERE u.signup_at + interval '14 days' <= ${ts(now)} AND EXISTS (
        SELECT 1 FROM active a WHERE a.user_id = u.id
          AND a.day - (u.signup_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN 7 AND 13))::int AS d7_retained,
      count(*) FILTER (WHERE u.signup_at + interval '60 days' <= ${ts(now)})::int AS d30_eligible,
      count(*) FILTER (WHERE u.signup_at + interval '60 days' <= ${ts(now)} AND EXISTS (
        SELECT 1 FROM active a WHERE a.user_id = u.id
          AND a.day - (u.signup_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN 30 AND 59))::int AS d30_retained
    FROM u LEFT JOIN first_tx f ON f.user_id = u.id
    GROUP BY u.week ORDER BY u.week
  `);

  const [active] = await prisma.$queryRaw<{ dau: number; wau: number; mau: number }[]>(Prisma.sql`
    SELECT
      count(DISTINCT "userId") FILTER (WHERE "createdAt" >= ${ts(new Date(now.getTime() - 86_400_000))})::int AS dau,
      count(DISTINCT "userId") FILTER (WHERE "createdAt" >= ${ts(new Date(now.getTime() - 7 * 86_400_000))})::int AS wau,
      count(DISTINCT "userId")::int AS mau
    FROM "AnalyticsEvent"
    WHERE "userId" IS NOT NULL AND sample = false AND name NOT IN (${SYSTEM})
      AND "createdAt" >= ${ts(d30)} AND "createdAt" <= ${ts(now)}
  `);

  const briefs = await prisma.$queryRaw<{ kind: string; generated: number; opened: number; followed_up: number }[]>(
    Prisma.sql`
    SELECT g.props->>'kind' AS kind,
      count(*)::int AS generated,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "AnalyticsEvent" o
        WHERE o.name = 'brief_opened' AND o.actor = g.actor AND o."dedupeKey" = 'brief_opened:' || g."dedupeKey"))::int AS opened,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "AnalyticsEvent" o
        WHERE o.name = 'brief_followup' AND o.actor = g.actor AND o."dedupeKey" = 'brief_followup:' || g."dedupeKey"))::int AS followed_up
    FROM "AnalyticsEvent" g
    WHERE g.name = 'brief_generated' AND g.sample = false AND coalesce(g.props->>'test', 'false') <> 'true'
      AND g."createdAt" >= ${ts(d30)} AND g."createdAt" <= ${ts(now)}
    GROUP BY 1 ORDER BY 1
  `,
  );

  const counts = await prisma.$queryRaw<{ name: string; sample: boolean; events: number; actors: number }[]>(Prisma.sql`
    SELECT name, sample, count(*)::int AS events, count(DISTINCT actor)::int AS actors
    FROM "AnalyticsEvent" WHERE "createdAt" >= ${ts(d30)} AND "createdAt" <= ${ts(now)}
    GROUP BY name, sample ORDER BY name, sample
  `);

  // Chi phí AI theo chức năng: phần không rõ chi phí (thiếu usage / model chưa có giá) đếm riêng, không coi là 0
  const ai = await prisma.$queryRaw<
    {
      feature: string;
      calls: number;
      errors: number;
      cost_usd: number | null;
      unknown_cost_calls: number;
      users: number;
    }[]
  >(Prisma.sql`
    SELECT feature, count(*)::int AS calls,
      count(*) FILTER (WHERE outcome <> 'ok')::int AS errors,
      sum("costUsd")::float AS cost_usd,
      count(*) FILTER (WHERE "costUsd" IS NULL)::int AS unknown_cost_calls,
      count(DISTINCT "userId")::int AS users
    FROM "AiUsage" WHERE "createdAt" >= ${ts(d30)} AND "createdAt" <= ${ts(now)}
    GROUP BY feature ORDER BY cost_usd DESC NULLS LAST
  `);

  // Chi phí AI trên mỗi người dùng 30 ngày (cho mô hình chi phí / gói trả phí): chỉ tính phần chi phí đã biết
  const [perUser] = await prisma.$queryRaw<
    { users: number; avg_usd: number | null; p50_usd: number | null; p90_usd: number | null; max_usd: number | null }[]
  >(Prisma.sql`
    WITH u AS (
      SELECT "userId", sum("costUsd")::float AS cost FROM "AiUsage"
      WHERE "userId" IS NOT NULL AND "costUsd" IS NOT NULL AND "createdAt" >= ${ts(d30)} AND "createdAt" <= ${ts(now)}
      GROUP BY "userId"
    )
    SELECT count(*)::int AS users, avg(cost) AS avg_usd,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY cost) AS p50_usd,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY cost) AS p90_usd,
      max(cost) AS max_usd
    FROM u
  `);
  // Chi phí chung không gắn người dùng (đọc tin, …) chia đều cho người dùng hoạt động trong tháng
  const [shared] = await prisma.$queryRaw<{ cost_usd: number | null }[]>(Prisma.sql`
    SELECT sum("costUsd")::float AS cost_usd FROM "AiUsage"
    WHERE "userId" IS NULL AND "createdAt" >= ${ts(d30)} AND "createdAt" <= ${ts(now)}
  `);

  // Thời gian tới giá trị đầu tiên: từ đăng ký tới lần đầu xem danh mục sau khi đã có giao dịch thật
  const [ttfv] = await prisma.$queryRaw<{ users: number; median_hours: number | null; p90_hours: number | null }[]>(
    Prisma.sql`
    WITH u AS (SELECT id, "createdAt" AS signup_at FROM "User" WHERE "createdAt" >= ${ts(since)} AND "createdAt" <= ${ts(now)}),
    first_tx AS (SELECT "userId", min("createdAt") AS at FROM "Transaction" WHERE source IN ('manual', 'csv') GROUP BY "userId"),
    first_view AS (
      SELECT u.id, min(e."createdAt") AS at FROM u
      JOIN first_tx f ON f."userId" = u.id
      JOIN "AnalyticsEvent" e ON e."userId" = u.id AND e.name = 'portfolio_viewed' AND e."createdAt" >= f.at
      GROUP BY u.id
    )
    SELECT count(*)::int AS users,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM v.at - u.signup_at) / 3600) AS median_hours,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM v.at - u.signup_at) / 3600) AS p90_hours
    FROM first_view v JOIN u ON u.id = v.id
  `,
  );

  // Duy trì nhật ký: người có kế hoạch, bao nhiêu người xem lại ít nhất một lần trong 30 ngày; kế hoạch quá hạn
  const [plans] = await prisma.$queryRaw<{ users_with_plans: number; users_reviewed: number; overdue_plans: number }[]>(
    Prisma.sql`
    SELECT
      count(DISTINCT p."userId")::int AS users_with_plans,
      count(DISTINCT p."userId") FILTER (WHERE EXISTS (
        SELECT 1 FROM "PlanReview" r JOIN "InvestmentPlan" p2 ON p2.id = r."planId"
        WHERE p2."userId" = p."userId" AND r."createdAt" >= ${ts(d30)} AND r."createdAt" <= ${ts(now)}))::int AS users_reviewed,
      count(*) FILTER (WHERE p.status = 'active'
        AND p."nextReviewAt" < (${ts(now)} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 7)::int AS overdue_plans
    FROM "InvestmentPlan" p WHERE p."createdAt" <= ${ts(now)}
  `,
  );

  // Chất lượng dữ liệu: ngày-người theo trạng thái giá của danh mục (ok / thiếu giá / giá cũ)
  const quality = await prisma.$queryRaw<{ status: string; user_days: number }[]>(Prisma.sql`
    SELECT props->>'status' AS status, count(*)::int AS user_days FROM "AnalyticsEvent"
    WHERE name = 'portfolio_valued' AND "createdAt" >= ${ts(d30)} AND "createdAt" <= ${ts(now)}
    GROUP BY 1 ORDER BY 1
  `);

  // Chất lượng AI: tỷ lệ câu trả lời bị báo sai (theo lý do) và kết quả tự đối chiếu nguồn
  const [asked] = await prisma.$queryRaw<{ questions: number }[]>(Prisma.sql`
    SELECT count(*)::int AS questions FROM "AnalyticsEvent"
    WHERE name = 'advisor_asked' AND "createdAt" >= ${ts(d30)} AND "createdAt" <= ${ts(now)}
  `);
  const feedback = await prisma.$queryRaw<{ reason: string; reports: number }[]>(Prisma.sql`
    SELECT reason, count(*)::int AS reports FROM "AnswerFeedback"
    WHERE "createdAt" >= ${ts(d30)} AND "createdAt" <= ${ts(now)} GROUP BY 1 ORDER BY 2 DESC
  `);
  const verification = await prisma.$queryRaw<{ status: string; answers: number }[]>(Prisma.sql`
    SELECT meta->'verification'->>'status' AS status, count(*)::int AS answers FROM "ChatMessage"
    WHERE role = 'assistant' AND meta ? 'verification' AND "createdAt" >= ${ts(d30)} AND "createdAt" <= ${ts(now)}
    GROUP BY 1 ORDER BY 1
  `);

  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
  return {
    generatedAt: now.toISOString(),
    cohorts: cohorts.map((c) => ({
      ...c,
      activationPct: pct(c.activated, c.signups),
      d7Pct: pct(c.d7_retained, c.d7_eligible),
      d30Pct: pct(c.d30_retained, c.d30_eligible),
    })),
    active,
    briefs: briefs.map((b) => ({
      ...b,
      openPct: pct(b.opened, b.generated),
      followupPct: pct(b.followed_up, b.generated),
    })),
    last30Days: counts,
    aiCost30Days: ai,
    timeToFirstValue: ttfv,
    planReviews30Days: { ...plans, reviewedPct: pct(plans.users_reviewed, plans.users_with_plans) },
    dataQuality30Days: {
      byStatus: quality,
      okPct: pct(
        quality.find((q) => q.status === 'ok')?.user_days ?? 0,
        quality.reduce((s, q) => s + q.user_days, 0),
      ),
    },
    aiQuality30Days: {
      questions: asked.questions,
      reports: feedback.reduce((s, f) => s + f.reports, 0),
      reportPct: pct(
        feedback.reduce((s, f) => s + f.reports, 0),
        asked.questions,
      ),
      byReason: feedback,
      verification,
    },
    aiCostPerUser30Days: {
      ...perUser,
      sharedUsd: shared.cost_usd,
      sharedPerActiveUserUsd: shared.cost_usd !== null && active.mau ? shared.cost_usd / active.mau : null,
    },
  };
}
