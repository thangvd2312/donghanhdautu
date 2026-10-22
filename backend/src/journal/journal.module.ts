import { Body, Controller, Get, Module, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import type {
  JournalEmotion,
  JournalMonth,
  JournalMonthSummary,
  JournalPlanRef,
  JournalReviewEntry,
  JournalTradeEntry,
} from '@dautu/contracts';
import { AlertsModule } from '../alerts/alerts.module';
import { CurrentUser, JwtAuthGuard } from '../auth/auth.module';
import type { AuthUser } from '../auth/auth.module';
import { vnDateKey } from '../market/types';
import { PlansModule } from '../plans/plans.module';
import { JOURNAL_EMOTIONS } from './journal-logic';
import { JournalReviewTagsDto, JournalTagsDto } from './journal-tags';
import { JournalService } from './journal.service';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

class MonthQuery {
  /** YYYY-MM; bỏ trống = tháng hiện tại (giờ VN) */
  @IsOptional() @Matches(MONTH, { message: 'Tháng không hợp lệ (cần dạng YYYY-MM)' }) month?: string;
}

class EntriesQuery extends MonthQuery {
  @IsOptional() @IsIn(JOURNAL_EMOTIONS, { message: 'Cảm xúc không hợp lệ' }) emotion?: JournalEmotion;
  @IsOptional() @IsString() @MaxLength(40) planId?: string;
}

const monthOf = (q: MonthQuery) => q.month ?? vnDateKey().slice(0, 7);

/** Nhật ký quyết định: dòng thời gian theo tháng, tổng kết thói quen, gắn nhãn sau cho giao dịch / lần xem lại */
@UseGuards(JwtAuthGuard)
@Controller('journal')
class JournalController {
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

@Module({
  imports: [PlansModule, AlertsModule],
  controllers: [JournalController],
  providers: [JournalService],
  exports: [JournalService],
})
export class JournalModule {}
