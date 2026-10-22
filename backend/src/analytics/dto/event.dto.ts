import { IsIn, IsObject, IsOptional, Matches } from 'class-validator';
import type { AnalyticsEventRequest, ClientEvent } from '@dautu/contracts';
import { CLIENT_EVENTS } from '../events';

export class EventDto implements AnalyticsEventRequest {
  @IsIn(CLIENT_EVENTS) name!: ClientEvent;
  /** Mã ngẫu nhiên của trình duyệt khách (chưa đăng nhập) */
  @IsOptional() @Matches(/^[A-Za-z0-9-]{8,64}$/) anonId?: string;
  @IsOptional() @IsObject() props?: Record<string, unknown>;
}
