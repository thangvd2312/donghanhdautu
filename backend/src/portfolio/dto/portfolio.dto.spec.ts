import { appValidationPipe } from '../../common/validation';
import { PortfolioNameDto } from './portfolio.dto';
import { TransactionDto } from './transaction.dto';

const run = (metatype: new () => object, value: object) =>
  appValidationPipe()
    .transform(value, { type: 'body', metatype })
    .then((v: unknown) => ({ ok: true as const, v }))
    .catch((e: { getResponse: () => { message: string[] } }) => ({ ok: false as const, msg: e.getResponse().message }));

describe('kiểm tra đầu vào danh mục / giao dịch', () => {
  it('tên danh mục được bỏ khoảng trắng; chỉ toàn dấu cách thì từ chối', async () => {
    expect(await run(PortfolioNameDto, { name: '  Dài hạn  ' })).toEqual({ ok: true, v: { name: 'Dài hạn' } });
    expect(await run(PortfolioNameDto, { name: '   ' })).toEqual({
      ok: false,
      msg: ['Tên danh mục không được để trống'],
    });
  });

  it('số quá lớn bị từ chối bằng lời rõ ràng thay vì lỗi máy chủ', async () => {
    const r = await run(TransactionDto, { type: 'deposit', date: '2026-10-01', amount: 1e20 });
    expect(r).toEqual({ ok: false, msg: ['Số quá lớn (tối đa 1 triệu tỷ)'] });
  });
});
