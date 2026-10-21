import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';
import { Filter, ScreenerInputError, Sort, validateFilters, validateSort } from './screener.logic';

export const MAX_SAVED_SCREENS = 20;
const NOT_FOUND = 'Không tìm thấy bộ lọc đã lưu';

export interface SavedScreenInput {
  name?: string;
  filters?: unknown;
  /** undefined: giữ nguyên; null: bỏ cách sắp xếp */
  sort?: unknown;
}

@Injectable()
export class SavedScreenService {
  constructor(private prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.savedScreen.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } });
  }

  async create(userId: string, input: SavedScreenInput & { name: string }) {
    const name = cleanName(input.name);
    const { filters, sort } = parse(input.filters, input.sort);
    return this.prisma.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`screen:${userId}`}))`;
      if ((await db.savedScreen.count({ where: { userId } })) >= MAX_SAVED_SCREENS) {
        throw new BadRequestException(
          `Bạn chỉ lưu được tối đa ${MAX_SAVED_SCREENS} bộ lọc — hãy xoá bớt bộ lọc không dùng nữa`,
        );
      }
      if (await db.savedScreen.findUnique({ where: { userId_name: { userId, name } } })) throw duplicate();
      return db.savedScreen.create({
        data: {
          userId,
          name,
          filters: filters as unknown as Prisma.InputJsonValue,
          sort: sort ? (sort as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        },
      });
    });
  }

  async update(userId: string, id: string, input: SavedScreenInput) {
    return this.prisma.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`screen:${userId}`}))`;
      const current = await db.savedScreen.findFirst({ where: { id, userId } });
      if (!current) throw new NotFoundException(NOT_FOUND);
      const data: Prisma.SavedScreenUpdateInput = {};
      if (input.name !== undefined) {
        const name = cleanName(input.name);
        const clash = await db.savedScreen.findUnique({ where: { userId_name: { userId, name } } });
        if (clash && clash.id !== id) throw duplicate();
        data.name = name;
      }
      if (input.filters !== undefined || input.sort !== undefined) {
        const filters = input.filters !== undefined ? input.filters : current.filters;
        // Sắp xếp cũ có thể không còn hợp lệ với bộ lọc mới (vd sắp xếp theo cổ tức sau khi bỏ lọc cổ tức): bỏ đi thay vì lỗi
        const sortRaw = input.sort !== undefined ? input.sort : current.sort;
        const parsed = parse(filters, sortRaw, input.sort === undefined);
        data.filters = parsed.filters as unknown as Prisma.InputJsonValue;
        data.sort = parsed.sort ? (parsed.sort as unknown as Prisma.InputJsonValue) : Prisma.DbNull;
      }
      return db.savedScreen.update({ where: { id }, data });
    });
  }

  async remove(userId: string, id: string) {
    const { count } = await this.prisma.savedScreen.deleteMany({ where: { id, userId } });
    if (!count) throw new NotFoundException(NOT_FOUND);
    return { ok: true };
  }
}

const duplicate = () => new BadRequestException('Bạn đã có bộ lọc trùng tên này, hãy chọn tên khác');

function cleanName(raw: string) {
  const name = raw.trim();
  if (name.length < 1 || name.length > 60) throw new BadRequestException('Tên bộ lọc phải từ 1 đến 60 ký tự');
  return name;
}

function parse(
  rawFilters: unknown,
  rawSort: unknown,
  dropInvalidSort = false,
): { filters: Filter[]; sort: Sort | null } {
  try {
    const filters = validateFilters(rawFilters);
    if (rawSort === undefined || rawSort === null) return { filters, sort: null };
    try {
      return { filters, sort: validateSort(rawSort, filters) };
    } catch (e) {
      if (dropInvalidSort) return { filters, sort: null };
      throw e;
    }
  } catch (e) {
    if (e instanceof ScreenerInputError) throw new BadRequestException(e.message);
    throw e;
  }
}
