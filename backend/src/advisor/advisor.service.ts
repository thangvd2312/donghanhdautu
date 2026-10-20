import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageStream } from '@anthropic-ai/sdk/lib/BetaMessageStream';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { compatMode, createAnthropicClient } from '../common/anthropic';
import { Prisma } from '@prisma/client';
import { VN_TZ } from '../market/types';
import { PrismaService } from '../prisma/prisma.module';
import { ADVISOR_SYSTEM_PROMPT } from './prompt';
import { AdvisorTools } from './tools';
import { Evidence, Verification, VerifierService } from './verifier.service';

export type AdvisorEvent =
  | { type: 'conversation'; id: string; title: string }
  | { type: 'thinking'; text: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; label: string }
  | { type: 'sources'; items: { title: string; url: string }[] }
  | { type: 'verifying' }
  | ({ type: 'verification' } & Verification)
  | { type: 'done'; answerId: string | null }
  | { type: 'error'; message: string };

const MAX_TURNS = 15;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const TIME_PREFIX = /^\[Thời điểm hiện tại: [^\]]*\]\n/;

@Injectable()
export class AdvisorService {
  private log = new Logger(AdvisorService.name);
  private client: Anthropic | null;
  private model: string;

  constructor(
    config: ConfigService,
    private prisma: PrismaService,
    private tools: AdvisorTools,
    private verifier: VerifierService,
  ) {
    this.client = createAnthropicClient();
    this.model = config.get<string>('LLM_MODEL_ADVISOR') || config.get<string>('LLM_MODEL') || 'claude-opus-5-5';
  }

  get enabled() {
    return !!this.client;
  }

  listConversations(userId: string) {
    return this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, updatedAt: true },
      take: 50,
    });
  }

  async deleteConversation(userId: string, id: string) {
    await this.prisma.conversation.deleteMany({ where: { id, userId } });
    return { ok: true };
  }

  /** Gộp các message lưu trong DB thành dạng hiển thị: mỗi lượt user + một khối trả lời */
  async getConversation(userId: string, id: string) {
    const conv = await this.prisma.conversation.findFirst({
      where: { id, userId },
      include: { messages: { orderBy: { seq: 'asc' } } },
    });
    if (!conv) throw new NotFoundException('Không tìm thấy cuộc trò chuyện');
    const out: {
      id?: string;
      role: 'user' | 'assistant';
      text: string;
      tools: string[];
      sources: { title: string; url: string }[];
      verification?: Verification;
      feedback?: string;
    }[] = [];
    const toolNameById = new Map<string, string>();
    for (const m of conv.messages) {
      const blocks = m.content as unknown as Anthropic.Beta.BetaContentBlock[];
      if (m.role === 'user') {
        if (!m.visible) {
          // tool_result của search_web / read_webpage: lấy link để hiện mục "nguồn web đã tham khảo"
          const last = out[out.length - 1];
          if (last?.role === 'assistant') {
            for (const b of blocks as unknown as Anthropic.Beta.BetaToolResultBlockParam[]) {
              if (b.type !== 'tool_result' || typeof b.content !== 'string') continue;
              const name = toolNameById.get(b.tool_use_id);
              if (name) last.sources.push(...sourcesOfToolResult(name, b.content));
            }
            last.sources = dedupe(last.sources);
          }
          continue;
        }
        const text = blocks
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
          .map((b) => b.text.replace(TIME_PREFIX, ''))
          .join('\n');
        out.push({ role: 'user', text, tools: [], sources: [] });
        continue;
      }
      let last = out[out.length - 1];
      if (!last || last.role !== 'assistant') {
        last = { id: m.id, role: 'assistant', text: '', tools: [], sources: [] };
        out.push(last);
      }
      const meta = m.meta as { verification?: Verification } | null;
      if (meta?.verification) last.verification = meta.verification;
      for (const b of blocks) {
        if (b.type === 'text') last.text += b.text;
        if (b.type === 'tool_use') {
          last.tools.push(this.tools.label(b.name, b.input));
          toolNameById.set(b.id, b.name);
        }
        if (b.type === 'server_tool_use') last.tools.push(searchLabel(b.input));
        last.sources.push(...sourcesOf(b));
      }
      last.sources = dedupe(last.sources);
    }
    const feedback = await this.prisma.answerFeedback.findMany({
      where: { userId, conversationId: id },
      select: { answerId: true, reason: true },
    });
    for (const f of feedback) {
      const m = out.find((x) => x.id === f.answerId);
      if (m) m.feedback = f.reason;
    }
    return { id: conv.id, title: conv.title, messages: out };
  }

  /** Người dùng báo một câu trả lời sai / chưa tốt. Lưu kèm câu hỏi + câu trả lời để đưa vào bộ chấm điểm. */
  async submitFeedback(userId: string, conversationId: string, answerId: string, reason: string, note?: string) {
    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      include: { messages: { orderBy: { seq: 'asc' } } },
    });
    const idx = conv?.messages.findIndex((m) => m.id === answerId && m.role === 'assistant') ?? -1;
    if (!conv || idx < 0) throw new NotFoundException('Không tìm thấy câu trả lời');
    const textOf = (m: { content: unknown }) =>
      (m.content as { type: string; text?: string }[])
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('\n');
    const question = [...conv.messages.slice(0, idx)].reverse().find((m) => m.role === 'user' && m.visible);
    const answerParts: string[] = [];
    for (const m of conv.messages.slice(idx)) {
      if (m.role === 'user' && m.visible) break;
      if (m.role === 'assistant') answerParts.push(textOf(m));
    }
    const data = {
      reason,
      note: note?.trim() || null,
      question: question ? textOf(question).replace(TIME_PREFIX, '') : '',
      answer: answerParts.join(''),
      status: 'open',
    };
    await this.prisma.answerFeedback.upsert({
      where: { userId_answerId: { userId, answerId } },
      create: { userId, conversationId, answerId, ...data },
      update: data,
    });
    this.log.warn(`Người dùng báo câu trả lời ${answerId} (${reason})${data.note ? `: ${data.note}` : ''}`);
    return { ok: true };
  }

  /**
   * Một lượt hỏi–đáp. Lịch sử gửi lên API được dựng lại y nguyên từ DB và chỉ nối thêm,
   * để prompt cache và thinking blocks của các lượt trước luôn hợp lệ.
   */
  async chat(
    userId: string,
    conversationId: string | undefined,
    message: string,
    emit: (e: AdvisorEvent) => void,
    signal: AbortSignal,
  ) {
    if (!this.client) {
      emit({
        type: 'error',
        message: 'Máy chủ chưa cấu hình LLM_API_KEY nên cố vấn AI chưa hoạt động. Thêm key vào backend/.env rồi khởi động lại.',
      });
      return;
    }

    const conv = conversationId
      ? await this.prisma.conversation.findFirst({ where: { id: conversationId, userId } })
      : await this.prisma.conversation.create({
          data: { userId, title: message.slice(0, 80) },
        });
    if (!conv) throw new NotFoundException('Không tìm thấy cuộc trò chuyện');
    emit({ type: 'conversation', id: conv.id, title: conv.title });

    const stored = await this.prisma.chatMessage.findMany({
      where: { conversationId: conv.id },
      orderBy: { seq: 'asc' },
    });
    const messages: Anthropic.Beta.BetaMessageParam[] = stored.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content as unknown as Anthropic.Beta.BetaContentBlockParam[],
    }));

    const userContent: Anthropic.Beta.BetaContentBlockParam[] = [
      { type: 'text', text: `[Thời điểm hiện tại: ${nowVn()}]\n${message}` },
    ];
    await this.save(conv.id, 'user', userContent, true);
    messages.push({ role: 'user', content: userContent });

    const ctx: TurnContext = { convId: conv.id, userId, messages, emit, signal, evidence: [], answer: [], lastAssistantId: null, firstAssistantId: null };
    if (!(await this.runTurns(ctx, MAX_TURNS))) return;

    // Lớp kiểm tra: đối chiếu câu trả lời với chính dữ liệu cố vấn đã dùng
    await this.verifyAndCorrect(ctx);

    await this.prisma.conversation.update({ where: { id: conv.id }, data: { updatedAt: new Date() } });
    emit({ type: 'done', answerId: ctx.firstAssistantId });
  }

  private async verifyAndCorrect(ctx: TurnContext) {
    const answer = ctx.answer.join('\n');
    if (!ctx.evidence.length || answer.trim().length < 150 || !ctx.lastAssistantId) return;
    ctx.emit({ type: 'verifying' });
    let v: Verification;
    try {
      v = await this.verifier.verify(answer, ctx.evidence);
    } catch (e) {
      this.log.warn(`Đối chiếu nguồn lỗi: ${(e as Error).message}`);
      return;
    }
    await this.prisma.chatMessage.update({
      where: { id: ctx.lastAssistantId },
      data: { meta: { verification: v } as unknown as Prisma.InputJsonValue },
    });
    ctx.emit({ type: 'verification', ...v });

    // Sai số hoặc sai nguồn (đã có trích dẫn chứng minh) → cố vấn tự viết đính chính ngay bên dưới.
    // "unsupported" chỉ cảnh báo cho người dùng, không tự sửa (bộ kiểm tra cũng có thể thiếu ngữ cảnh).
    const fixable = v.issues.filter((i) => i.type !== 'unsupported');
    if (!fixable.length || ctx.signal.aborted) return;
    const list = fixable
      .map((i, n) => `${n + 1}. Câu trong trả lời: "${i.quote}" — ${i.explanation} Dữ liệu nguồn ghi: "${i.evidenceQuote}". Thông tin đúng: ${i.correction}`)
      .join('\n');
    const note: Anthropic.Beta.BetaContentBlockParam[] = [
      {
        type: 'text',
        text: `[Kiểm tra tự động — không phải tin nhắn của người dùng] Bộ đối chiếu nguồn phát hiện các điểm sau trong câu trả lời vừa rồi không khớp với dữ liệu bạn đã dùng:\n${list}\n\nHãy viết một đoạn ngắn, mở đầu bằng dòng "**Đính chính sau khi đối chiếu nguồn:**", sửa từng điểm theo dữ liệu đúng và nói rõ kết luận có thay đổi hay không. Nếu bạn chắc một điểm bị báo nhầm, giải thích ngắn bằng dẫn chứng. Không lặp lại toàn bộ câu trả lời, không gọi thêm công cụ trừ khi thật cần.`,
      },
    ];
    await this.save(ctx.convId, 'user', note, false);
    ctx.messages.push({ role: 'user', content: note });
    ctx.emit({ type: 'text', text: '\n\n---\n\n' });
    ctx.answer = [];
    if (await this.runTurns(ctx, 3)) {
      if (ctx.lastAssistantId) {
        await this.prisma.chatMessage.update({
          where: { id: ctx.lastAssistantId },
          data: { meta: { correction: true } as unknown as Prisma.InputJsonValue },
        });
      }
    }
  }

  /** Vòng hỏi–đáp với model (gọi công cụ tới khi xong). Trả false nếu dừng giữa chừng (lỗi, huỷ, từ chối). */
  private async runTurns(ctx: TurnContext, maxTurns: number): Promise<boolean> {
    const { convId: convIdForSave, userId, messages, emit, signal } = ctx;
    const client = this.client!;
    let jsonRetries = 0;
    for (let turn = 0; turn < maxTurns; turn++) {
      if (signal.aborted) return false;
      const compat = compatMode();
      const stream: BetaMessageStream = compat
        ? // Router bên thứ ba: endpoint /v1/messages thường, chỉ dùng tính năng cơ bản.
          // Hai loại stream có cùng sự kiện nên ép kiểu về beta để xử lý chung.
          (client.messages.stream(
            {
              model: this.model,
              max_tokens: 32000,
              system: ADVISOR_SYSTEM_PROMPT,
              tools: this.tools.list(true) as Anthropic.Tool[],
              messages: messages as Anthropic.MessageParam[],
            },
            { signal },
          ) as unknown as BetaMessageStream)
        : client.beta.messages.stream(
            {
              model: this.model,
              max_tokens: 64000,
              betas: [FALLBACK_BETA],
              fallbacks: 'default',
              thinking: { type: 'adaptive', display: 'summarized' },
              output_config: { effort: 'high' },
              cache_control: { type: 'ephemeral' },
              system: ADVISOR_SYSTEM_PROMPT,
              tools: this.tools.list(),
              messages,
            },
            { signal },
          );

      stream.on('thinking', (delta) => emit({ type: 'thinking', text: delta }));
      stream.on('text', (delta) => emit({ type: 'text', text: delta }));
      stream.on('contentBlock', (block) => {
        // Nhãn tool_use phát sau khi có finalMessage: qua router, block lúc stream có thể chưa đúng tên
        if (block.type === 'server_tool_use') emit({ type: 'tool', label: searchLabel(block.input) });
        const src = sourcesOf(block);
        if (src.length) emit({ type: 'sources', items: src });
      });

      let response: Anthropic.Beta.BetaMessage;
      try {
        response = await stream.finalMessage();
        jsonRetries = 0;
      } catch (err) {
        if (signal.aborted) return false;
        // Chỉ thử lại khi input của tool không parse được JSON; lỗi API thì báo luôn
        if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) {
          this.log.error(err);
          emit({ type: 'error', message: friendlyError(err) });
          return false;
        }
        continue;
      }

      if (response.stop_reason === 'refusal') {
        emit({ type: 'error', message: 'Xin lỗi, tôi không thể hỗ trợ yêu cầu này.' });
        return false;
      }

      const toolUses = response.content.filter(
        (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use',
      );
      for (const t of toolUses) emit({ type: 'tool', label: this.tools.label(t.name, t.input) });
      if (response.stop_reason === 'max_tokens' && toolUses.length) {
        emit({ type: 'error', message: 'Câu trả lời quá dài, bị cắt giữa chừng. Hãy hỏi cụ thể hơn.' });
        return false;
      }

      const savedAssistant = await this.save(convIdForSave, 'assistant', response.content, true);
      ctx.lastAssistantId = savedAssistant.id;
      ctx.firstAssistantId ??= savedAssistant.id;
      for (const b of response.content) if (b.type === 'text') ctx.answer.push(b.text);
      messages.push({ role: 'assistant', content: response.content as Anthropic.Beta.BetaContentBlockParam[] });

      if (response.stop_reason === 'pause_turn') continue;
      if (!toolUses.length) break;

      const results = await Promise.all(
        toolUses.map(async (t): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
          const r = await this.tools.run(t.name, t.input, userId);
          if (r.ok) ctx.evidence.push({ id: `${t.name}#${ctx.evidence.length + 1}`, tool: t.name, input: t.input, content: r.content });
          if (r.ok) {
            const src = sourcesOfToolResult(t.name, r.content);
            if (src.length) emit({ type: 'sources', items: src });
          }
          return { type: 'tool_result', tool_use_id: t.id, content: r.content, is_error: !r.ok || undefined };
        }),
      );
      await this.save(convIdForSave, 'user', results, false);
      messages.push({ role: 'user', content: results });
    }
    return true;
  }


  private save(conversationId: string, role: 'user' | 'assistant', content: unknown, visible: boolean) {
    return this.prisma.chatMessage.create({
      data: { conversationId, role, content: content as Prisma.InputJsonValue, visible },
    });
  }
}

interface TurnContext {
  convId: string;
  userId: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  emit: (e: AdvisorEvent) => void;
  signal: AbortSignal;
  /** Dữ liệu công cụ trả về trong lượt này — dùng để đối chiếu câu trả lời */
  evidence: Evidence[];
  /** Phần chữ cố vấn đã viết trong lượt này */
  answer: string[];
  lastAssistantId: string | null;
  /** id message đầu tiên của câu trả lời — dùng làm khoá cho phản hồi "Báo sai" */
  firstAssistantId: string | null;
}

function nowVn() {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: VN_TZ,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
}

function searchLabel(input: unknown) {
  const q = (input as { query?: string } | null)?.query;
  return q ? `Tìm trên web: "${q}"` : 'Tìm trên web';
}

function sourcesOf(block: Anthropic.Beta.BetaContentBlock): { title: string; url: string }[] {
  if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
    return block.content.map((r) => ({ title: r.title, url: r.url }));
  }
  if (block.type === 'text' && block.citations) {
    return block.citations
      .filter((c): c is Anthropic.Beta.BetaCitationsWebSearchResultLocation => c.type === 'web_search_result_location')
      .map((c) => ({ title: c.title ?? c.url, url: c.url }));
  }
  return [];
}

/** Link từ kết quả search_web / read_webpage (tool phía client) để hiển thị như nguồn web */
function sourcesOfToolResult(toolName: string, content: string): { title: string; url: string }[] {
  try {
    if (toolName === 'search_web') {
      const d = JSON.parse(content) as { results?: { title: string; url: string }[] };
      return (d.results ?? []).map((r) => ({ title: r.title, url: r.url }));
    }
    if (toolName === 'read_webpage') {
      const d = JSON.parse(content) as { title: string; url: string };
      return d.url ? [{ title: d.title || d.url, url: d.url }] : [];
    }
  } catch {
    /* kết quả không phải JSON */
  }
  return [];
}

function dedupe(items: { title: string; url: string }[]) {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.url) ? false : (seen.add(i.url), true)));
}

function friendlyError(err: unknown) {
  if (err instanceof Anthropic.AuthenticationError) return 'API key của Claude không hợp lệ.';
  if (err instanceof Anthropic.RateLimitError) return 'Đang quá tải, bạn thử lại sau ít phút nhé.';
  if (err instanceof Anthropic.APIError) return `Lỗi từ dịch vụ AI (${err.status}). Thử lại sau.`;
  return 'Có lỗi xảy ra, bạn thử lại nhé.';
}
