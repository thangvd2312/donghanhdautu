import { Transform } from 'class-transformer';
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
  /** Bỏ khoảng trắng hai đầu: tên chỉ toàn dấu cách bị từ chối thay vì lưu thành tên rỗng */
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'Tên danh mục không được để trống' })
  @MaxLength(60)
  name!: string;
}
