import { BadRequestException } from '@nestjs/common';
import type { ChannelSettingsRequest } from '@dautu/contracts';
import { DEFAULT_KINDS, KINDS } from './channel-rules';
import type { Kind } from './channel-rules';

interface StoredChannelSettings {
  kinds: unknown;
  quietStart: number | null;
  quietEnd: number | null;
}

interface MergedChannelSettings {
  kinds: Record<Kind, boolean>;
  quietStart: number | null;
  quietEnd: number | null;
}

/**
 * Applies a partial settings update on top of what is stored (or the defaults when nothing is stored yet):
 * unknown kinds are ignored, omitted quiet hours keep their value, and quiet hours must be set or cleared together.
 */
export function mergeChannelSettings(
  current: StoredChannelSettings | null,
  update: ChannelSettingsRequest,
): MergedChannelSettings {
  const kinds = { ...DEFAULT_KINDS, ...((current?.kinds as Record<string, boolean> | undefined) ?? {}) };
  for (const [k, v] of Object.entries(update.kinds ?? {})) {
    if ((KINDS as readonly string[]).includes(k) && typeof v === 'boolean') kinds[k as Kind] = v;
  }
  const quietStart = update.quietStart === undefined ? (current?.quietStart ?? null) : update.quietStart;
  const quietEnd = update.quietEnd === undefined ? (current?.quietEnd ?? null) : update.quietEnd;
  if ((quietStart === null) !== (quietEnd === null))
    throw new BadRequestException('Giờ yên lặng cần cả giờ bắt đầu và kết thúc');
  return { kinds, quietStart, quietEnd };
}
