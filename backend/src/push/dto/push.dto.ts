import type { PushSubscribeRequest, PushUnsubscribeRequest } from '@dautu/contracts';
import { Type } from 'class-transformer';
import { IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';

class KeysDto {
  @IsString() @MaxLength(200) p256dh!: string;
  @IsString() @MaxLength(100) auth!: string;
}

export class SubscribeDto implements PushSubscribeRequest {
  @IsUrl({ protocols: ['https'], require_tld: false }) @MaxLength(1000) endpoint!: string;
  @ValidateNested() @Type(() => KeysDto) keys!: KeysDto;
}

export class UnsubscribeDto implements PushUnsubscribeRequest {
  @IsString() @MaxLength(1000) endpoint!: string;
}
