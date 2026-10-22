import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import type { AssetType } from '../../market/market.service';

/** Khai báo nhanh một tài sản đang có (onboarding / "khai báo tài sản đang có") = giao dịch số dư đầu kỳ */
export class HoldingDto {
  @IsIn(['stock', 'crypto', 'gold', 'cash']) assetType!: AssetType;
  @IsString() symbol!: string;
  @IsNumber() @Min(0) quantity!: number;
  @IsNumber() @Min(0) avgCost!: number;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() @MaxLength(40) portfolioId?: string;
}

export class PortfolioNameDto {
  @IsString() @MinLength(1) @MaxLength(60) name!: string;
}
