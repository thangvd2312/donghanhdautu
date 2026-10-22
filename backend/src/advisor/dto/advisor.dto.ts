import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { AdvisorChatRequest, AdvisorFeedbackReason, AdvisorFeedbackRequest } from '@dautu/contracts';

export class ChatDto implements AdvisorChatRequest {
  @IsOptional() @IsString() conversationId?: string;
  @IsString() @MinLength(1) @MaxLength(4000) message!: string;
}

const FEEDBACK_REASONS: readonly AdvisorFeedbackReason[] = [
  'wrong_number',
  'wrong_source',
  'outdated',
  'bad_advice',
  'other',
];

export class FeedbackDto implements AdvisorFeedbackRequest {
  @IsString() conversationId!: string;
  @IsString() answerId!: string;
  @IsIn(FEEDBACK_REASONS) reason!: AdvisorFeedbackReason;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}
