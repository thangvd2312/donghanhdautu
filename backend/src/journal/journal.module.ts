import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { MarketModule } from '../market/market.module';
import { JournalController } from './journal.controller';
import { JournalService } from './journal.service';

@Module({
  imports: [MarketModule, AlertsModule],
  controllers: [JournalController],
  providers: [JournalService],
  exports: [JournalService],
})
export class JournalModule {}
