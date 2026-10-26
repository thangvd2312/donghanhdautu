import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type {
  TipAmountRequest,
  TipAnalyzeRequest,
  TipAssetType,
  TipCreateRequest,
  TipDecision,
  TipDecisionRequest,
  TipSourceKind,
} from '@dautu/contracts';
import { MAX_TIP_TEXT } from '../tips.logic';

const ASSETS: readonly TipAssetType[] = ['stock', 'crypto'];
const KINDS: readonly TipSourceKind[] = ['zalo', 'telegram', 'facebook', 'broker', 'friend', 'other'];
const DECISIONS: readonly TipDecision[] = ['ignore', 'watch', 'plan', 'practice'];
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Số tiền giả định tối đa (VND): 1.000 tỷ, chặn số gõ nhầm */
const MAX_AMOUNT = 1e12;

export class TipCreateDto implements TipCreateRequest {
  @Transform(trim)
  @IsString()
  @MinLength(5, { message: 'Hãy dán nội dung lời khuyên (ít nhất vài chữ)' })
  @MaxLength(MAX_TIP_TEXT, {
    message: `Tin dài quá ${MAX_TIP_TEXT.toLocaleString('vi-VN')} ký tự, hãy chỉ dán phần khuyến nghị`,
  })
  text!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80) sourceName?: string;
  @IsOptional() @IsIn(KINDS) sourceKind?: TipSourceKind;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(20) symbol?: string;
  @IsOptional() @IsIn(ASSETS) assetType?: TipAssetType;
}

export class TipAnalyzeDto implements TipAnalyzeRequest {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(20) symbol?: string;
  @IsOptional() @IsIn(ASSETS) assetType?: TipAssetType;
  @IsOptional()
  @IsNumber()
  @Min(100_000, { message: 'Số tiền tối thiểu 100.000 ₫' })
  @Max(MAX_AMOUNT)
  amountVnd?: number;
}

export class TipAmountDto implements TipAmountRequest {
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(100_000, { message: 'Số tiền tối thiểu 100.000 ₫' })
  @Max(MAX_AMOUNT)
  amountVnd!: number | null;
}

export class TipDecisionDto implements TipDecisionRequest {
  @IsIn(DECISIONS) decision!: TipDecision;
  @IsOptional() @IsInt() @Min(1) @Max(50) dropPct?: number;
  @IsOptional() @IsString() @MaxLength(40) planId?: string;
}

export class TipListQuery {
  @IsOptional() @IsString() @MaxLength(40) cursor?: string;
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
