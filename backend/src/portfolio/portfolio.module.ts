import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { HistoryService } from './history.service';
import { ImportService } from './import.service';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

/**
 * Lõi danh mục: định giá, sổ giao dịch, nhập CSV, lịch sử. Mô phỏng (analysis/) và cổ tức (dividends/)
 * là module riêng phụ thuộc vào module này, nên module này không import ngược lại chúng.
 */
@Module({
  imports: [MarketModule],
  controllers: [PortfolioController, TransactionsController],
  providers: [PortfolioService, TransactionsService, ImportService, HistoryService],
  exports: [PortfolioService, TransactionsService, HistoryService],
})
export class PortfolioModule {}
