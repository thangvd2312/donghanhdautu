import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { PlanDraftRequest, PlanRequest, PlanReviewRequest, TrackedAssetType } from '@dautu/contracts';
import { IsDateKey } from '../../common/dates';
import { JournalReviewTagsDto } from '../../journal/journal-tags';

const PLAN_ASSETS: readonly TrackedAssetType[] = ['stock', 'crypto', 'gold'];
export type PlanAsset = TrackedAssetType;

export class PlanDto implements PlanRequest {
  @IsIn(PLAN_ASSETS) assetType!: PlanAsset;
  @IsString() @MaxLength(20) symbol!: string;
  @IsString()
  @MinLength(5, { message: 'Hãy viết lý do mua / nắm giữ (ít nhất vài chữ)' })
  @MaxLength(3000)
  thesis!: string;
  @IsOptional() @IsString() @MaxLength(100) horizon?: string;
  @IsString()
  @MinLength(5, { message: 'Hãy viết điều kiện để xem lại hoặc bán' })
  @MaxLength(3000)
  exitConditions!: string;
  @IsOptional() @IsNumber() @Min(0) targetPrice?: number | null;
  @IsOptional() @IsNumber() @Min(0) stopPrice?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(730) reviewEveryDays?: number | null;
  @IsOptional() @IsDateKey() nextReviewAt?: string;
}

/** Nhãn lý do / cảm xúc (nhật ký quyết định) kế thừa từ JournalReviewTagsDto, tuỳ chọn */
export class ReviewDto extends JournalReviewTagsDto implements PlanReviewRequest {
  @IsIn(['keep', 'adjust', 'close']) decision!: 'keep' | 'adjust' | 'close';
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
  @IsOptional() @IsDateKey() nextReviewAt?: string;
}

export class DraftDto implements PlanDraftRequest {
  @IsIn(PLAN_ASSETS) assetType!: PlanAsset;
  @IsString() @MaxLength(20) symbol!: string;
}
