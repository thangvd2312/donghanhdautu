import { IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { MAX_BYTES } from '../csv-import';
import type { Mapping } from '../csv-import';

export class ImportDto {
  @IsString() @MaxLength(MAX_BYTES, { message: 'File quá lớn (tối đa khoảng 1 MB)' }) csv!: string;
  @IsOptional() @IsString() @MaxLength(200) fileName?: string;
  @IsOptional() @IsObject() mapping?: Mapping;
  @IsOptional() @IsIn(['.', ',']) decimal?: '.' | ',';
  /** Số dòng (theo file) của các dòng nghi trùng mà người dùng vẫn muốn nhập */
  @IsOptional() @IsArray() @IsInt({ each: true }) includeDuplicates?: number[];
  /** Danh mục nhận giao dịch; bỏ trống = danh mục chính */
  @IsOptional() @IsString() @MaxLength(40) portfolioId?: string;
}
