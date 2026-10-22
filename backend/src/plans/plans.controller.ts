import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import type { Plan, PlanDetail, PlanDraft, PlanListItem, PlanReview } from '@dautu/contracts';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DraftDto, PlanDto, ReviewDto } from './dto/plan.dto';
import { PlanDraftService } from './plan-draft.service';
import { PlansService } from './plans.service';

@UseGuards(JwtAuthGuard)
@Controller('plans')
export class PlansController {
  constructor(
    private plans: PlansService,
    private drafts: PlanDraftService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<PlanListItem[]> {
    return this.plans.list(user.id);
  }

  @Post('draft')
  draft(@CurrentUser() user: AuthUser, @Body() dto: DraftDto): Promise<PlanDraft> {
    return this.drafts.draft(user.id, dto);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<PlanDetail> {
    return this.plans.detail(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: PlanDto): Promise<Plan> {
    return this.plans.create(user.id, dto);
  }

  @Put(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PlanDto): Promise<Plan> {
    return this.plans.update(user.id, id, dto);
  }

  @Post(':id/reviews')
  review(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReviewDto): Promise<PlanReview> {
    return this.plans.review(user.id, id, dto);
  }
}
