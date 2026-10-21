import { Module } from '@nestjs/common';
import { VietcapModule } from '../../market/providers/vietcap';
import { PortfolioModule } from '../portfolio.module';
import { CorporateActionsService } from './corporate-actions.service';
import { DividendsController } from './dividends.controller';

/** Sự kiện quyền chưa ghi vào sổ và lịch thu nhập cổ tức của người dùng */
@Module({
  imports: [VietcapModule, PortfolioModule],
  controllers: [DividendsController],
  providers: [CorporateActionsService],
  exports: [CorporateActionsService],
})
export class DividendsModule {}
