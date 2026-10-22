import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import type { ReportCsvDelimiter, ReportMask } from '@dautu/contracts';
import { IsDateKey } from '../common/dates';

/** ?month=YYYY-MM | ?from=YYYY-MM-DD&to=YYYY-MM-DD (bỏ trống = tháng trọn vẹn gần nhất) */
export class ReportQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Tháng không hợp lệ (cần dạng YYYY-MM)' })
  month?: string;
  @IsOptional() @IsDateKey() from?: string;
  @IsOptional() @IsDateKey() to?: string;
  @IsOptional() @IsString() @MaxLength(40) portfolioId?: string;
  @IsOptional()
  @IsIn(['none', 'amounts', 'symbols', 'both'], { message: 'Tùy chọn ẩn không hợp lệ (none, amounts, symbols, both)' })
  mask?: ReportMask;
}

export class ReportCsvQueryDto extends ReportQueryDto {
  @IsOptional()
  @IsIn(['comma', 'semicolon'], { message: 'Dấu phân cách không hợp lệ (comma, semicolon)' })
  delimiter?: ReportCsvDelimiter;
}
