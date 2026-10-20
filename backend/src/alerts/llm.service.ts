import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiFeature } from '../ai/ai-usage.service';
import { AiUsageService } from '../ai/ai-usage.service';
import { compatMode, createAnthropicClient } from '../common/anthropic';

/**
 * brief: bản tin (cần suy luận tổng hợp, chạy ít lần) — model khá trở lên.
 * fast: đọc/gắn nhãn tin và viết lời nhắn thông báo (số liệu đã tính sẵn, chạy nhiều lần) — model nhanh, rẻ.
 */
export type LlmTier = 'brief' | 'fast';

/**
 * Gọi LLM cho các tác vụ nền (soạn thông báo, đọc tin, viết bản tin) và nhận về JSON.
 * Luôn dùng stream vì một số router trả định dạng OpenAI cho request không stream.
 * Ở chế độ tương thích (router bên thứ ba) không dùng structured outputs mà yêu cầu JSON qua prompt.
 */
@Injectable()
export class LlmService {
  private log = new Logger(LlmService.name);
  private client: Anthropic | null;
  private models: Record<LlmTier, string>;

  constructor(
    config: ConfigService,
    @Optional() private usage?: AiUsageService,
  ) {
    this.client = createAnthropicClient();
    const base = config.get<string>('LLM_MODEL') || 'claude-opus-5-5';
    this.models = {
      brief: config.get<string>('LLM_MODEL_BRIEF') || base,
      fast: config.get<string>('LLM_MODEL_FAST') || base,
    };
  }

  get enabled() {
    return !!this.client;
  }

  async json<T>(opts: {
    tier: LlmTier;
    /** Chức năng gọi AI, để ghi usage và chi phí */
    feature: AiFeature;
    userId?: string | null;
    system: string;
    user: string;
    schema: Record<string, unknown>;
    effort?: 'low' | 'medium' | 'high';
    maxTokens?: number;
  }): Promise<T | null> {
    if (!this.client) return null;
    const compat = compatMode();
    const model = this.models[opts.tier];
    const started = Date.now();
    try {
      const res = await this.client.messages
        .stream({
          model,
          max_tokens: opts.maxTokens ?? 4000,
          ...(compat
            ? {}
            : {
                output_config: {
                  effort: opts.effort ?? 'low',
                  format: { type: 'json_schema' as const, schema: opts.schema },
                },
              }),
          system: compat
            ? `${opts.system}\n\nChỉ trả về đúng một object JSON theo schema sau, không kèm chữ nào khác:\n${JSON.stringify(opts.schema)}`
            : opts.system,
          messages: [{ role: 'user', content: opts.user }],
        })
        .finalMessage();
      void this.usage?.record({
        feature: opts.feature,
        userId: opts.userId,
        model: res.model || model,
        usage: res.usage,
        durationMs: Date.now() - started,
        outcome: res.stop_reason === 'refusal' ? 'refused' : 'ok',
      });
      if (res.stop_reason === 'refusal') return null;
      const text = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text;
      const json = text?.match(/\{[\s\S]*\}/)?.[0];
      return json ? (JSON.parse(json) as T) : null;
    } catch (e) {
      void this.usage?.record({
        feature: opts.feature,
        userId: opts.userId,
        model,
        durationMs: Date.now() - started,
        outcome: 'error',
      });
      this.log.warn(`LLM lỗi: ${(e as Error).message}`);
      return null;
    }
  }
}
