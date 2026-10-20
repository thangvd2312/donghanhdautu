/**
 * Chạy bộ câu hỏi chấm điểm cố vấn:  npm run eval  [-- id1 id2 …]
 * Dùng tài khoản riêng eval@local với hồ sơ & danh mục cố định để kết quả các lần chạy so sánh được.
 * Báo cáo ghi vào backend/eval-reports/<thời điểm>.md và .json
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { AdvisorModule } from '../advisor/advisor.module';
import { AiModule } from '../ai/ai-usage.service';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AdvisorEvent, AdvisorService } from '../advisor/advisor.service';
import { classifySource } from '../advisor/source-tiers';
import type { Verification } from '../advisor/verifier.service';
import { LlmService } from '../alerts/llm.service';
import { PrismaModule, PrismaService } from '../prisma/prisma.module';
import { scoreQuiz } from '../profile/quiz';
import { EVAL_CASES, EvalCase } from './cases';

/** App gọn cho chấm điểm: không có ScheduleModule nên không chạy quét cảnh báo / gửi thông báo */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AnalyticsModule, AiModule, AdvisorModule],
  providers: [LlmService],
})
class EvalAppModule {}

// Bộ chấm điểm hỏi liên tục nhiều câu: không áp quota hỏi mỗi ngày của người dùng thường
process.env.AI_CHAT_DAILY_LIMIT ??= '100000';

const EVAL_EMAIL = 'eval@local';

const ANSWERS = {
  goal: 'accumulate',
  horizon: 'long',
  drawdown: '20',
  reaction: 'sell_some',
  experience: 'some',
  income_share: 'half',
  emergency: 'yes',
  margin: 'never',
  decision: 'groups',
  fomo_history: 'often',
};

const HOLDINGS = [
  { assetType: 'crypto', symbol: 'BTCUSDT', quantity: 0.05, avgCost: 95000 },
  { assetType: 'gold', symbol: 'SJL1L10', quantity: 2, avgCost: 120_000_000 },
  { assetType: 'cash', symbol: 'VND', quantity: 100_000_000, avgCost: 1 },
  { assetType: 'stock', symbol: 'FPT', quantity: 1000, avgCost: 75000 },
  { assetType: 'stock', symbol: 'HPG', quantity: 2000, avgCost: 28000 },
];

const JUDGE_PROMPT = `Bạn là chuyên gia đầu tư lâu năm, chấm chất lượng câu trả lời của một cố vấn AI cho nhà đầu tư cá nhân Việt Nam.
Chấm theo tiêu chí riêng (rubric) của câu hỏi, cộng các tiêu chí chung: dẫn chứng có nguồn, phân biệt dữ kiện và nhận định, kết luận rõ ràng, phù hợp hồ sơ người dùng, không hứa lợi nhuận, độ dài hợp với câu hỏi.
score: 1–5 (5 = như một chuyên gia giỏi viết, 3 = dùng được nhưng có thiếu sót, 1 = sai hoặc có hại).
pass: true nếu đáp ứng các điểm bắt buộc trong rubric và không có lỗi nghiêm trọng.
reasons: tối đa 4 ý ngắn, nêu điểm mạnh/yếu chính.

Lưu ý khi chấm: câu hỏi được hỏi vào thời điểm today (có thể sau mốc kiến thức của bạn). Cố vấn lấy số liệu từ công cụ thời gian thực (bảng giá, báo cáo tài chính, trang Ngân hàng Nhà nước, Fed…), nên ngày tháng và số liệu gần today là bình thường — không coi là bịa chỉ vì bạn chưa biết. Trường sourceCheck là kết quả bộ đối chiếu tự động giữa câu trả lời và dữ liệu công cụ: "verified" nghĩa là các con số đã khớp nguồn. Chỉ trừ điểm về số liệu khi sourceCheck báo sai lệch hoặc con số rõ ràng mâu thuẫn nội bộ.`;

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'integer' },
    pass: { type: 'boolean' },
    reasons: { type: 'array', items: { type: 'string' } },
  },
  required: ['score', 'pass', 'reasons'],
  additionalProperties: false,
};

interface CaseResult {
  id: string;
  category: string;
  question: string;
  answer: string;
  tools: string[];
  seconds: number;
  error: string | null;
  checks: { name: string; ok: boolean; detail: string }[];
  verification: Verification | null;
  judge: { score: number; pass: boolean; reasons: string[] } | null;
  pass: boolean;
}

async function main() {
  const only = process.argv.slice(2);
  const cases = only.length ? EVAL_CASES.filter((c) => only.includes(c.id)) : EVAL_CASES;
  const app = await NestFactory.createApplicationContext(EvalAppModule, { logger: ['error', 'warn'] });
  const prisma = app.get(PrismaService);
  const advisor = app.get(AdvisorService);
  const llm = app.get(LlmService);

  const userId = await prepareUser(prisma);
  // Chờ bảng giá có dữ liệu (định giá danh mục, VN30) trước khi hỏi
  await new Promise((r) => setTimeout(r, 8000));

  const results: CaseResult[] = [];
  for (const c of cases) {
    process.stdout.write(`▶ ${c.id} … `);
    const r = await runCase(c, userId, advisor, prisma, llm);
    results.push(r);
    console.log(`${r.pass ? 'ĐẠT' : 'KHÔNG ĐẠT'} (điểm ${r.judge?.score ?? '–'}, ${r.seconds}s)`);
  }

  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  const dir = join(process.cwd(), 'eval-reports');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${stamp}.json`), JSON.stringify(results, null, 2));
  writeFileSync(join(dir, `${stamp}.md`), report(results));
  const passed = results.filter((r) => r.pass).length;
  const avg = results.reduce((s, r) => s + (r.judge?.score ?? 0), 0) / results.length;
  console.log(`\nKết quả: ${passed}/${results.length} đạt, điểm trung bình ${avg.toFixed(2)}/5`);
  console.log(`Báo cáo: eval-reports/${stamp}.md`);
  await app.close();
  process.exit(0);
}

async function prepareUser(prisma: PrismaService) {
  const user = await prisma.user.upsert({
    where: { email: EVAL_EMAIL },
    create: { email: EVAL_EMAIL, name: 'Người dùng đánh giá' },
    update: {},
  });
  const scored = scoreQuiz(ANSWERS);
  await prisma.investorProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      ...scored,
      answers: ANSWERS,
      macroAlerts: false,
      morningBrief: false,
      closingBrief: false,
    },
    update: { ...scored, answers: ANSWERS },
  });
  await prisma.holding.deleteMany({ where: { userId: user.id } });
  await prisma.holding.createMany({ data: HOLDINGS.map((h) => ({ ...h, userId: user.id })) });
  await prisma.conversation.deleteMany({ where: { userId: user.id } });
  return user.id;
}

async function runCase(
  c: EvalCase,
  userId: string,
  advisor: AdvisorService,
  prisma: PrismaService,
  llm: LlmService,
): Promise<CaseResult> {
  const t0 = Date.now();
  let answer = '';
  let convId: string | null = null;
  let error: string | null = null;
  let verification: Verification | null = null;
  const emit = (e: AdvisorEvent) => {
    if (e.type === 'text') answer += e.text;
    if (e.type === 'conversation') convId = e.id;
    if (e.type === 'error') error = e.message;
    if (e.type === 'verification') {
      const { type: _t, ...v } = e;
      void _t;
      verification = v;
    }
  };
  try {
    await advisor.chat(userId, undefined, c.question, emit, new AbortController().signal);
  } catch (e) {
    error = (e as Error).message;
  }

  // Tên công cụ thực tế đã gọi (đọc từ lịch sử đã lưu)
  const tools: string[] = [];
  const urls: string[] = [];
  if (convId) {
    const msgs = await prisma.chatMessage.findMany({ where: { conversationId: convId }, orderBy: { seq: 'asc' } });
    for (const m of msgs) {
      for (const b of m.content as unknown as { type: string; name?: string; content?: unknown }[]) {
        if (b.type === 'tool_use' && b.name) tools.push(b.name);
        if (b.type === 'server_tool_use' && b.name) tools.push(b.name);
      }
    }
  }
  for (const m of answer.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) urls.push(m[1]);

  const checks: CaseResult['checks'] = [];
  for (const group of c.mustUseTools ?? []) {
    const ok = group.some((g) => tools.includes(g));
    checks.push({
      name: `gọi công cụ ${group.join(' / ')}`,
      ok,
      detail: ok ? '' : `đã gọi: ${tools.join(', ') || 'không có'}`,
    });
  }
  for (const m of c.mustMatch ?? []) {
    const ok = new RegExp(m.re, 'i').test(answer);
    checks.push({ name: m.why, ok, detail: ok ? '' : `không thấy /${m.re}/` });
  }
  for (const m of c.mustNotMatch ?? []) {
    const hit = answer.match(new RegExp(m.re, 'i'));
    checks.push({ name: m.why, ok: !hit, detail: hit ? `có "${hit[0]}"` : '' });
  }
  const emoji = answer.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  checks.push({ name: 'không dùng emoji', ok: !emoji, detail: emoji ? `có ${emoji[0]}` : '' });
  const tier3 = urls.filter((u) => classifySource(u).tier === 3 && !/sbv|chinhphu|gov/.test(u));
  checks.push({ name: 'không trích nguồn cấp 3', ok: !tier3.length, detail: tier3.join(', ') });
  checks.push({ name: 'không lỗi hệ thống', ok: !error, detail: error ?? '' });
  const v = verification as Verification | null;
  const fixable = v?.issues.filter((i) => i.type !== 'unsupported').length ?? 0;
  checks.push({
    name: 'đối chiếu nguồn: không sai số / sai nguồn',
    ok: fixable === 0,
    detail: fixable ? v!.issues.map((i) => `${i.type}: ${i.quote}`).join(' | ') : '',
  });

  const judge = answer.trim()
    ? await llm.json<{ score: number; pass: boolean; reasons: string[] }>({
        tier: 'brief',
        feature: 'eval',
        system: JUDGE_PROMPT,
        user: JSON.stringify({
          today: new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
          question: c.question,
          rubric: c.rubric,
          sourceCheck: (verification as Verification | null)?.status ?? 'không chạy (không có dữ liệu công cụ)',
          toolsCalled: tools,
          userContext:
            'Hồ sơ: Cân bằng, dài hạn, chịu lỗ tối đa 20%, dễ FOMO. Danh mục: vàng SJC ~48%, BTC ~18%, tiền mặt ~17%, FPT ~10% (lỗ ~22%), HPG ~7% (lỗ ~25%).',
          answer,
        }),
        schema: JUDGE_SCHEMA,
        maxTokens: 3000,
      })
    : null;

  const pass = checks.every((x) => x.ok) && !!judge?.pass;
  return {
    id: c.id,
    category: c.category,
    question: c.question,
    answer,
    tools,
    seconds: Math.round((Date.now() - t0) / 1000),
    error,
    checks,
    verification: v,
    judge,
    pass,
  };
}

function report(results: CaseResult[]) {
  const passed = results.filter((r) => r.pass).length;
  const avg = results.reduce((s, r) => s + (r.judge?.score ?? 0), 0) / results.length;
  const lines = [
    `# Báo cáo chấm điểm cố vấn — ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
    '',
    `**${passed}/${results.length} đạt** · điểm trung bình **${avg.toFixed(2)}/5**`,
    '',
    '| Câu | Nhóm | Kết quả | Điểm | Kiểm tra trượt | Thời gian |',
    '|---|---|---|---|---|---|',
    ...results.map(
      (r) =>
        `| ${r.id} | ${r.category} | ${r.pass ? 'Đạt' : '**Không đạt**'} | ${r.judge?.score ?? '–'} | ${
          r.checks
            .filter((c) => !c.ok)
            .map((c) => c.name)
            .join('; ') || '—'
        } | ${r.seconds}s |`,
    ),
    '',
  ];
  for (const r of results) {
    lines.push(`## ${r.id} — ${r.pass ? 'Đạt' : 'Không đạt'}`, '', `**Câu hỏi:** ${r.question}`, '');
    lines.push(`**Công cụ:** ${r.tools.join(', ') || '—'}`, '');
    lines.push(
      '**Kiểm tra:**',
      ...r.checks.map((c) => `- ${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`),
      '',
    );
    if (r.verification)
      lines.push(
        `**Đối chiếu nguồn:** ${r.verification.status}${r.verification.issues.length ? ` (${r.verification.issues.length} điểm)` : ''}`,
        '',
      );
    if (r.judge) lines.push(`**Chấm điểm (${r.judge.score}/5):**`, ...r.judge.reasons.map((x) => `- ${x}`), '');
    lines.push('<details><summary>Câu trả lời</summary>', '', r.answer, '', '</details>', '');
  }
  return lines.join('\n');
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
