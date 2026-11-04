import {
  IsIn,
  IsInt,
  IsNotEmpty,
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
  ContributionRequest,
  ContributionSkipRequest,
  GoalAssignRequest,
  GoalChoiceRequest,
  GoalKind,
  GoalRequest,
  GoalRiskChoice,
  GoalStatus,
  GoalStatusRequest,
  GoalTemplate,
} from '@dautu/contracts';
import { IsDateKey } from '../../common/dates';
import { ASSET_TYPES } from '../goal-math';
import type { GoalAssetType } from '../goal-math';
import { TEMPLATES } from '../goal-plan';

const isReturn = (o: GoalDto) =>
  o.kind === 'return' || (!o.kind && (o.template === 'grow' || o.template === 'retirement'));
const isSafety = (o: GoalDto) => o.kind === 'safety' || (!o.kind && o.template === 'emergency');
const isAmount = (o: GoalDto) => !isReturn(o) && !isSafety(o);

export class GoalDto implements GoalRequest {
  @IsOptional() @IsIn(['amount', 'return', 'safety']) kind?: GoalKind;
  @IsOptional() @IsIn(TEMPLATES, { message: 'Mẫu mục tiêu không hợp lệ' }) template?: GoalTemplate | null;
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  /** Kiểu amount: bắt buộc; kiểu return / safety: server tự tính */
  @ValidateIf(isAmount) @IsNumber() @Min(1) targetAmount?: number;
  /** Kiểu amount: bắt buộc; kiểu safety: tuỳ chọn; kiểu return: server tự tính */
  @ValidateIf((o: GoalDto) => isAmount(o) || (isSafety(o) && o.targetDate != null)) @IsDateKey() targetDate?: string;
  @ValidateIf(isReturn) @IsNumber() @Min(1_000_000) @Max(1e13) capital?: number;
  @ValidateIf(isReturn) @IsNumber() @Min(1) @Max(50) returnMinPct?: number;
  @IsOptional() @IsNumber() @Min(1) @Max(60) returnMaxPct?: number | null;
  @ValidateIf(isReturn) @IsInt() @Min(1) @Max(30) holdYears?: number;
  @ValidateIf(isSafety) @IsNumber() @Min(1) @Max(1e12) monthlyExpense?: number;
  @ValidateIf(isSafety)
  @IsInt({ message: 'Quỹ dự phòng từ 3 đến 12 tháng chi tiêu' })
  @Min(3, { message: 'Quỹ dự phòng từ 3 đến 12 tháng chi tiêu' })
  @Max(12, { message: 'Quỹ dự phòng từ 3 đến 12 tháng chi tiêu' })
  safetyMonths?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1e12) monthlyContribution?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1e12) monthlyContributionMax?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(28) contributionDay?: number | null;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class StatusDto implements GoalStatusRequest {
  @IsIn(['active', 'paused', 'achieved']) status!: GoalStatus;
}

export class ChoiceDto implements GoalChoiceRequest {
  @IsIn(['within', 'target']) choice!: GoalRiskChoice;
}

export class AssignDto implements GoalAssignRequest {
  @IsIn(ASSET_TYPES) assetType!: GoalAssetType;
  @IsString() @MinLength(1) @MaxLength(20) symbol!: string;
}

/** Tổng tiền góp tháng này (VND) */
export class ContributionDto implements ContributionRequest {
  @IsNumber({}, { message: 'Số tiền góp phải là số' })
  @Min(1000, { message: 'Số tiền góp tối thiểu 1.000 ₫' })
  @Max(1e13, { message: 'Số tiền quá lớn' })
  amount!: number;
}

export class ContributionSkipDto implements ContributionSkipRequest {
  @IsString({ message: 'Ghi lý do bỏ qua tháng này' })
  @IsNotEmpty({ message: 'Ghi lý do bỏ qua tháng này' })
  @MaxLength(300, { message: 'Lý do tối đa 300 ký tự' })
  reason!: string;
}
