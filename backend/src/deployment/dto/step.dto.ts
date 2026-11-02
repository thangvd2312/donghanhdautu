import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import type { DeployStepDoneRequest, DeployStepSkipRequest } from '@dautu/contracts';

export class StepDoneDto implements DeployStepDoneRequest {
  @IsOptional() @IsString() @MaxLength(40) transactionId?: string | null;
}

export class StepSkipDto implements DeployStepSkipRequest {
  @IsString({ message: 'Ghi lý do bỏ qua đợt này' })
  @IsNotEmpty({ message: 'Ghi lý do bỏ qua đợt này' })
  @MaxLength(300, { message: 'Lý do tối đa 300 ký tự' })
  reason!: string;
}
