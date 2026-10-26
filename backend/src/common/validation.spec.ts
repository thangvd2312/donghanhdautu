import { Type } from 'class-transformer';
import { IsInt, IsString, Max, ValidateNested } from 'class-validator';
import { appValidationPipe } from './validation';

class Allocation {
  @IsString() symbol!: string;
  @IsInt() @Max(100) pct!: number;
}
class Body {
  @IsString({ message: 'Thiếu tên mục tiêu' }) name!: string;
  @ValidateNested({ each: true }) @Type(() => Allocation) allocations!: Allocation[];
}

describe('appValidationPipe', () => {
  it('thông báo mặc định (tiếng Anh) thành tiếng Việt, kể cả trường lồng nhau; thông báo tự viết giữ nguyên', async () => {
    const pipe = appValidationPipe();
    const err: unknown = await pipe
      .transform({ name: 1, allocations: [{ symbol: 'FPT', pct: 120 }] }, { type: 'body', metatype: Body })
      .catch((e: { getResponse: () => { message: string[] } }) => e.getResponse().message);
    expect(err).toEqual(['Thiếu tên mục tiêu', 'Trường allocations.0.pct lớn hơn mức cho phép']);
  });
});
