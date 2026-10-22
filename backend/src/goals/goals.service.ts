import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { GoalIdResponse, GoalsResponse, GoalStatusResponse, OkResponse } from '@dautu/contracts';
import { vnDateKey } from '../market/types';
import { PortfolioService } from '../portfolio/portfolio.service';
import { PrismaService } from '../prisma/prisma.service';
import type { GoalDto, StatusDto } from './dto/goal.dto';
import { normalizeAllocations, normalizeSymbol, validateAllocations, validateTargetAllocation } from './goal-math';
import type { Allocation } from './goal-math';
import { toGoalsResponse } from './goals.presenter';

@Injectable()
export class GoalsService {
  constructor(
    private prisma: PrismaService,
    private portfolio: PortfolioService,
  ) {}

  async list(userId: string): Promise<GoalsResponse> {
    const [goals, v] = await Promise.all([
      this.prisma.goal.findMany({
        where: { userId },
        include: { allocations: true },
        orderBy: [{ status: 'asc' }, { targetDate: 'asc' }],
      }),
      this.portfolio.valuation(userId),
    ]);
    return toGoalsResponse(goals, v, vnDateKey());
  }

  async create(userId: string, dto: GoalDto): Promise<GoalIdResponse> {
    return this.locked(userId, async (db) => {
      const allocations = this.normalized(dto);
      await this.validate(db, userId, dto, allocations, null);
      const g = await db.goal.create({
        data: { userId, ...this.fields(dto), allocations: { create: allocations } },
      });
      return { id: g.id };
    });
  }

  /** Sửa mục tiêu: chỉ đổi mục tiêu và phần gán, không đụng tới sổ giao dịch */
  async update(userId: string, id: string, dto: GoalDto): Promise<GoalIdResponse> {
    return this.locked(userId, async (db) => {
      await this.own(userId, id, db);
      const allocations = this.normalized(dto);
      await this.validate(db, userId, dto, allocations, id);
      await db.goalAllocation.deleteMany({ where: { goalId: id } });
      await db.goal.update({
        where: { id },
        data: { ...this.fields(dto), allocations: { create: allocations } },
      });
      return { id };
    });
  }

  /**
   * Kiểm tra phần trăm còn trống rồi ghi trong cùng transaction có khoá theo người dùng: hai yêu cầu cùng lúc
   * không thể cùng đọc phần gán cũ rồi cùng ghi vượt 100% một tài sản.
   */
  private locked<T>(userId: string, fn: (db: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`goals:${userId}`}))`;
      return fn(db);
    });
  }

  async setStatus(userId: string, id: string, dto: StatusDto): Promise<GoalStatusResponse> {
    await this.own(userId, id);
    await this.prisma.goal.update({ where: { id }, data: { status: dto.status } });
    return { id, status: dto.status };
  }

  async remove(userId: string, id: string): Promise<OkResponse> {
    await this.own(userId, id);
    await this.prisma.goal.delete({ where: { id } });
    return { ok: true };
  }

  private fields(dto: GoalDto) {
    return {
      name: dto.name.trim(),
      targetAmount: dto.targetAmount,
      targetDate: new Date(`${dto.targetDate}T00:00:00Z`),
      monthlyContribution: dto.monthlyContribution ?? 0,
      expectedReturnPct: dto.expectedReturnPct ?? 6,
      // Không đặt tỷ trọng mong muốn = xoá (NULL trong DB)
      targetAllocation: dto.targetAllocation ? dto.targetAllocation : Prisma.DbNull,
      note: dto.note?.trim() || null,
    };
  }

  /** Phần gán có % > 0 với mã đã chuẩn hóa: đúng dữ liệu được kiểm tra và lưu */
  private normalized(dto: GoalDto) {
    return normalizeAllocations(dto.allocations.filter((a) => a.pct > 0));
  }

  private async validate(
    db: Prisma.TransactionClient,
    userId: string,
    dto: GoalDto,
    next: Allocation[],
    goalId: string | null,
  ) {
    const errors: string[] = [];
    if (dto.targetDate <= vnDateKey()) errors.push('Ngày đích phải ở tương lai');
    const allocErr = validateTargetAllocation(dto.targetAllocation);
    if (allocErr) errors.push(allocErr);
    const others = await db.goalAllocation.findMany({
      where: { goal: { userId }, ...(goalId ? { goalId: { not: goalId } } : {}) },
    });
    const holdings = await db.holding.findMany({
      where: { userId },
      select: { assetType: true, symbol: true },
    });
    for (const a of next) {
      if (!holdings.some((h) => h.assetType === a.assetType && normalizeSymbol(h.symbol) === a.symbol)) {
        errors.push(`${a.symbol} không có trong danh mục của bạn`);
      }
    }
    errors.push(...validateAllocations(next, others, (a) => a.symbol.replace(/USDT$/, '')));
    if (errors.length) throw new BadRequestException(errors.join('. '));
  }

  private async own(userId: string, id: string, db: Prisma.TransactionClient = this.prisma) {
    const g = await db.goal.findFirst({ where: { id, userId } });
    if (!g) throw new NotFoundException('Không tìm thấy mục tiêu');
    return g;
  }
}
