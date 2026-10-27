import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { NewsKind } from '@dautu/contracts';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const NEWS_KINDS: NewsKind[] = ['stock', 'coin'];

/** GET /news: chuỗi rỗng coi như không lọc */
export class NewsSearchQuery {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120, { message: 'Từ khoá quá dài (tối đa 120 ký tự)' })
  q?: string;

  @IsOptional() @IsIn(NEWS_KINDS, { message: 'Loại tin không hợp lệ' }) kind?: NewsKind;

  @IsOptional() @IsString() @MaxLength(60) category?: string;

  @IsOptional() @IsString() @MaxLength(60) source?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) days?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1000) offset?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}
