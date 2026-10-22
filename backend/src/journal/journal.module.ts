import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { PlansModule } from '../plans/plans.module';
import { JournalController } from './journal.controller';
import { JournalService } from './journal.service';

@Module({
  imports: [PlansModule, AlertsModule],
  controllers: [JournalController],
  providers: [JournalService],
  exports: [JournalService],
})
export class JournalModule {}
