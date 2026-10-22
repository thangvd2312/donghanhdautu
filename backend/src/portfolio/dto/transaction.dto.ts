import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { IsDateKey } from '../../common/dates';
import { JournalTagsDto } from '../../journal/journal-tags';
import { TX_TYPES } from '../ledger';
import type { Currency, TxType } from '../ledger';

/** Nhãn nhật ký (reason / emotion / planId) kế thừa từ JournalTagsDto: tuỳ chọn, không ảnh hưởng tới sổ */
export class TransactionDto extends JournalTagsDto {
  @IsIn(TX_TYPES) type!: TxType;
  @IsDateKey() date!: string;
  @IsOptional() @IsIn(['stock', 'crypto', 'gold', 'cash']) assetType?: 'stock' | 'crypto' | 'gold' | 'cash';
  @IsOptional() @IsString() @MaxLength(20) symbol?: string;
  @IsOptional() @IsNumber() @Min(0) quantity?: number;
  @IsOptional() @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsNumber() @Min(0) fee?: number;
  @IsOptional() @IsNumber() @Min(0) tax?: number;
  @IsOptional() @IsIn(['VND', 'USDT']) currency?: Currency;
  @IsOptional() @IsNumber() @Min(0) fxRate?: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  /** Danh mục ghi giao dịch; bỏ trống = danh mục chính */
  @IsOptional() @IsString() @MaxLength(40) portfolioId?: string;
}
