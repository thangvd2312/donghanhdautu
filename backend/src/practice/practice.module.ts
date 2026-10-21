import { Body, Controller, Get, Module, Post, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CurrentUser, JwtAuthGuard } from '../auth/auth.module';
import type { AuthUser } from '../auth/auth.module';
import { MarketModule } from '../market/market.module';
import { PracticeService } from './practice.service';
import { START_CASH_OPTIONS } from './practice-logic';
import type { PracticeAssetType, PracticeSide } from './practice-logic';

const CASH_MSG = 'Số tiền ban đầu không hợp lệ';

class StartDto {
  @IsIn(START_CASH_OPTIONS, { message: CASH_MSG }) startCash!: number;
}

class OrderDto {
  @IsIn(['stock', 'crypto'], { message: 'Loại tài sản luyện tập chỉ gồm cổ phiếu và coin' })
  assetType!: PracticeAssetType;
  @IsString() @MaxLength(20) symbol!: string;
  @IsIn(['buy', 'sell'], { message: 'Lệnh phải là mua hoặc bán' }) side!: PracticeSide;
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'Số lượng không hợp lệ' })
  @Min(0.000001, { message: 'Số lượng phải lớn hơn 0' })
  @Max(1_000_000_000_000, { message: 'Số lượng quá lớn' })
  quantity!: number;
}

class TradesQuery {
  @IsOptional() @IsString() @MaxLength(60) cursor?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('practice')
class PracticeController {
  constructor(private practice: PracticeService) {}

  @Get()
  state(@CurrentUser() user: AuthUser) {
    return this.practice.state(user.id);
  }

  @Post('start')
  start(@CurrentUser() user: AuthUser, @Body() dto: StartDto) {
    return this.practice.start(user.id, dto.startCash);
  }

  @Post('orders')
  order(@CurrentUser() user: AuthUser, @Body() dto: OrderDto) {
    return this.practice.placeOrder(user.id, dto);
  }

  @Get('trades')
  trades(@CurrentUser() user: AuthUser, @Query() q: TradesQuery) {
    return this.practice.trades(user.id, q.cursor);
  }

  @Post('reset')
  reset(@CurrentUser() user: AuthUser, @Body() dto: StartDto) {
    return this.practice.reset(user.id, dto.startCash);
  }
}

@Module({
  imports: [MarketModule],
  controllers: [PracticeController],
  providers: [PracticeService],
})
export class PracticeModule {}
