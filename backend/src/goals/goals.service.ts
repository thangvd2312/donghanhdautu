import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  GoalIdResponse,
  GoalPreviewResponse,
  GoalsResponse,
  GoalStatusResponse,
  OkResponse,
  RiskType,
} from '@dautu/contracts';
import { vnDateKey } from '../market/types';
import { PortfolioService } from '../portfolio/portfolio.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ChoiceDto, GoalDto, StatusDto } from './dto/goal.dto';
import { normalizeAllocations, normalizeSymbol, validateAllocations, validateTargetAllocation } from './goal-math';
import type { Allocation } from './goal-math';
import { activeOption, adviceForReturn, holdingsByType, toGoalsResponse } from './goals.presenter';
import type { AdviceProfile } from './return-plan';

type Answers = Record<string, string | undefined>;
const answersOf = (v: unknown): Answers => (v && typeof v === 'object' ? (v as Answers) : {});

/** Ngày sau `years` năm (YYYY-MM-DD) */
function addYears(dateKey: string, years: number) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class GoalsService {
  constructor(
    private prisma: PrismaService,
    private portfolio: PortfolioService,
  ) {}

  async list(userId: string): Promise<GoalsResponse> {
    const [goals, v, profile] = await Promise.all([
      this.prisma.goal.findMany({
        where: { userId },
        include: { allocations: true },
        orderBy: [{ status: 'asc' }, { targetDate: 'asc' }],
      }),
      this.portfolio.valuation(userId),
      this.profile(userId),
    ]);
    return toGoalsResponse(goals, v, vnDateKey(), profile);
  }

  /** Kết luận cho một yêu cầu chưa lưu (form đang nhập); kiểu amount cần tài sản đã gán nên chỉ xem trước kiểu return */
  async preview(userId: string, dto: GoalDto): Promise<GoalPreviewResponse> {
    if (dto.kind !== 'return') return { advice: null };
    this.checkReturn(dto);
    const [v, profile] = await Promise.all([this.portfolio.valuation(userId), this.profile(userId)]);
    return { advice: adviceForReturn(this.returnColumns(dto, null), profile, holdingsByType(v)) };
  }

  async create(userId: string, dto: GoalDto): Promise<GoalIdResponse> {
    const derived = await this.derived(userId, dto, null);
    return this.locked(userId, async (db) => {
      const allocations = this.normalized(dto);
      await this.validate(db, userId, dto, allocations, null);
      const g = await db.goal.create({
        data: { userId, ...this.fields(dto, derived), allocations: { create: allocations } },
      });
      return { id: g.id };
    });
  }

  /** Chọn phương án (trong mức rủi ro / đạt mức mong muốn); cập nhật luôn giá trị đích dự kiến */
  async choose(userId: string, id: string, dto: ChoiceDto): Promise<GoalIdResponse> {
    const g = await this.own(userId, id);
    if (g.kind !== 'return') throw new BadRequestException('Chỉ mục tiêu sinh lời mới có phương án để chọn');
    const [v, profile] = await Promise.all([this.portfolio.valuation(userId), this.profile(userId)]);
    const advice = adviceForReturn({ ...g, riskChoice: dto.choice }, profile, holdingsByType(v));
    if (!advice.options.some((o) => o.key === dto.choice))
      throw new BadRequestException('Phương án này không còn phù hợp');
    await this.prisma.goal.update({
      where: { id },
      data: { riskChoice: dto.choice, targetAmount: activeOption(advice).projection.mid },
    });
    return { id };
  }

  private async profile(userId: string): Promise<AdviceProfile | null> {
    const p = await this.prisma.investorProfile.findUnique({ where: { userId } });
    if (!p) return null;
    const a = answersOf(p.answers);
    return {
      riskType: p.riskType as RiskType,
      maxDrawdownPct: p.maxDrawdownPct,
      fomoProne: p.fomoProne,
      experience: a.experience ?? null,
      incomeShare: a.income_share ?? null,
    };
  }

  private checkReturn(dto: GoalDto) {
    if (dto.returnMaxPct != null && dto.returnMinPct != null && dto.returnMaxPct < dto.returnMinPct) {
      throw new BadRequestException('Mức lãi tối đa phải lớn hơn mức tối thiểu');
    }
  }

  private returnColumns(dto: GoalDto, riskChoice: string | null) {
    return {
      capital: dto.capital ?? 0,
      returnMinPct: dto.returnMinPct ?? 0,
      returnMaxPct: dto.returnMaxPct ?? null,
      holdYears: dto.holdYears ?? 5,
      riskChoice,
      monthlyContribution: dto.monthlyContribution ?? 0,
    };
  }

  /**
   * Kiểu return: ngày đích = hôm nay + số năm giữ, giá trị đích = giá trị trung bình dự kiến của phương án đang dùng
   * (để cố vấn / "Cần xem lại" vẫn đọc được). Sửa mục tiêu giữ lựa chọn cũ nếu phương án đó vẫn còn.
   */
  private async derived(userId: string, dto: GoalDto, prevChoice: string | null) {
    if (dto.kind !== 'return') return null;
    this.checkReturn(dto);
    const [v, profile] = await Promise.all([this.portfolio.valuation(userId), this.profile(userId)]);
    const cols = this.returnColumns(dto, prevChoice);
    const advice = adviceForReturn(cols, profile, holdingsByType(v));
    const riskChoice =
      advice.options.some((o) => o.key === prevChoice) && advice.options.length > 1 ? prevChoice : null;
    return {
      ...cols,
      riskChoice,
      targetAmount: Math.max(1, activeOption(advice).projection.mid),
      targetDate: addYears(vnDateKey(), cols.holdYears),
    };
  }

  /** Sửa mục tiêu: chỉ đổi mục tiêu và phần gán, không đụng tới sổ giao dịch */
  async update(userId: string, id: string, dto: GoalDto): Promise<GoalIdResponse> {
    return this.locked(userId, async (db) => {
      const prev = await this.own(userId, id, db);
      const derived = await this.derived(userId, dto, prev.riskChoice);
      const allocations = this.normalized(dto);
      await this.validate(db, userId, dto, allocations, id);
      await db.goalAllocation.deleteMany({ where: { goalId: id } });
      await db.goal.update({
        where: { id },
        data: { ...this.fields(dto, derived), allocations: { create: allocations } },
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

  private fields(dto: GoalDto, derived: Awaited<ReturnType<GoalsService['derived']>>) {
    const ret = derived
      ? {
          kind: 'return',
          capital: derived.capital,
          returnMinPct: derived.returnMinPct,
          returnMaxPct: derived.returnMaxPct,
          holdYears: derived.holdYears,
          riskChoice: derived.riskChoice,
        }
      : { kind: 'amount', capital: null, returnMinPct: null, returnMaxPct: null, holdYears: null, riskChoice: null };
    return {
      ...ret,
      name: dto.name.trim(),
      targetAmount: derived ? derived.targetAmount : dto.targetAmount!,
      targetDate: new Date(`${derived ? derived.targetDate : dto.targetDate!}T00:00:00Z`),
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
    if (dto.kind !== 'return' && (!dto.targetDate || dto.targetDate <= vnDateKey()))
      errors.push('Ngày đích phải ở tương lai');
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
