import { IsString, MaxLength } from 'class-validator';

export class DismissDto {
  @IsString() @MaxLength(120) key!: string;
}
