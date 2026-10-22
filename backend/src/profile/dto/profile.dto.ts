import { IsBoolean, IsNumber, IsObject, IsOptional, Max, Min } from 'class-validator';
import type { ProfileSettingsRequest, SubmitQuizRequest } from '@dautu/contracts';
import type { QuizAnswers } from '../quiz';

export class SubmitQuizDto implements SubmitQuizRequest {
  @IsObject() answers!: QuizAnswers;
}

export class ProfileSettingsDto implements ProfileSettingsRequest {
  @IsOptional() @IsNumber() @Min(1) @Max(20) alertThresholdPct?: number;
  @IsOptional() @IsBoolean() morningBrief?: boolean;
  @IsOptional() @IsBoolean() closingBrief?: boolean;
  @IsOptional() @IsBoolean() weeklyBrief?: boolean;
  @IsOptional() @IsBoolean() macroAlerts?: boolean;
}
