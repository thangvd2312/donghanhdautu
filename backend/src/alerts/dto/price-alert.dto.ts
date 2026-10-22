import type { PriceAlertRequest, TrackedAssetType } from '@dautu/contracts';
import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class PriceAlertDto implements PriceAlertRequest {
  @IsIn(['stock', 'crypto', 'gold']) assetType!: TrackedAssetType;
  @IsString() symbol!: string;
  @IsIn(['above', 'below']) direction!: 'above' | 'below';
  @IsNumber() @Min(0) targetPrice!: number;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}
