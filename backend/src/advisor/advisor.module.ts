import { Body, Controller, Delete, Get, Module, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import type {
  AdvisorChatRequest,
  AdvisorConversation,
  AdvisorConversationSummary,
  AdvisorFeedbackReason,
  AdvisorFeedbackRequest,
  AdvisorStatus,
  OkResponse,
} from '@dautu/contracts';
import { CurrentUser, JwtAuthGuard } from '../auth/auth.module';
import type { AuthUser } from '../auth/auth.module';
import { MacroModule } from '../macro/macro.module';
import { MarketModule } from '../market/market.module';
import { NewsModule } from '../news/news.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { AdvisorEvent, AdvisorService } from './advisor.service';
import { LlmService } from '../alerts/llm.service';
import { AdvisorTools } from './tools';
import { VerifierService } from './verifier.service';
import { WebService } from './web.service';

class ChatDto implements AdvisorChatRequest {
  @IsOptional() @IsString() conversationId?: string;
  @IsString() @MinLength(1) @MaxLength(4000) message!: string;
}

export const FEEDBACK_REASONS: readonly AdvisorFeedbackReason[] = [
  'wrong_number',
  'wrong_source',
  'outdated',
  'bad_advice',
  'other',
];

class FeedbackDto implements AdvisorFeedbackRequest {
  @IsString() conversationId!: string;
  @IsString() answerId!: string;
  @IsIn(FEEDBACK_REASONS) reason!: AdvisorFeedbackReason;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('advisor')
class AdvisorController {
  constructor(private advisor: AdvisorService) {}

  @Get('status')
  status(): AdvisorStatus {
    return { enabled: this.advisor.enabled };
  }

  @Get('conversations')
  list(@CurrentUser() user: AuthUser): Promise<AdvisorConversationSummary[]> {
    return this.advisor.listConversations(user.id);
  }

  @Get('conversations/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<AdvisorConversation> {
    return this.advisor.getConversation(user.id, id);
  }

  @Delete('conversations/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<OkResponse> {
    return this.advisor.deleteConversation(user.id, id);
  }

  @Post('feedback')
  feedback(@CurrentUser() user: AuthUser, @Body() dto: FeedbackDto): Promise<OkResponse> {
    return this.advisor.submitFeedback(user.id, dto.conversationId, dto.answerId, dto.reason, dto.note);
  }

  /** Trả lời dạng Server-Sent Events để chữ hiện dần trên giao diện */
  @Post('chat')
  async chat(@CurrentUser() user: AuthUser, @Body() dto: ChatDto, @Req() req: Request, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const abort = new AbortController();
    res.on('close', () => abort.abort());
    const emit = (e: AdvisorEvent) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(e)}\n\n`);
    };
    try {
      await this.advisor.chat(user.id, dto.conversationId, dto.message, emit, abort.signal);
    } catch (e) {
      emit({ type: 'error', message: (e as Error).message });
    } finally {
      void req;
      res.end();
    }
  }
}

@Module({
  imports: [MarketModule, PortfolioModule, NewsModule, MacroModule],
  controllers: [AdvisorController],
  providers: [AdvisorService, AdvisorTools, WebService, VerifierService, LlmService],
  exports: [AdvisorService],
})
export class AdvisorModule {}
