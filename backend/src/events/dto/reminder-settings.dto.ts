import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, Matches } from 'class-validator';
import type { ReminderSettingsPatch } from '@dautu/contracts';

export class ReminderSettingsDto implements ReminderSettingsPatch {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsIn([1, 2, 3], { message: 'Nhắc trước chỉ nhận 1, 2 hoặc 3 ngày' }) daysBefore?: 1 | 2 | 3;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @Matches(/^[A-Za-z0-9]{1,20}$/, { each: true, message: 'Mã cổ phiếu không hợp lệ' })
  mutedSymbols?: string[];
}
