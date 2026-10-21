import { ValidationPipe } from '@nestjs/common';
import { SimulateDto } from './portfolio.module';

const pipe = new ValidationPipe({ whitelist: true, transform: true });
const run = (body: unknown) => pipe.transform(body, { type: 'body', metatype: SimulateDto });

describe('SimulateDto (ValidationPipe như main.ts)', () => {
  it('nhận kịch bản hợp lệ, giữ symbols, bỏ trường lạ, portfolioId null', async () => {
    const dto = (await run({
      portfolioId: null,
      shocks: { stock: -10, fx: 2, symbols: { FPT: -25 }, x: 1 },
    })) as SimulateDto;
    expect(dto.shocks).toMatchObject({ stock: -10, fx: 2, symbols: { FPT: -25 } });
    expect(dto.shocks).not.toHaveProperty('x');
  });
  it.each([[{ shocks: { stock: -91 } }], [{ shocks: { gold: 201 } }], [{ shocks: { fx: 'a' } }], [{}]])(
    '%j → 400',
    async (body) => {
      await expect(run(body)).rejects.toMatchObject({ status: 400 });
    },
  );
});
