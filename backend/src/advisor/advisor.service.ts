import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageStream } from '@anthropic-ai/sdk/lib/BetaMessageStream';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { compatMode, createAnthropicClient } from '../common/anthropic';
import { Prisma } from '@prisma/client';
import type { AdvisorStreamEvent } from '@dautu/contracts';
import { VN_TZ } from '../market/types';
import { AiQuotaError, AiUsageService } from '../ai/ai-usage.service';
import { historyChars, MAX_HISTORY_CHARS, missingToolResults } from '../ai/history';
import { AnalyticsService } from '../analytics/analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { stripEmoji } from '../common/text';
import { ADVISOR_SYSTEM_PROMPT } from './prompt';
import { searchLabel, sourcesOf, sourcesOfToolResult } from './advisor-messages';
import { AdvisorTools } from './tools';
import { Evidence, VerifierService } from './verifier.service';
import type { Verification } from './verifier.service';

export type AdvisorEvent = AdvisorStreamEvent;

const MAX_TURNS = 15;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

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
    private analytics: AnalyticsService,
    private aiUsage: AiUsageService,
  ) {
    this.client = createAnthropicClient();
    this.model = config.get<string>('LLM_MODEL_ADVISOR') || config.get<string>('LLM_MODEL') || 'claude-opus-5-5';
  }

  get enabled() {
    return !!this.client;
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
        message: 'Cố vấn AI đang tạm tắt. Bạn vẫn dùng được danh mục, bảng giá và các công cụ tính; hãy thử lại sau.',
      });
      return;
    }

    // Quota phía server: lượt hỏi mỗi ngày, một câu mỗi lúc, ngân sách chung. Hết thì báo dễ hiểu và dừng.
    let requestId: string;
    try {
      requestId = await this.aiUsage.reserve(userId, 'chat');
    } catch (e) {
      if (e instanceof AiQuotaError) {
        emit({ type: 'error', message: e.message });
        return;
      }
      throw e;
    }
    try {
      await this.answer(userId, conversationId, message, emit, signal);
    } finally {
      await this.aiUsage.finish(requestId);
    }
  }

  private async answer(
    userId: string,
    conversationId: string | undefined,
    message: string,
    emit: (e: AdvisorEvent) => void,
    signal: AbortSignal,
  ) {
    const conv = conversationId
      ? await this.prisma.conversation.findFirst({ where: { id: conversationId, userId } })
      : await this.prisma.conversation.create({
          data: { userId, title: message.slice(0, 80) },
        });
    if (!conv) throw new NotFoundException('Không tìm thấy cuộc trò chuyện');
    emit({ type: 'conversation', id: conv.id, title: conv.title });
    void this.trackQuestion(userId, conversationId);

    const stored = await this.prisma.chatMessage.findMany({
      where: { conversationId: conv.id },
      orderBy: { seq: 'asc' },
    });
    const messages: Anthropic.Beta.BetaMessageParam[] = stored.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content as unknown as Anthropic.Beta.BetaContentBlockParam[],
    }));
    if (historyChars(messages) > MAX_HISTORY_CHARS) {
      emit({
        type: 'error',
        message: 'Cuộc trò chuyện này đã quá dài để cố vấn đọc lại đầy đủ. Hãy mở cuộc trò chuyện mới để hỏi tiếp.',
      });
      return;
    }
    // Lượt trước dừng giữa lúc chạy công cụ: nối kết quả "bị dừng" để lịch sử hợp lệ (chỉ nối thêm, không sửa)
    const missing = missingToolResults(messages);
    if (missing) {
      await this.save(conv.id, 'user', missing, false);
      messages.push({ role: 'user', content: missing });
    }

    const userContent: Anthropic.Beta.BetaContentBlockParam[] = [
      { type: 'text', text: `[Thời điểm hiện tại: ${nowVn()}]\n${message}` },
    ];
    await this.save(conv.id, 'user', userContent, true);
    messages.push({ role: 'user', content: userContent });

    const ctx: TurnContext = {
      convId: conv.id,
      userId,
      messages,
      emit,
      signal,
      evidence: [],
      answer: [],
      lastAssistantId: null,
      firstAssistantId: null,
    };
    if (!(await this.runTurns(ctx, MAX_TURNS))) return;

    // Lớp kiểm tra: đối chiếu câu trả lời với chính dữ liệu cố vấn đã dùng
    await this.verifyAndCorrect(ctx);

    await this.prisma.conversation.update({ where: { id: conv.id }, data: { updatedAt: new Date() } });
    emit({ type: 'done', answerId: ctx.firstAssistantId });
  }

  /** Đo câu hỏi (không ghi nội dung); hỏi trong cuộc trò chuyện của bản tin = hỏi tiếp bản tin */
  private async trackQuestion(userId: string, conversationId: string | undefined) {
    const brief = conversationId ? await this.analytics.briefOf(conversationId) : null;
    await this.analytics.track('advisor_asked', { userId, props: { inBrief: !!brief } });
    if (brief) {
      await this.analytics.track('brief_followup', {
        userId,
        props: { kind: brief.kind },
        dedupeKey: `brief_followup:${brief.key}`,
      });
    }
  }

  private async verifyAndCorrect(ctx: TurnContext) {
    const answer = ctx.answer.join('\n');
    if (!ctx.evidence.length || answer.trim().length < 150 || !ctx.lastAssistantId) return;
    ctx.emit({ type: 'verifying' });
    let v: Verification;
    try {
      v = await this.verifier.verify(answer, ctx.evidence, ctx.userId);
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
      .map(
        (i, n) =>
          `${n + 1}. Câu trong trả lời: "${i.quote}" — ${i.explanation} Dữ liệu nguồn ghi: "${i.evidenceQuote}". Thông tin đúng: ${i.correction}`,
      )
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
          data: { meta: { correction: true } },
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
      stream.on('text', (delta) => emit({ type: 'text', text: stripEmoji(delta) }));
      stream.on('contentBlock', (block) => {
        // Nhãn tool_use phát sau khi có finalMessage: qua router, block lúc stream có thể chưa đúng tên
        if (block.type === 'server_tool_use') emit({ type: 'tool', label: searchLabel(block.input) });
        const src = sourcesOf(block);
        if (src.length) emit({ type: 'sources', items: src });
      });

      let response: Anthropic.Beta.BetaMessage;
      const started = Date.now();
      try {
        response = await stream.finalMessage();
        jsonRetries = 0;
        await this.aiUsage.record({
          feature: 'chat',
          userId,
          model: response.model || this.model,
          requestedModel: this.model,
          usage: response.usage,
          durationMs: Date.now() - started,
          outcome: response.stop_reason === 'refusal' ? 'refused' : 'ok',
        });
      } catch (err) {
        // Huỷ / lỗi: không có usage cuối cùng → chi phí "không rõ"
        await this.aiUsage.record({
          feature: 'chat',
          userId,
          model: this.model,
          durationMs: Date.now() - started,
          outcome: signal.aborted ? 'aborted' : 'error',
        });
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

      const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
      for (const t of toolUses) emit({ type: 'tool', label: this.tools.label(t.name, t.input) });
      if (response.stop_reason === 'max_tokens' && toolUses.length) {
        emit({ type: 'error', message: 'Câu trả lời quá dài, bị cắt giữa chừng. Hãy hỏi cụ thể hơn.' });
        return false;
      }

      const savedAssistant = await this.save(convIdForSave, 'assistant', response.content, true);
      ctx.lastAssistantId = savedAssistant.id;
      ctx.firstAssistantId ??= savedAssistant.id;
      for (const b of response.content) if (b.type === 'text') ctx.answer.push(b.text);
      messages.push({ role: 'assistant', content: response.content });

      if (response.stop_reason === 'pause_turn') continue;
      if (!toolUses.length) break;

      const results = await Promise.all(
        toolUses.map(async (t): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
          const r = await this.tools.run(t.name, t.input, userId);
          if (r.ok)
            ctx.evidence.push({
              id: `${t.name}#${ctx.evidence.length + 1}`,
              tool: t.name,
              input: t.input,
              content: r.content,
            });
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

function friendlyError(err: unknown) {
  if (err instanceof Anthropic.AuthenticationError) return 'API key của Claude không hợp lệ.';
  if (err instanceof Anthropic.RateLimitError) return 'Đang quá tải, bạn thử lại sau ít phút nhé.';
  if (err instanceof Anthropic.APIError) return `Lỗi từ dịch vụ AI (${err.status}). Thử lại sau.`;
  return 'Có lỗi xảy ra, bạn thử lại nhé.';
}
