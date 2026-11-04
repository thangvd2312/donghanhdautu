import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import type { ContributionPreview, GoalContributionView } from '@dautu/contracts';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ContributionDto, ContributionSkipDto } from './dto/goal.dto';
import { GoalContributionsService } from './goal-contributions.service';

@UseGuards(JwtAuthGuard)
@Controller('goals/contribution')
export class GoalContributionsController {
  constructor(private contributions: GoalContributionsService) {}

  /** Chia tiền góp tháng này cho các mục tiêu, không ghi gì */
  @Post('preview')
  preview(@CurrentUser() user: AuthUser, @Body() dto: ContributionDto): Promise<ContributionPreview> {
    return this.contributions.preview(user.id, dto.amount);
  }

  /** Lưu tháng này (chưa làm); tháng đã lưu thì lập lại */
  @Post()
  save(@CurrentUser() user: AuthUser, @Body() dto: ContributionDto): Promise<GoalContributionView> {
    return this.contributions.save(user.id, dto.amount);
  }

  @Post(':id/done')
  done(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<GoalContributionView> {
    return this.contributions.done(user.id, id);
  }

  @Post(':id/skip')
  skip(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ContributionSkipDto,
  ): Promise<GoalContributionView> {
    return this.contributions.skip(user.id, id, dto.reason);
  }
}
