import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { HoldingDraftDto } from './holding-drafts.controller';
import { validateHoldingDraft } from './holding-draft.logic';

const text = 'Tôi có 100 FPT và 2 chỉ vàng.';
const row = { assetType: 'stock', symbol: 'fpt', quantity: 100, avgCost: null, sourceText: '100 FPT', warnings: [] };
const draft = (over = {}) => ({ rows: [{ ...row, ...over }], warnings: [] });

describe('holding drafts: untrusted AI output', () => {
  it('preserves missing cost and asks for it instead of inventing a quote', () => {
    const result = validateHoldingDraft(draft(), text, [])!;
    expect(result.rows[0]).toMatchObject({ symbol: 'FPT', avgCost: null });
    expect(result.rows[0].warnings.join(' ')).toContain('giá vốn');
  });
  it.each([NaN, Infinity, -1, 0, 1e16, '100'])('rejects invalid numeric quantity %s', (quantity) => {
    expect(validateHoldingDraft(draft({ quantity }), text, [])).toBeNull();
  });
  it('requires evidence from the actual transcript', () => {
    expect(validateHoldingDraft(draft({ sourceText: 'Tôi có 300 BTC' }), text, [])).toBeNull();
  });
  it('never chooses an unsupported gold code or foreign cash currency', () => {
    expect(
      validateHoldingDraft(draft({ assetType: 'gold', symbol: 'SJC-INVENTED' }), text, [])!.rows[0].symbol,
    ).toBeNull();
    expect(validateHoldingDraft(draft({ assetType: 'cash', symbol: 'USD' }), text, [])!.rows[0].assetType).toBeNull();
  });
  it('limits row count and rejects malformed structures', () => {
    expect(validateHoldingDraft({ rows: Array(21).fill(row), warnings: [] }, text, [])).toBeNull();
    expect(validateHoldingDraft({ rows: null }, text, [])).toBeNull();
  });
  it('accepts an empty extraction and explanatory warnings', () => {
    expect(validateHoldingDraft({ rows: [], warnings: ['Không phải khai báo tài sản.'] }, text, [])).toEqual({
      rows: [],
      warnings: ['Không phải khai báo tài sản.'],
    });
  });
  it('trims input and rejects empty, non-text, or oversized requests', () => {
    for (const input of ['', '  ', 123, 'a'.repeat(4001)]) {
      expect(validateSync(plainToInstance(HoldingDraftDto, { text: input })).length).toBeGreaterThan(0);
    }
    const input = plainToInstance(HoldingDraftDto, { text: '  Tôi có 100 FPT  ' });
    expect(validateSync(input)).toHaveLength(0);
    expect(input.text).toBe('Tôi có 100 FPT');
  });
});
