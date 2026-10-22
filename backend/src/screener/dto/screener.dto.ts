import { IsArray, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class RunDto {
  @IsOptional() @IsArray() filters?: unknown[];
  @IsOptional() @IsObject() sort?: Record<string, unknown>;
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1000) pageSize?: number;
}

export class CreateSavedDto {
  @IsString() name!: string;
  @IsArray() filters!: unknown[];
  @IsOptional() @IsObject() sort?: Record<string, unknown> | null;
}

export class UpdateSavedDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsArray() filters?: unknown[];
  @IsOptional() @IsObject() sort?: Record<string, unknown> | null;
}
