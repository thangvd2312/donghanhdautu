import type Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  AdvisorConversation,
  AdvisorConversationSummary,
  AdvisorFeedbackReason,
  AdvisorMessage,
  OkResponse,
} from '@dautu/contracts';
import { AnalyticsService } from '../analytics/analytics.service';
import { stripEmoji } from '../common/text';
import { PrismaService } from '../prisma/prisma.service';
import { dedupe, searchLabel, sourcesOf, sourcesOfToolResult, TIME_PREFIX } from './advisor-messages';
import { AdvisorTools } from './tools';
import type { Verification } from './verifier.service';

/** Stored conversations: list, delete, rebuild for display, and "report a wrong answer" feedback. */
@Injectable()
export class AdvisorConversationsService {
  private log = new Logger(AdvisorConversationsService.name);

  constructor(
    private prisma: PrismaService,
    private tools: AdvisorTools,
    private analytics: AnalyticsService,
  ) {}

  async listConversations(userId: string): Promise<AdvisorConversationSummary[]> {
    const rows = await this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, updatedAt: true },
      take: 50,
    });
    return rows.map((c) => ({ ...c, updatedAt: c.updatedAt.toISOString() }));
  }

  async deleteConversation(userId: string, id: string): Promise<OkResponse> {
    await this.prisma.conversation.deleteMany({ where: { id, userId } });
    return { ok: true };
  }

  /** Gộp các message lưu trong DB thành dạng hiển thị: mỗi lượt user + một khối trả lời */
  async getConversation(userId: string, id: string): Promise<AdvisorConversation> {
    const conv = await this.prisma.conversation.findFirst({
      where: { id, userId },
      include: { messages: { orderBy: { seq: 'asc' } } },
    });
    if (!conv) throw new NotFoundException('Không tìm thấy cuộc trò chuyện');
    void this.analytics.briefOf(id).then((b) =>
      b
        ? this.analytics.track('brief_opened', {
            userId,
            props: { kind: b.kind },
            dedupeKey: `brief_opened:${b.key}`,
          })
        : undefined,
    );
    const out: AdvisorMessage[] = [];
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
        if (b.type === 'text') last.text += stripEmoji(b.text);
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
      if (m) m.feedback = f.reason as AdvisorFeedbackReason;
    }
    return { id: conv.id, title: conv.title, messages: out };
  }

  /** Người dùng báo một câu trả lời sai / chưa tốt. Lưu kèm câu hỏi + câu trả lời để đưa vào bộ chấm điểm. */
  async submitFeedback(
    userId: string,
    conversationId: string,
    answerId: string,
    reason: AdvisorFeedbackReason,
    note?: string,
  ): Promise<OkResponse> {
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
}
