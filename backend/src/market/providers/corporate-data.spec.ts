import { passthroughCache } from '../../test-utils/market-cache';
import { DEFAULT_HTTP_OPTIONS, VietcapEventsAdapter } from './vietcap';
import { VietcapHttpClient } from './vietcap/vietcap-http.client';
import { VndirectProvider } from './vndirect.provider';

const json = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

afterEach(() => jest.restoreAllMocks());

describe('VndirectProvider.rawCloses', () => {
  it('đổi nghìn đồng ra đồng, giữ cả giá gốc và giá điều chỉnh, đọc đủ các trang, sắp theo ngày', async () => {
    const pages = [
      { totalPages: 2, data: [{ date: '2026-09-21', close: 66.4, adClose: 66.4 }] },
      { totalPages: 2, data: [{ date: '2026-09-18', close: 71.7, adClose: 65.182 }] },
    ];
    const fetch = jest.spyOn(global, 'fetch').mockImplementation((url) => {
      const page = Number(/page=(\d+)/.exec(url as string)![1]);
      return json(pages[page - 1]);
    });
    const rows = await new VndirectProvider().rawCloses('FPT', '2026-09-15', '2026-09-23');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(rows).toEqual([
      { date: '2026-09-18', close: 71_700, adjClose: 65_182 },
      { date: '2026-09-21', close: 66_400, adjClose: 66_400 },
    ]);
  });

  it('nguồn lỗi thì báo lỗi để bên gọi lùi về nguồn khác', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 503 } as Response);
    await expect(new VndirectProvider().rawCloses('FPT', '2026-09-15', '2026-09-23')).rejects.toThrow('503');
  });
});

describe('VietcapEventsAdapter.corporateEvents', () => {
  it('chỉ giữ cổ phiếu thưởng / cổ tức cổ phiếu / chia tách và cổ tức tiền mặt', async () => {
    const base = { exrightDate: '2026-09-21T00:00:00', recordDate: '2026-09-22T00:00:00' };
    jest.spyOn(global, 'fetch').mockImplementation(() =>
      json({
        data: {
          content: [
            {
              ...base,
              eventCode: 'ISS',
              eventTitleEn: 'Share Issue - Bonus Issue ratio 10.0%',
              eventTitleVi: 'Cổ phiếu thưởng 10%',
              exerciseRatio: 0.1,
            },
            { ...base, eventCode: 'ISS', eventTitleEn: 'Share Issue - ESOP ratio 0.5%', exerciseRatio: 0.005 },
            { ...base, eventCode: 'ISS', eventTitleEn: 'Share Issue - Rights issue ratio 20%', exerciseRatio: 0.2 },
            {
              ...base,
              eventCode: 'ISS',
              eventTitleEn: 'Share Issue - Stock dividend ratio 15.0%',
              exerciseRatio: 0.15,
            },
            {
              eventCode: 'DIV',
              eventTitleVi: 'Cổ tức tiền mặt 1,000 VND',
              exrightDate: '2026-05-28T00:00:00',
              payoutDate: '2026-06-10T00:00:00',
              valuePerShare: 1000,
            },
          ],
        },
      }),
    );
    const events = await new VietcapEventsAdapter(
      new VietcapHttpClient(DEFAULT_HTTP_OPTIONS),
      passthroughCache(),
    ).corporateEvents('FPT');
    expect(events.map((e) => [e.kind, e.exDate, e.ratio, e.valuePerShare, e.payoutDate])).toEqual([
      ['cash', '2026-05-28', null, 1000, '2026-06-10'],
      ['stock', '2026-09-21', 0.1, null, null],
      ['stock', '2026-09-21', 0.15, null, null],
    ]);
  });
});
