import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { HoldingDraftResponse } from '@dautu/contracts';
import { LlmService } from '../alerts/llm.service';
import { AiUsageService } from '../ai/ai-usage.service';
import { MarketService } from '../market/market.service';
import { validateHoldingDraft } from './holding-draft.logic';
import { HOLDING_DRAFT_PROMPT, HOLDING_DRAFT_SCHEMA } from './holding-draft.prompt';

@Injectable()
export class HoldingDraftsService {
  constructor(
    private llm: LlmService,
    private usage: AiUsageService,
    private market: MarketService,
  ) {}

  async draft(userId: string, text: string): Promise<HoldingDraftResponse> {
    if (!this.llm.enabled)
      throw new ServiceUnavailableException('Phân tích AI đang tắt. Bạn vẫn có thể khai báo tài sản bằng biểu mẫu.');
    return this.usage.run(userId, 'holding_draft', async () => {
      const goldOptions = this.market
        .goldQuotes()
        .filter((g) => g.currency === 'VND')
        .map(({ code, name }) => ({ code, name }));
      const raw = await this.llm.json<unknown>({
        userId,
        feature: 'holding_draft',
        tier: 'fast',
        maxTokens: 6000,
        system: HOLDING_DRAFT_PROMPT,
        schema: HOLDING_DRAFT_SCHEMA,
        user: JSON.stringify({ text, goldOptions }),
      });
      const result = validateHoldingDraft(
        raw,
        text,
        goldOptions.map((g) => g.code),
      );
      if (!result)
        throw new ServiceUnavailableException(
          'Chưa phân tích được nội dung đáng tin cậy. Hãy sửa câu hoặc thử lại; chưa có tài sản nào được lưu.',
        );
      return result;
    });
  }
}
