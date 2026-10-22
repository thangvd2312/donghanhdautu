import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import type { PracticeOrderResponse, PracticeResponse, PracticeState, PracticeTradesPage } from '@dautu/contracts';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrderDto, StartDto, TradesQuery } from './dto/practice.dto';
import { PracticeService } from './practice.service';

@UseGuards(JwtAuthGuard)
@Controller('practice')
export class PracticeController {
  constructor(private practice: PracticeService) {}

  @Get()
  state(@CurrentUser() user: AuthUser): Promise<PracticeResponse> {
    return this.practice.state(user.id);
  }

  @Post('start')
  start(@CurrentUser() user: AuthUser, @Body() dto: StartDto): Promise<PracticeState> {
    return this.practice.start(user.id, dto.startCash);
  }

  @Post('orders')
  order(@CurrentUser() user: AuthUser, @Body() dto: OrderDto): Promise<PracticeOrderResponse> {
    return this.practice.placeOrder(user.id, dto);
  }

  @Get('trades')
  trades(@CurrentUser() user: AuthUser, @Query() q: TradesQuery): Promise<PracticeTradesPage> {
    return this.practice.trades(user.id, q.cursor);
  }

  @Post('reset')
  reset(@CurrentUser() user: AuthUser, @Body() dto: StartDto): Promise<PracticeState> {
    return this.practice.reset(user.id, dto.startCash);
  }
}
