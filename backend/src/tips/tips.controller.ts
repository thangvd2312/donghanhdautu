import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { OkResponse, TipCheck, TipConversation, TipListPage, TipPlanDraft } from '@dautu/contracts';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TipAmountDto, TipAnalyzeDto, TipCreateDto, TipDecisionDto, TipListQuery } from './dto/tip.dto';
import { TipsService } from './tips.service';

@UseGuards(JwtAuthGuard)
@Controller('tips')
export class TipsController {
  constructor(private tips: TipsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: TipListQuery): Promise<TipListPage> {
    return this.tips.list(user.id, q);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: TipCreateDto): Promise<TipCheck> {
    return this.tips.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<TipCheck> {
    return this.tips.get(user.id, id);
  }

  @Post(':id/analyze')
  analyze(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TipAnalyzeDto): Promise<TipCheck> {
    return this.tips.analyze(user.id, id, dto);
  }

  @Patch(':id')
  amount(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TipAmountDto): Promise<TipCheck> {
    return this.tips.setAmount(user.id, id, dto.amountVnd);
  }

  @Post(':id/decision')
  decide(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TipDecisionDto): Promise<TipCheck> {
    return this.tips.decide(user.id, id, dto);
  }

  @Get(':id/plan-draft')
  planDraft(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<TipPlanDraft> {
    return this.tips.planDraft(user.id, id);
  }

  @Post(':id/conversation')
  conversation(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<TipConversation> {
    return this.tips.conversation(user.id, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<OkResponse> {
    return this.tips.remove(user.id, id);
  }
}
