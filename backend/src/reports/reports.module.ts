import { Module } from '@nestjs/common';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/** Báo cáo danh mục theo kỳ (FREE-10): ghép từ sổ và lịch sử đã có, tải về dạng CSV hoặc in PDF ở trình duyệt */
@Module({
  imports: [PortfolioModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
