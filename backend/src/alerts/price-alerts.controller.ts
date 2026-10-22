import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { OkResponse, PriceAlert, PriceAlertListItem } from '@dautu/contracts';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PriceAlertDto } from './dto/price-alert.dto';
import { PriceAlertsService } from './price-alerts.service';

@UseGuards(JwtAuthGuard)
@Controller('alerts')
export class PriceAlertsController {
  constructor(private priceAlerts: PriceAlertsService) {}

  @Get('price')
  list(@CurrentUser() user: AuthUser): Promise<PriceAlertListItem[]> {
    return this.priceAlerts.list(user.id);
  }

  @Post('price')
  create(@CurrentUser() user: AuthUser, @Body() dto: PriceAlertDto): Promise<PriceAlert> {
    return this.priceAlerts.create(user.id, dto);
  }

  @Delete('price/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<OkResponse> {
    return this.priceAlerts.remove(user.id, id);
  }
}
