/**
 * Luồng chat cố vấn từ đầu tới cuối trên PostgreSQL thật, model AI giả lập: quota phía server, một câu mỗi lúc,
 * huỷ giữa chừng, model lỗi, lịch sử quá dài, lượt trước dừng giữa lúc gọi công cụ — và usage luôn được ghi,
 * lượt giữ chỗ luôn được giải phóng.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { ConfigService } from '@nestjs/config';
import { AiUsageService } from '../ai/ai-usage.service';
import { MAX_HISTORY_CHARS } from '../ai/history';
import { AnalyticsService } from '../analytics/analytics.service';
import { testPrisma, testUser } from '../test-utils/test-db';
import { AdvisorEvent, AdvisorService } from './advisor.service';
import type { AdvisorTools } from './tools';
import type { VerifierService } from './verifier.service';

const prisma = testPrisma();
const aiUsage = new AiUsageService(prisma);
const tools = { list: () => [], label: () => '', run: () => Promise.resolve({ ok: true, content: '{}' }) };
const config = { get: () => undefined } as unknown as ConfigService;

afterAll(() => prisma.$disconnect());

type Reply = Anthropic.Beta.BetaMessage;
/** Model giả: mỗi lần gọi lấy một phản hồi (hoặc lỗi) theo thứ tự; ghi lại các messages đã gửi */
function fakeModel(replies: ((signal: AbortSignal) => Promise<Reply>)[]) {
  const sent: Anthropic.Beta.BetaMessageParam[][] = [];
  const stream = (params: { messages: Anthropic.Beta.BetaMessageParam[] }, opts: { signal: AbortSignal }) => {
    sent.push(JSON.parse(JSON.stringify(params.messages)) as Anthropic.Beta.BetaMessageParam[]);
    const next = replies.shift() ?? (() => Promise.reject(new Error('hết phản hồi giả')));
    const s = { on: () => s, finalMessage: () => next(opts.signal) };
    return s;
  };
  return { client: { messages: { stream }, beta: { messages: { stream } } }, sent };
}

const answer = (text: string, extra: Partial<Reply> = {}): Reply =>
  ({
    id: 'msg',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [{ type: 'text', text, citations: null }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 1000, output_tokens: 200 },
    ...extra,
  }) as unknown as Reply;

function advisor(model: ReturnType<typeof fakeModel>) {
  const s = new AdvisorService(
    config,
    prisma,
    tools as unknown as AdvisorTools,
    { verify: () => Promise.reject(new Error('không dùng')) } as unknown as VerifierService,
    new AnalyticsService(prisma),
    aiUsage,
  );
  Object.assign(s, { client: model.client, model: 'claude-opus-5-5' });
  return s;
}

async function ask(s: AdvisorService, userId: string, message: string, conversationId?: string, signal?: AbortSignal) {
  const events: AdvisorEvent[] = [];
  await s.chat(userId, conversationId, message, (e) => events.push(e), signal ?? new AbortController().signal);
  return events;
}

const running = (userId: string) => prisma.aiRequest.count({ where: { userId, status: 'running' } });
const usage = (userId: string) =>
  prisma.aiUsage.findMany({ where: { userId, feature: 'chat' }, orderBy: { createdAt: 'asc' } });

describe('chat cố vấn (PostgreSQL, model giả)', () => {
  it('trả lời bình thường: lưu hội thoại, ghi usage và chi phí, giải phóng lượt', async () => {
    const u = await testUser(prisma, 'chat-ok');
    const m = fakeModel([() => Promise.resolve(answer('FPT là doanh nghiệp công nghệ.'))]);
    const events = await ask(advisor(m), u.id, 'FPT thế nào?');
    expect(events.at(-1)).toMatchObject({ type: 'done' });
    expect(await running(u.id)).toBe(0);
    const [rec] = await usage(u.id);
    expect(rec).toMatchObject({ outcome: 'ok', inputTokens: 1000, outputTokens: 200 });
    expect(rec.costUsd?.toNumber()).toBeCloseTo(0.008);
  });

  it('hết lượt hỏi trong ngày: báo dễ hiểu, không gọi model, không tạo hội thoại', async () => {
    const u = await testUser(prisma, 'chat-limit');
    await prisma.aiRequest.createMany({
      data: Array.from({ length: aiUsage.limits.chat }, () => ({ userId: u.id, kind: 'chat', status: 'done' })),
    });
    const m = fakeModel([]);
    const events = await ask(advisor(m), u.id, 'Câu tiếp');
    expect(events).toEqual([{ type: 'error', message: expect.stringContaining('hết') as string }]);
    expect(m.sent).toHaveLength(0);
    expect(await prisma.conversation.count({ where: { userId: u.id } })).toBe(0);
  });

  it('gửi câu thứ hai khi câu đầu chưa xong: câu thứ hai bị từ chối, câu đầu vẫn trả lời', async () => {
    const u = await testUser(prisma, 'chat-concurrent');
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const m = fakeModel([() => gate.then(() => answer('Xong câu đầu'))]);
    const s = advisor(m);
    const first = ask(s, u.id, 'Câu 1');
    await new Promise((r) => setTimeout(r, 100));
    const second = await ask(s, u.id, 'Câu 2');
    expect(second).toEqual([{ type: 'error', message: expect.stringContaining('đang trả lời câu trước') as string }]);
    release();
    expect((await first).at(-1)).toMatchObject({ type: 'done' });
    expect(await running(u.id)).toBe(0);
  });

  it('người dùng huỷ giữa chừng: ghi usage "aborted", giải phóng lượt, không báo xong', async () => {
    const u = await testUser(prisma, 'chat-abort');
    const ctrl = new AbortController();
    const m = fakeModel([
      (signal) =>
        new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('Request was aborted.')))),
    ]);
    const pending = ask(advisor(m), u.id, 'Câu dài', undefined, ctrl.signal);
    await new Promise((r) => setTimeout(r, 100));
    ctrl.abort();
    const events = await pending;
    expect(events.some((e) => e.type === 'done')).toBe(false);
    expect(await running(u.id)).toBe(0);
    expect((await usage(u.id)).map((x) => [x.outcome, x.costUsd])).toEqual([['aborted', null]]);
  });

  it('model lỗi: báo lỗi dễ hiểu, ghi usage "error", giải phóng lượt', async () => {
    const u = await testUser(prisma, 'chat-error');
    const m = fakeModel([
      () => Promise.reject(new Anthropic.InternalServerError(500, undefined, 'boom', new Headers())),
    ]);
    const events = await ask(advisor(m), u.id, 'Hỏi');
    expect(events.at(-1)).toEqual({ type: 'error', message: expect.stringContaining('Lỗi từ dịch vụ AI') as string });
    expect(await running(u.id)).toBe(0);
    expect((await usage(u.id)).map((x) => x.outcome)).toEqual(['error']);
  });

  it('lượt trước dừng giữa lúc gọi công cụ: nối kết quả "bị dừng" để lịch sử gửi lên vẫn hợp lệ', async () => {
    const u = await testUser(prisma, 'chat-tool');
    const conv = await prisma.conversation.create({ data: { userId: u.id, title: 'FPT' } });
    await prisma.chatMessage.create({
      data: { conversationId: conv.id, role: 'user', content: [{ type: 'text', text: 'Giá FPT?' }] },
    });
    await prisma.chatMessage.create({
      data: {
        conversationId: conv.id,
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tu_1', name: 'get_stock', input: { symbol: 'FPT' } }],
      },
    });
    const m = fakeModel([() => Promise.resolve(answer('Trả lời lại'))]);
    const events = await ask(advisor(m), u.id, 'Thử lại', conv.id);
    expect(events.at(-1)).toMatchObject({ type: 'done' });
    const sent = m.sent[0];
    // Ngay sau tool_use là tool_result báo lỗi, rồi mới tới câu hỏi mới
    expect(sent[2]).toMatchObject({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tu_1', is_error: true }],
    });
    expect(sent[3].role).toBe('user');
  });

  it('hội thoại quá dài: mời mở cuộc trò chuyện mới, không gọi model', async () => {
    const u = await testUser(prisma, 'chat-long');
    const conv = await prisma.conversation.create({ data: { userId: u.id, title: 'Dài' } });
    await prisma.chatMessage.create({
      data: {
        conversationId: conv.id,
        role: 'user',
        content: [{ type: 'text', text: 'x'.repeat(MAX_HISTORY_CHARS + 10) }],
      },
    });
    const m = fakeModel([]);
    const events = await ask(advisor(m), u.id, 'Tiếp', conv.id);
    expect(events.at(-1)).toEqual({ type: 'error', message: expect.stringContaining('cuộc trò chuyện mới') as string });
    expect(m.sent).toHaveLength(0);
    expect(await running(u.id)).toBe(0);
  });
});
