import { BadRequestException } from '@nestjs/common';
import { DEFAULT_KINDS } from './channel-rules';
import { mergeChannelSettings } from './channel-settings';

describe('mergeChannelSettings', () => {
  it('starts from the defaults when nothing is stored', () => {
    expect(mergeChannelSettings(null, {})).toEqual({ kinds: DEFAULT_KINDS, quietStart: null, quietEnd: null });
  });

  it('applies known boolean kinds only and keeps the rest of the stored values', () => {
    const stored = { kinds: { brief: true }, quietStart: 60, quietEnd: 120 };
    const merged = mergeChannelSettings(stored, { kinds: { news: true, bogus: true, macro: 'yes' as never } });
    expect(merged.kinds).toEqual({ ...DEFAULT_KINDS, brief: true, news: true });
    expect(merged).toMatchObject({ quietStart: 60, quietEnd: 120 });
  });

  it('lets quiet hours be cleared together', () => {
    const stored = { kinds: {}, quietStart: 60, quietEnd: 120 };
    expect(mergeChannelSettings(stored, { quietStart: null, quietEnd: null })).toMatchObject({
      quietStart: null,
      quietEnd: null,
    });
  });

  it('rejects a half-set quiet window', () => {
    expect(() => mergeChannelSettings(null, { quietStart: 60 })).toThrow(BadRequestException);
    expect(() => mergeChannelSettings({ kinds: {}, quietStart: 1, quietEnd: 2 }, { quietEnd: null })).toThrow(
      BadRequestException,
    );
  });
});
