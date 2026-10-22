import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { GoalAllocationRequest, GoalRequest, GoalStatus, GoalStatusRequest } from '@dautu/contracts';
import { IsDateKey } from '../../common/dates';
import { ASSET_TYPES } from '../goal-math';
import type { GoalAssetType } from '../goal-math';

class AllocationDto implements GoalAllocationRequest {
  @IsIn(ASSET_TYPES) assetType!: GoalAssetType;
  @IsString() @MaxLength(20) symbol!: string;
  @IsNumber() @Min(0) @Max(100) pct!: number;
}

export class GoalDto implements GoalRequest {
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsNumber() @Min(1) targetAmount!: number;
  @IsDateKey() targetDate!: string;
  @IsOptional() @IsNumber() @Min(0) monthlyContribution?: number;
  @IsOptional() @IsNumber() @Min(-50) @Max(50) expectedReturnPct?: number;
  @IsOptional() @IsObject() targetAllocation?: Partial<Record<GoalAssetType, number>> | null;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => AllocationDto) allocations!: AllocationDto[];
}

export class StatusDto implements GoalStatusRequest {
  @IsIn(['active', 'paused', 'achieved']) status!: GoalStatus;
}
