import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { PortfolioReport } from '@dautu/contracts';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/current-user.decorator';
import { csvFileName, toCsv } from './report-csv';
import { ReportCsvQueryDto, ReportQueryDto } from './dto/report-query.dto';
import { ReportsService } from './reports.service';

@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private reports: ReportsService) {}

  /** Báo cáo theo kỳ (xem trước / in PDF). ?month= | ?from=&to=, ?portfolioId=, ?mask=none|amounts|symbols|both */
  @Get('portfolio')
  report(@CurrentUser() user: AuthUser, @Query() q: ReportQueryDto): Promise<PortfolioReport> {
    return this.reports.report(user.id, q);
  }

  /** Cùng báo cáo dưới dạng một file CSV (UTF-8 BOM). ?delimiter=comma|semicolon */
  @Get('portfolio/csv')
  async csv(
    @CurrentUser() user: AuthUser,
    @Query() q: ReportCsvQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const report = await this.reports.report(user.id, q);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${csvFileName(report)}"`);
    // Số liệu tài chính cá nhân: không để proxy / trình duyệt lưu đệm
    res.setHeader('Cache-Control', 'no-store');
    return toCsv(report, q.delimiter ?? 'comma');
  }
}
