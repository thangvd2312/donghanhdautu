import { Body, Controller, Delete, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AdvisorConversation, AdvisorConversationSummary, AdvisorStatus, OkResponse } from '@dautu/contracts';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdvisorConversationsService } from './advisor-conversations.service';
import { AdvisorService } from './advisor.service';
import type { AdvisorEvent } from './advisor.service';
import { ChatDto, FeedbackDto } from './dto/advisor.dto';

@UseGuards(JwtAuthGuard)
@Controller('advisor')
export class AdvisorController {
  constructor(
    private advisor: AdvisorService,
    private conversations: AdvisorConversationsService,
  ) {}

  @Get('status')
  status(): AdvisorStatus {
    return { enabled: this.advisor.enabled };
  }

  @Get('conversations')
  list(@CurrentUser() user: AuthUser): Promise<AdvisorConversationSummary[]> {
    return this.conversations.listConversations(user.id);
  }

  @Get('conversations/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<AdvisorConversation> {
    return this.conversations.getConversation(user.id, id);
  }

  @Delete('conversations/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<OkResponse> {
    return this.conversations.deleteConversation(user.id, id);
  }

  @Post('feedback')
  feedback(@CurrentUser() user: AuthUser, @Body() dto: FeedbackDto): Promise<OkResponse> {
    return this.conversations.submitFeedback(user.id, dto.conversationId, dto.answerId, dto.reason, dto.note);
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
