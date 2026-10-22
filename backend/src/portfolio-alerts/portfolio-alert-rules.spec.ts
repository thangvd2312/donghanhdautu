import type { PriceStatus, ReviewPoint } from '@dautu/contracts';
import {
  evaluate,
  evaluateConcentration,
  evaluateDrawdown,
  evaluateDrift,
  twrIndex,
  unreliableReason,
} from './evaluators';
import type { HistoryPointLite, HoldingLite, ValuationLite } from './evaluators';
import { dedupeKey, notificationFor, notifyDecision } from './notify';
import { mergeReviewPoints } from './review-merge';
import { defaultRule, validateRule, validateTargets } from './rule-config';
import type { RuleConfig } from './rule-config';

const h = (
  symbol: string,
  weightPct: number,
  assetType: HoldingLite['assetType'] = 'stock',
  status: PriceStatus = 'fresh',
): HoldingLite => ({
  id: `id-${symbol}`,
  assetType,
  symbol,
  displayName: symbol,
  weightPct,
  price: { status },
});
const val = (...holdings: HoldingLite[]): ValuationLite => ({ holdings, totalValue: 100_000_000 });

describe('mặc định và kiểm tra cấu hình', () => {
  it('mọi quy tắc mặc định tắt, có ngưỡng hợp lệ', () => {
    for (const k of ['concentration', 'drift', 'drawdown'] as const) {
      const r = defaultRule(k);
      expect(r.enabled).toBe(false);
      expect(validateRule(r)).toEqual([]);
    }
    expect(defaultRule('drawdown').windowDays).toBe(30);
    expect(defaultRule('concentration').thresholdPct).toBe(30);
  });

  it('chặn ngưỡng ngoài khoảng, tần suất / cửa sổ lạ, bật lệch tỷ trọng khi chưa có mục tiêu', () => {
    expect(validateRule({ ...defaultRule('concentration'), thresholdPct: 5 })).toHaveLength(1);
    expect(validateRule({ ...defaultRule('concentration'), thresholdPct: Number.NaN })).toHaveLength(1);
    expect(validateRule({ ...defaultRule('drawdown'), cooldownDays: 2 })).toHaveLength(1);
    expect(validateRule({ ...defaultRule('drawdown'), windowDays: 45 })).toHaveLength(1);
    expect(validateRule({ ...defaultRule('drift'), enabled: true })).toEqual([
      'Cần đặt tỷ trọng mục tiêu trước khi bật nhắc lệch tỷ trọng',
    ]);
    expect(validateRule({ ...defaultRule('drift'), enabled: false })).toEqual([]);
  });

  it('tỷ trọng mục tiêu: đúng nhóm, 0–100, tổng 100', () => {
    expect(validateTargets({ stock: 60, crypto: 0, gold: 10, cash: 30 })).toBeNull();
    expect(validateTargets({ stock: 60, gold: 40 })).toBeNull();
    expect(validateTargets({ stock: 60, bond: 40 })).toMatch(/không hợp lệ/);
    expect(validateTargets({ stock: 60, gold: 30 })).toMatch(/100%/);
    expect(validateTargets({ stock: 120, cash: -20 })).toMatch(/0 đến 100/);
    expect(validateTargets({ stock: '60', cash: 40 })).toMatch(/0 đến 100/);
  });
});

describe('dữ liệu giá chưa tin cậy thì không đánh giá', () => {
  it('giá thiếu / cũ / tỷ giá dự phòng → nêu đúng tài sản; tiền mặt không tính', () => {
    expect(unreliableReason(val(h('FPT', 50), h('VND', 50, 'cash', 'missing')))).toBeNull();
    const why = unreliableReason(
      val(h('FPT', 40, 'stock', 'stale'), h('BTC', 30, 'crypto', 'fallback'), h('SJC', 30, 'gold', 'missing')),
    )!;
    expect(why).toContain('chưa có giá SJC');
    expect(why).toContain('giá FPT đã cũ');
    expect(why).toContain('giá BTC quy đổi bằng tỷ giá dự phòng');
  });

  it('một mã giá cũ → tập trung và lệch tỷ trọng đều skipped, không báo', () => {
    const v = val(h('FPT', 60), h('HPG', 30, 'stock', 'stale'), h('VND', 10, 'cash'));
    const c = evaluateConcentration(v, 30);
    expect(c.status).toBe('skipped');
    expect(c.reason).toContain('HPG');
    const d = evaluateDrift(v, { stock: 50, crypto: 0, gold: 0, cash: 50 }, 10);
    expect(d.status).toBe('skipped');
    expect(notifyDecision(c, { enabled: true, cooldownDays: 1 }, null, new Date()).notify).toBe(false);
  });
});

describe('tập trung một tài sản', () => {
  it('vượt ngưỡng → firing, nêu tài sản lớn nhất trước', () => {
    const e = evaluateConcentration(val(h('FPT', 42), h('HPG', 35), h('VNM', 13), h('VND', 10, 'cash')), 30);
    expect(e.status).toBe('firing');
    expect(e.headline).toBe('FPT chiếm 42% (ngưỡng 30%) và 1 tài sản khác');
    expect(e.items.map((i) => i.label)).toEqual(['FPT', 'HPG']);
  });

  it('đúng bằng ngưỡng chưa phải "trên" ngưỡng; dưới ngưỡng nêu tài sản lớn nhất', () => {
    const e = evaluateConcentration(val(h('FPT', 30), h('HPG', 20), h('VND', 50, 'cash')), 30);
    expect(e.status).toBe('ok');
    expect(e.headline).toBe('Lớn nhất: FPT 30% (ngưỡng 30%)');
  });

  it('tiền mặt chiếm nhiều không phải tập trung; cùng mã ở nhiều danh mục được gộp', () => {
    expect(evaluateConcentration(val(h('FPT', 20), h('VND', 80, 'cash')), 30).status).toBe('ok');
    const e = evaluateConcentration(val(h('FPT', 20), h('FPT', 20), h('HPG', 20), h('VND', 40, 'cash')), 30);
    expect(e.status).toBe('firing');
    expect(e.items[0]).toMatchObject({ label: 'FPT', value: 40 });
  });

  it('một tài sản duy nhất hoặc chỉ có tiền mặt → không báo', () => {
    expect(evaluateConcentration(val(h('FPT', 100)), 30).status).toBe('ok');
    expect(evaluateConcentration(val(h('VND', 100, 'cash')), 30).status).toBe('ok');
    expect(evaluateConcentration(val(), 30).status).toBe('ok');
  });
});

describe('lệch tỷ trọng so với mục tiêu', () => {
  const targets = { stock: 50, crypto: 10, gold: 10, cash: 30 };

  it('nhóm lệch từ ngưỡng (cả cao hơn lẫn thấp hơn) → firing', () => {
    const e = evaluateDrift(val(h('FPT', 45), h('HPG', 25), h('BTC', 10, 'crypto'), h('VND', 20, 'cash')), targets, 10);
    expect(e.status).toBe('firing');
    expect(e.headline).toBe('Cổ phiếu 70% (mục tiêu 50%) và 2 nhóm khác');
    expect(e.items.map((i) => [i.key, i.value, i.reference])).toEqual([
      ['stock', 70, 50],
      ['gold', 0, 10],
      ['cash', 20, 30],
    ]);
  });

  it('đúng bằng ngưỡng là đủ; dưới ngưỡng thì ok', () => {
    const at = evaluateDrift(
      val(h('FPT', 60), h('BTC', 10, 'crypto'), h('SJC', 5, 'gold'), h('VND', 25, 'cash')),
      targets,
      10,
    );
    expect(at.status).toBe('firing');
    const below = evaluateDrift(
      val(h('FPT', 55), h('BTC', 10, 'crypto'), h('SJC', 8, 'gold'), h('VND', 27, 'cash')),
      targets,
      10,
    );
    expect(below.status).toBe('ok');
    expect(below.headline).toBe('Lệch nhiều nhất: Cổ phiếu +5 điểm (ngưỡng 10 điểm)');
  });

  it('chưa đặt mục tiêu → skipped; chưa có tài sản → ok', () => {
    expect(evaluateDrift(val(h('FPT', 100)), null, 10).status).toBe('skipped');
    expect(evaluateDrift(val(), targets, 10).status).toBe('ok');
  });
});

/** Lịch sử theo ngày tới `today`: value = giá trị cuối ngày, contrib = vốn đưa vào luỹ kế */
function series(today: string, rows: [number, number, HistoryPointLite['status']?][]): HistoryPointLite[] {
  const end = Date.parse(`${today}T00:00:00Z`);
  return rows.map(([value, contrib, status], i) => ({
    date: new Date(end - (rows.length - 1 - i) * 86_400_000).toISOString().slice(0, 10),
    value,
    netContributions: contrib,
    preTrackingGain: 0,
    status: status ?? 'complete',
    missing: status === 'partial' ? ['SJC'] : [],
  }));
}
const TODAY = '2026-10-22';

describe('giảm từ đỉnh, đã loại dòng vốn', () => {
  it('giảm thật 12% từ đỉnh → firing; đỉnh và mức giảm đúng', () => {
    const pts = series(TODAY, [
      [100, 100],
      [110, 100],
      [105, 100],
      [96.8, 100],
    ]);
    const e = evaluateDrawdown(pts, TODAY, 30, 10);
    expect(e.status).toBe('firing');
    expect(e.items[0].value).toBeCloseTo(12, 6);
    expect(e.headline).toBe('Danh mục giảm 12% so với đỉnh ngày 20/10 (ngưỡng 10%)');
    expect(e.severity).toBe('warning');
  });

  it('rút tiền làm giá trị giảm mạnh nhưng không phải lỗ → không báo', () => {
    // Rút 50 vào ngày thứ 3: giá trị 110 → 60 mà lợi suất ngày đó = 0
    const pts = series(TODAY, [
      [100, 100],
      [110, 100],
      [60, 50],
      [60, 50],
    ]);
    const e = evaluateDrawdown(pts, TODAY, 30, 10);
    expect(e.status).toBe('ok');
    expect(e.items[0].value).toBeCloseTo(0, 6);
  });

  it('nạp thêm tiền không che mất khoản giảm thật', () => {
    // Đỉnh 110, rồi giảm 20% (88), cùng ngày nạp 100: giá trị 188 cao hơn đỉnh nhưng danh mục vẫn đang giảm 20%
    const pts = series(TODAY, [
      [100, 100],
      [110, 100],
      [168, 200],
    ]);
    const e = evaluateDrawdown(pts, TODAY, 30, 10);
    expect(e.status).toBe('firing');
    expect(e.items[0].value).toBeCloseTo(20, 6);
  });

  it('chỉ tìm đỉnh trong cửa sổ nhìn lại', () => {
    const pts = series(TODAY, [[200, 100], ...Array.from({ length: 10 }, (): [number, number] => [100, 100])]);
    expect(evaluateDrawdown(pts, TODAY, 30, 10).status).toBe('firing');
    expect(evaluateDrawdown(pts, TODAY, 7, 10).status).toBe('ok');
  });

  it('ngày thiếu giá (tạm tính theo giá vốn) trong cửa sổ → skipped, không báo lỗ giả', () => {
    // Vàng mất giá: hôm nay bị tính theo giá vốn thấp hơn nhiều so với giá thị trường hôm qua
    const pts = series(TODAY, [
      [100, 100],
      [110, 100],
      [70, 100, 'partial'],
    ]);
    const e = evaluateDrawdown(pts, TODAY, 30, 10);
    expect(e.status).toBe('skipped');
    expect(e.reason).toContain('SJC');
    expect(notifyDecision(e, { enabled: true, cooldownDays: 1 }, null, new Date()).notify).toBe(false);
  });

  it('giá hôm nay ước tính / đỉnh rơi vào ngày ước tính → skipped', () => {
    expect(
      evaluateDrawdown(
        series(TODAY, [
          [100, 100],
          [110, 100],
          [80, 100, 'estimated'],
        ]),
        TODAY,
        30,
        10,
      ).status,
    ).toBe('skipped');
    const e = evaluateDrawdown(
      series(TODAY, [
        [100, 100],
        [130, 100, 'estimated'],
        [100, 100],
      ]),
      TODAY,
      30,
      10,
    );
    expect(e.status).toBe('skipped');
    expect(e.headline).toContain('Đỉnh');
    // Ngày ước tính ở giữa nhưng không phải đỉnh thì vẫn đánh giá được
    expect(
      evaluateDrawdown(
        series(TODAY, [
          [100, 100],
          [90, 100, 'estimated'],
          [85, 100],
        ]),
        TODAY,
        30,
        10,
      ).status,
    ).toBe('firing');
  });

  it('lịch sử quá ngắn, thiếu hôm nay hoặc rút nhiều hơn giá trị → skipped', () => {
    expect(evaluateDrawdown([], TODAY, 30, 10).status).toBe('skipped');
    expect(
      evaluateDrawdown(
        series(TODAY, [
          [100, 100],
          [80, 100],
        ]),
        TODAY,
        30,
        10,
      ).status,
    ).toBe('skipped');
    expect(
      evaluateDrawdown(
        series('2026-10-21', [
          [100, 100],
          [100, 100],
          [80, 100],
        ]),
        TODAY,
        30,
        10,
      ).status,
    ).toBe('skipped');
    const unresolved = series(TODAY, [
      [100, 100],
      [0, 100],
      [50, 50],
    ]);
    expect(twrIndex(unresolved)).toBeNull();
    expect(evaluateDrawdown(unresolved, TODAY, 30, 10).status).toBe('skipped');
  });

  it('danh mục bắt đầu trong cửa sổ (giá trị đầu = 0) vẫn tính được', () => {
    const pts = series(TODAY, [
      [0, 0],
      [100, 100],
      [85, 100],
    ]);
    const e = evaluateDrawdown(pts, TODAY, 30, 10);
    expect(e.status).toBe('firing');
    expect(e.items[0].value).toBeCloseTo(15, 6);
  });

  it('evaluate() không có lịch sử → drawdown skipped', () => {
    expect(evaluate(defaultRule('drawdown'), val(), null).status).toBe('skipped');
  });
});

describe('giới hạn tần suất và chống trùng', () => {
  const now = new Date('2026-10-22T08:20:00Z');
  const firing = { status: 'firing' as const };
  const rule = { enabled: true, cooldownDays: 3 };

  it('chưa báo lần nào → báo; quy tắc tắt hoặc không firing → không', () => {
    expect(notifyDecision(firing, rule, null, now)).toEqual({ notify: true, nextAllowedAt: null });
    expect(notifyDecision(firing, { ...rule, enabled: false }, null, now).notify).toBe(false);
    expect(notifyDecision({ status: 'ok' }, rule, null, now).notify).toBe(false);
    expect(notifyDecision({ status: 'skipped' }, rule, null, now).notify).toBe(false);
  });

  it('trong thời gian giới hạn → chưa báo lại, trả thời điểm được báo lại', () => {
    const last = new Date('2026-10-20T08:20:00Z');
    const d = notifyDecision(firing, rule, last, now);
    expect(d.notify).toBe(false);
    expect(d.nextAllowedAt!.toISOString()).toBe('2026-10-23T07:20:00.000Z');
    expect(notifyDecision(firing, rule, new Date('2026-10-19T08:30:00Z'), now).notify).toBe(true);
  });

  it('"mỗi ngày": lượt chạy lệch vài phút so với hôm qua vẫn được báo', () => {
    const last = new Date('2026-10-21T08:25:00Z');
    expect(notifyDecision(firing, { enabled: true, cooldownDays: 1 }, last, now).notify).toBe(true);
  });

  it('khoá chống trùng theo quy tắc và ngày', () => {
    expect(dedupeKey('drawdown', '2026-10-22')).toBe('portfolio:drawdown:2026-10-22');
    expect(dedupeKey('drawdown', '2026-10-22')).not.toBe(dedupeKey('drift', '2026-10-22'));
  });

  it('nội dung thông báo: lời nhắc xem lại, link tới trang cảnh báo', () => {
    const n = notificationFor(evaluateConcentration(val(h('FPT', 42), h('VND', 58, 'cash')), 30));
    expect(n.title).toBe('FPT chiếm 42% (ngưỡng 30%)');
    expect(n.body).toContain('không phải khuyến nghị bán');
    expect(n.link).toBe('/portfolio-alerts');
  });
});

describe('không có quy tắc nào → không có gì', () => {
  it('trang Hôm nay giữ nguyên các điểm mặc định', () => {
    const existing: ReviewPoint[] = [
      { id: 'concentration:id-FPT', severity: 'medium', title: 'FPT chiếm 42%', reason: '', link: null, ask: null },
      { id: 'allocation:stock', severity: 'info', title: 'Cổ phiếu', reason: '', link: null, ask: null },
    ];
    const v = val(h('FPT', 42), h('VND', 58, 'cash'));
    expect(mergeReviewPoints(existing, v, [], null, new Date())).toEqual(existing);
    // Có dòng nhưng đang tắt cũng như không có
    const off: RuleConfig[] = [defaultRule('concentration'), defaultRule('drift'), defaultRule('drawdown')];
    expect(mergeReviewPoints(existing, v, off, null, new Date())).toEqual(existing);
  });
});

describe('trang Hôm nay theo quy tắc đã bật', () => {
  const now = new Date('2026-10-22T09:00:00Z');
  const existing: ReviewPoint[] = [
    { id: 'concentration:id-FPT', severity: 'medium', title: 'mặc định 30%', reason: '', link: null, ask: null },
    { id: 'allocation:stock', severity: 'info', title: 'tham khảo', reason: '', link: null, ask: null },
    { id: 'profile', severity: 'medium', title: 'hồ sơ', reason: '', link: null, ask: null },
  ];
  const v = val(h('FPT', 42), h('HPG', 28), h('VND', 30, 'cash'));

  it('ngưỡng tập trung của người dùng thay cho mặc định', () => {
    const at50 = mergeReviewPoints(
      existing,
      v,
      [{ ...defaultRule('concentration'), enabled: true, thresholdPct: 50 }],
      null,
      now,
    );
    expect(at50.some((p) => p.id.startsWith('concentration:'))).toBe(false);
    const at25 = mergeReviewPoints(
      existing,
      v,
      [{ ...defaultRule('concentration'), enabled: true, thresholdPct: 25 }],
      null,
      now,
    );
    expect(at25.filter((p) => p.id.startsWith('concentration:')).map((p) => p.title)).toEqual([
      'FPT chiếm 42% danh mục',
      'HPG chiếm 28% danh mục',
    ]);
    expect(at25.find((p) => p.id === 'profile')).toBeDefined();
  });

  it('mục tiêu tỷ trọng của người dùng thay cho mức tham khảo', () => {
    const drift = { ...defaultRule('drift'), enabled: true, targets: { stock: 50, crypto: 0, gold: 0, cash: 50 } };
    const out = mergeReviewPoints(existing, v, [drift], null, now);
    expect(out.filter((p) => p.id.startsWith('allocation:')).map((p) => p.id)).toEqual([
      'allocation:stock',
      'allocation:cash',
    ]);
    expect(out.find((p) => p.id === 'allocation:stock')!.title).toBe('Cổ phiếu 70%, mục tiêu của bạn 50%');
  });

  it('dữ liệu giá chưa tin cậy → bỏ điểm mặc định, không thêm điểm theo ngưỡng', () => {
    const stale = val(h('FPT', 42, 'stock', 'stale'), h('VND', 58, 'cash'));
    const out = mergeReviewPoints(existing, stale, [{ ...defaultRule('concentration'), enabled: true }], null, now);
    expect(out.some((p) => p.id.startsWith('concentration:'))).toBe(false);
  });

  it('giảm từ đỉnh: chỉ hiện kết quả firing còn mới của worker', () => {
    const rule = [{ ...defaultRule('drawdown'), enabled: true }];
    const check = { at: '2026-10-22T08:20:00Z', status: 'firing' as const, title: 'Danh mục giảm 12%', reason: 'TWR' };
    expect(mergeReviewPoints([], v, rule, check, now).map((p) => p.id)).toEqual(['drawdown']);
    expect(mergeReviewPoints([], v, rule, { ...check, status: 'skipped' }, now)).toEqual([]);
    expect(mergeReviewPoints([], v, rule, { ...check, at: '2026-10-20T08:20:00Z' }, now)).toEqual([]);
    expect(mergeReviewPoints([], v, [{ ...rule[0], enabled: false }], check, now)).toEqual([]);
  });
});
