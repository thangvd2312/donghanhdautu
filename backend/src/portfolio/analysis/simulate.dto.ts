import { Type } from 'class-transformer';
import { IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import type { SimulateRequest } from '@dautu/contracts';
import { SHOCK_MAX_PCT, SHOCK_MIN_PCT } from './simulate';

const PCT_RANGE = `phải nằm trong khoảng ${SHOCK_MIN_PCT}% đến +${SHOCK_MAX_PCT}%`;

class ShocksDto {
  @IsOptional() @IsNumber({}, { message: `stock ${PCT_RANGE}` }) @Min(SHOCK_MIN_PCT) @Max(SHOCK_MAX_PCT) stock?: number;
  @IsOptional()
  @IsNumber({}, { message: `crypto ${PCT_RANGE}` })
  @Min(SHOCK_MIN_PCT)
  @Max(SHOCK_MAX_PCT)
  crypto?: number;
  @IsOptional() @IsNumber({}, { message: `gold ${PCT_RANGE}` }) @Min(SHOCK_MIN_PCT) @Max(SHOCK_MAX_PCT) gold?: number;
  @IsOptional() @IsNumber({}, { message: `fx ${PCT_RANGE}` }) @Min(SHOCK_MIN_PCT) @Max(SHOCK_MAX_PCT) fx?: number;
  /** Giá trị từng mã được kiểm tra trong simulate() */
  @IsOptional() @IsObject() symbols?: Record<string, number>;
}

/** Kịch bản mô phỏng: không ghi gì vào sổ */
export class SimulateDto implements SimulateRequest {
  @IsOptional() @IsString() @MaxLength(40) portfolioId?: string | null;
  @IsObject() @ValidateNested() @Type(() => ShocksDto) shocks!: ShocksDto;
}
