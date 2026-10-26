import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { IsDateKey } from '../../common/dates';
import { JournalTagsDto } from '../../journal/journal-tags';
import { TX_TYPES } from '../ledger';
import type { Currency, TxType } from '../ledger';

/** Trần cho số lượng / giá / tiền: cột Decimal(30, 10) của sổ chứa tối đa 20 chữ số phần nguyên */
export const MAX_TX_NUMBER = 1e15;
const TOO_BIG = { message: 'Số quá lớn (tối đa 1 triệu tỷ)' };

/** Nhãn nhật ký (reason / emotion / planId) kế thừa từ JournalTagsDto: tuỳ chọn, không ảnh hưởng tới sổ */
export class TransactionDto extends JournalTagsDto {
  @IsIn(TX_TYPES) type!: TxType;
  @IsDateKey() date!: string;
  @IsOptional() @IsIn(['stock', 'crypto', 'gold', 'cash']) assetType?: 'stock' | 'crypto' | 'gold' | 'cash';
  @IsOptional() @IsString() @MaxLength(20) symbol?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(MAX_TX_NUMBER, TOO_BIG) quantity?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(MAX_TX_NUMBER, TOO_BIG) price?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(MAX_TX_NUMBER, TOO_BIG) amount?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(MAX_TX_NUMBER, TOO_BIG) fee?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(MAX_TX_NUMBER, TOO_BIG) tax?: number;
  @IsOptional() @IsIn(['VND', 'USDT']) currency?: Currency;
  @IsOptional() @IsNumber() @Min(0) @Max(MAX_TX_NUMBER, TOO_BIG) fxRate?: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  /** Danh mục ghi giao dịch; bỏ trống = danh mục chính */
  @IsOptional() @IsString() @MaxLength(40) portfolioId?: string;
}
