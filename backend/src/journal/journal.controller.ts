import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import type {
  JournalMonth,
  JournalMonthSummary,
  JournalPlanRef,
  JournalReviewEntry,
  JournalTradeEntry,
} from '@dautu/contracts';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EntriesQuery, MonthQuery, monthOf } from './dto/journal-query.dto';
import { JournalReviewTagsDto, JournalTagsDto } from './journal-tags';
import { JournalService } from './journal.service';

/** Nhật ký quyết định: dòng thời gian theo tháng, tổng kết thói quen, gắn nhãn sau cho giao dịch / lần xem lại */
@UseGuards(JwtAuthGuard)
@Controller('journal')
export class JournalController {
  constructor(private journal: JournalService) {}

  @Get()
  month(@CurrentUser() user: AuthUser, @Query() q: EntriesQuery): Promise<JournalMonth> {
    return this.journal.month(user.id, monthOf(q), { emotion: q.emotion, planId: q.planId || undefined });
  }

  @Get('plans')
  plans(@CurrentUser() user: AuthUser): Promise<JournalPlanRef[]> {
    return this.journal.planRefs(user.id);
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthUser, @Query() q: MonthQuery): Promise<JournalMonthSummary> {
    return this.journal.summary(user.id, monthOf(q));
  }

  @Patch('transactions/:id')
  tagTransaction(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: JournalTagsDto,
  ): Promise<JournalTradeEntry> {
    return this.journal.tagTransaction(user.id, id, dto);
  }

  @Patch('reviews/:id')
  tagReview(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: JournalReviewTagsDto,
  ): Promise<JournalReviewEntry> {
    return this.journal.tagReview(user.id, id, dto);
  }
}
