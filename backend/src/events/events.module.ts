import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { MarketModule } from '../market/market.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [MarketModule, AlertsModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
