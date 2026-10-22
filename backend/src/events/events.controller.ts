import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import type { EventsResponse, ReminderSettings } from '@dautu/contracts';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { EventRange } from './calendar';
import { ReminderSettingsDto } from './dto/reminder-settings.dto';
import { EventsService } from './events.service';

const RANGES: EventRange[] = ['week', 'month', 'quarter'];

@UseGuards(JwtAuthGuard)
@Controller('events')
export class EventsController {
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
