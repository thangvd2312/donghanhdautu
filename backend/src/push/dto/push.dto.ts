import type { PushSubscribeRequest, PushUnsubscribeRequest } from '@dautu/contracts';
import { Type } from 'class-transformer';
import { IsString, IsUrl, Matches, MaxLength, ValidateNested } from 'class-validator';

class KeysDto {
  @IsString() @MaxLength(200) p256dh!: string;
  @IsString() @MaxLength(100) auth!: string;
}

/**
 * Địa chỉ nhận của dịch vụ Web Push của trình duyệt (Chrome / Edge / Firefox / Safari). Chỉ nhận các dịch vụ này để
 * worker không bị dùng gửi POST tới địa chỉ bất kỳ (máy nội bộ, localhost).
 */
const PUSH_SERVICE =
  /^https:\/\/([a-z0-9-]+\.)*(googleapis\.com|mozilla\.com|push\.apple\.com|notify\.windows\.com)(:443)?\//i;

export class SubscribeDto implements PushSubscribeRequest {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @Matches(PUSH_SERVICE, { message: 'Địa chỉ nhận thông báo không thuộc dịch vụ Web Push của trình duyệt' })
  @MaxLength(1000)
  endpoint!: string;
  @ValidateNested() @Type(() => KeysDto) keys!: KeysDto;
}

export class UnsubscribeDto implements PushUnsubscribeRequest {
  @IsString() @MaxLength(1000) endpoint!: string;
}
