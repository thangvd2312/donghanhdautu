import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type {
  DeployEtf,
  DeployHorizon,
  DeployMix,
  DeployMode,
  DeployTranches,
  DeploymentRequest,
} from '@dautu/contracts';
import { IsDateKey } from '../../common/dates';

export const MIN_AMOUNT = 1_000_000;
export const MAX_AMOUNT = 1e13;

class EmergencyDto {
  @IsNumber({}, { message: 'Chi tiêu mỗi tháng phải là số' })
  @Min(0, { message: 'Chi tiêu mỗi tháng không được âm' })
  @Max(MAX_AMOUNT, { message: 'Chi tiêu mỗi tháng quá lớn' })
  monthlyExpense!: number;
  @IsNumber({}, { message: 'Số đã để dành phải là số' })
  @Min(0, { message: 'Số đã để dành không được âm' })
  @Max(MAX_AMOUNT, { message: 'Số đã để dành quá lớn' })
  saved!: number;
  @IsInt({ message: 'Số tháng dự phòng phải là số nguyên' })
  @Min(3, { message: 'Quỹ dự phòng từ 3 đến 12 tháng chi tiêu' })
  @Max(12, { message: 'Quỹ dự phòng từ 3 đến 12 tháng chi tiêu' })
  months!: number;
}

const PCT = { message: 'Tỷ trọng từng phần là số nguyên từ 0 đến 100' };

class MixDto implements DeployMix {
  @IsInt(PCT) @Min(0, PCT) @Max(100, PCT) savings!: number;
  @IsInt(PCT) @Min(0, PCT) @Max(100, PCT) gold!: number;
  @IsInt(PCT) @Min(0, PCT) @Max(100, PCT) etf!: number;
  @IsInt(PCT) @Min(0, PCT) @Max(100, PCT) picks!: number;
  @IsInt(PCT) @Min(0, PCT) @Max(100, PCT) crypto!: number;
}

const DEBT = { message: 'Số nợ phải là số không âm' };

/** Đầu vào lập kế hoạch giải ngân (xem trước: không ghi gì) */
export class DeploymentDto implements DeploymentRequest {
  @IsOptional() @IsString() @MaxLength(40) portfolioId?: string | null;
  /** Mục tiêu kế hoạch phục vụ (phải là mục tiêu của người dùng) */
  @IsOptional() @IsString() @MaxLength(40) goalId?: string | null;
  @IsNumber({}, { message: 'Số tiền phải là số' })
  @Min(MIN_AMOUNT, { message: 'Số tiền tối thiểu 1.000.000 ₫' })
  @Max(MAX_AMOUNT, { message: 'Số tiền quá lớn' })
  amount!: number;
  /** Số góp mỗi tháng, bắt buộc khi mode = both */
  @ValidateIf((o: DeploymentDto) => o.mode === 'both')
  @IsNumber({}, { message: 'Số tiền góp mỗi tháng phải là số' })
  @Min(MIN_AMOUNT, { message: 'Số tiền góp mỗi tháng tối thiểu 1.000.000 ₫' })
  @Max(MAX_AMOUNT, { message: 'Số tiền góp mỗi tháng quá lớn' })
  monthlyAmount?: number | null;
  @IsIn(['one_time', 'monthly', 'both'], { message: 'Chọn giải ngân một lần, mỗi tháng hay cả hai' }) mode!: DeployMode;
  @IsIn(['short', 'medium', 'long'], { message: 'Chọn lúc nào cần dùng số tiền này' }) horizon!: DeployHorizon;
  @IsOptional() @IsDateKey() needBy?: string | null;
  @IsOptional() @IsBoolean() fromCash?: boolean;
  @IsOptional() @IsIn([1, 3, 6], { message: 'Số đợt là 1, 3 hoặc 6' }) tranches?: DeployTranches;
  @IsOptional() @IsIn(['E1VFVN30', 'FUEVFVND'], { message: 'ETF không hợp lệ' }) etf?: DeployEtf;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => MixDto) mix?: MixDto | null;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => EmergencyDto) emergency?: EmergencyDto | null;
  @IsOptional() @IsNumber({}, DEBT) @Min(0, DEBT) @Max(MAX_AMOUNT, DEBT) highInterestDebt?: number | null;
  @IsOptional() @IsNumber({}, DEBT) @Min(0, DEBT) @Max(MAX_AMOUNT, DEBT) marginDebt?: number | null;
}
