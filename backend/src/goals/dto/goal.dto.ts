import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type {
  GoalAllocationRequest,
  GoalChoiceRequest,
  GoalKind,
  GoalRequest,
  GoalRiskChoice,
  GoalStatus,
  GoalStatusRequest,
} from '@dautu/contracts';
import { IsDateKey } from '../../common/dates';
import { ASSET_TYPES } from '../goal-math';
import type { GoalAssetType } from '../goal-math';

class AllocationDto implements GoalAllocationRequest {
  @IsIn(ASSET_TYPES) assetType!: GoalAssetType;
  @IsString() @MaxLength(20) symbol!: string;
  @IsNumber() @Min(0) @Max(100) pct!: number;
}

const isReturn = (o: GoalDto) => o.kind === 'return';

export class GoalDto implements GoalRequest {
  @IsOptional() @IsIn(['amount', 'return']) kind?: GoalKind;
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  /** Kiểu amount: bắt buộc; kiểu return: server tự tính */
  @ValidateIf((o: GoalDto) => !isReturn(o)) @IsNumber() @Min(1) targetAmount?: number;
  @ValidateIf((o: GoalDto) => !isReturn(o)) @IsDateKey() targetDate?: string;
  @ValidateIf(isReturn) @IsNumber() @Min(1_000_000) @Max(1e13) capital?: number;
  @ValidateIf(isReturn) @IsNumber() @Min(1) @Max(50) returnMinPct?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(60) returnMaxPct?: number | null;
  @ValidateIf(isReturn) @IsInt() @Min(1) @Max(30) holdYears?: number;
  @IsOptional() @IsNumber() @Min(0) monthlyContribution?: number;
  @IsOptional() @IsNumber() @Min(-50) @Max(50) expectedReturnPct?: number;
  @IsOptional() @IsObject() targetAllocation?: Partial<Record<GoalAssetType, number>> | null;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => AllocationDto) allocations!: AllocationDto[];
}

export class StatusDto implements GoalStatusRequest {
  @IsIn(['active', 'paused', 'achieved']) status!: GoalStatus;
}

export class ChoiceDto implements GoalChoiceRequest {
  @IsIn(['within', 'target']) choice!: GoalRiskChoice;
}
