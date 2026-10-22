import type { ChannelSettingsRequest } from '@dautu/contracts';
import { IsBoolean, IsInt, IsObject, IsOptional, Max, Min } from 'class-validator';

/** Notification preferences shared by the Telegram and Web Push channels. */
export class ChannelSettingsDto implements ChannelSettingsRequest {
  @IsOptional() @IsObject() kinds?: Record<string, boolean>;
  @IsOptional() @IsInt() @Min(0) @Max(1439) quietStart?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(1439) quietEnd?: number | null;
  @IsOptional() @IsBoolean() showDetails?: boolean;
}
