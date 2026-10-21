import { Body, Controller, Get, Module, Patch, Query, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, Matches } from 'class-validator';
import type { EventsResponse, ReminderSettings, ReminderSettingsPatch } from '@dautu/contracts';
import { AlertsModule } from '../alerts/alerts.module';
import { CurrentUser, JwtAuthGuard } from '../auth/auth.module';
import type { AuthUser } from '../auth/auth.module';
import { MarketModule } from '../market/market.module';
import type { EventRange } from './calendar';
import { EventsService } from './events.service';

const RANGES: EventRange[] = ['week', 'month', 'quarter'];

class ReminderSettingsDto implements ReminderSettingsPatch {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsIn([1, 3], { message: 'daysBefore chỉ nhận 1 hoặc 3' }) daysBefore?: 1 | 3;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @Matches(/^[A-Za-z0-9]{1,20}$/, { each: true, message: 'Mã cổ phiếu không hợp lệ' })
  mutedSymbols?: string[];
}

@UseGuards(JwtAuthGuard)
@Controller('events')
class EventsController {
  constructor(private events: EventsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('range') range?: string): Promise<EventsResponse> {
    const r = RANGES.find((x) => x === range) ?? 'month';
    return this.events.list(user.id, r);
  }

  @Patch('reminders')
  updateReminders(@CurrentUser() user: AuthUser, @Body() dto: ReminderSettingsDto): Promise<ReminderSettings> {
    return this.events.updateSettings(user.id, dto);
  }
}

@Module({
  imports: [MarketModule, AlertsModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
