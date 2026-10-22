import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { RebalanceRequest } from '@dautu/contracts';
import { MAX_NEW_MONEY, MAX_TARGETS } from '../rebalance.types';
import type { LotMode, RebalanceGroup, RebalanceMode } from '../rebalance.types';

class TargetDto {
  @IsIn(['stock', 'crypto', 'gold', 'cash'], { message: 'Loại tài sản không hợp lệ' }) assetType!: RebalanceGroup;
  @IsString({ message: 'Mã tài sản không hợp lệ' })
  @MaxLength(40, { message: 'Mã tài sản không hợp lệ' })
  symbol!: string;
  @IsNumber({}, { message: 'Tỷ trọng phải là số' })
  @Min(0, { message: 'Tỷ trọng từ 0 đến 100%' })
  @Max(100, { message: 'Tỷ trọng từ 0 đến 100%' })
  pct!: number;
}

class FeesDto {
  @IsOptional()
  @IsNumber({}, { message: 'Phí phải là số' })
  @Min(0, { message: 'Phí từ 0 đến 100%' })
  @Max(100, { message: 'Phí từ 0 đến 100%' })
  stockBuyPct?: number;
  @IsOptional()
  @IsNumber({}, { message: 'Phí phải là số' })
  @Min(0, { message: 'Phí từ 0 đến 100%' })
  @Max(100, { message: 'Phí từ 0 đến 100%' })
  stockSellPct?: number;
  @IsOptional()
  @IsNumber({}, { message: 'Phí phải là số' })
  @Min(0, { message: 'Phí từ 0 đến 100%' })
  @Max(100, { message: 'Phí từ 0 đến 100%' })
  stockSellTaxPct?: number;
  @IsOptional()
  @IsNumber({}, { message: 'Phí phải là số' })
  @Min(0, { message: 'Phí từ 0 đến 100%' })
  @Max(100, { message: 'Phí từ 0 đến 100%' })
  cryptoPct?: number;
}

/** Mô phỏng tái cân bằng: không ghi gì vào sổ */
export class RebalanceDto implements RebalanceRequest {
  @IsOptional() @IsString() @MaxLength(40) portfolioId?: string | null;
  @IsArray({ message: 'Danh sách tỷ trọng mục tiêu không hợp lệ' })
  @ArrayMinSize(1, { message: 'Cần ít nhất một tỷ trọng mục tiêu' })
  @ArrayMaxSize(MAX_TARGETS, { message: `Tối đa ${MAX_TARGETS} dòng mục tiêu` })
  @ValidateNested({ each: true })
  @Type(() => TargetDto)
  targets!: TargetDto[];
  @IsNumber({}, { message: 'Tiền bổ sung phải là số' })
  @Min(0, { message: 'Tiền bổ sung không được âm' })
  @Max(MAX_NEW_MONEY, { message: 'Tiền bổ sung quá lớn' })
  newMoney!: number;
  @IsIn(['buy_only', 'allow_sell'], { message: 'Chế độ không hợp lệ' }) mode!: RebalanceMode;
  @IsIn(['board', 'odd'], { message: 'Kiểu lô không hợp lệ' }) lots!: LotMode;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => FeesDto) fees?: FeesDto;
}
