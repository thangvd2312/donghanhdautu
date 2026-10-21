import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsDateKey } from '../common/dates';
import { CurrentUser, JwtAuthGuard } from '../auth/auth.module';
import type { AuthUser } from '../auth/auth.module';
import { vnDateKey } from '../market/types';
import { PortfolioModule, PortfolioService } from '../portfolio/portfolio.module';
import { PrismaService } from '../prisma/prisma.module';
import {
  ASSET_TYPES,
  goalProgress,
  monthsUntil,
  normalizeAllocations,
  normalizeSymbol,
  project,
  requiredMonthly,
  validateAllocations,
  validateTargetAllocation,
} from './goal-math';
import type { Allocation, GoalAssetType } from './goal-math';

class AllocationDto {
  @IsIn(ASSET_TYPES) assetType!: GoalAssetType;
  @IsString() @MaxLength(20) symbol!: string;
  @IsNumber() @Min(0) @Max(100) pct!: number;
}

class GoalDto {
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsNumber() @Min(1) targetAmount!: number;
  @IsDateKey() targetDate!: string;
  @IsOptional() @IsNumber() @Min(0) monthlyContribution?: number;
  @IsOptional() @IsNumber() @Min(-50) @Max(50) expectedReturnPct?: number;
  @IsOptional() @IsObject() targetAllocation?: Partial<Record<GoalAssetType, number>> | null;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => AllocationDto) allocations!: AllocationDto[];
}

class StatusDto {
  @IsIn(['active', 'paused', 'achieved']) status!: 'active' | 'paused' | 'achieved';
}

@Injectable()
export class GoalsService {
  constructor(
    private prisma: PrismaService,
    private portfolio: PortfolioService,
  ) {}

  async list(userId: string) {
    const [goals, v] = await Promise.all([
      this.prisma.goal.findMany({
        where: { userId },
        include: { allocations: true },
        orderBy: [{ status: 'asc' }, { targetDate: 'asc' }],
      }),
      this.portfolio.valuation(userId),
    ]);
    const today = vnDateKey();
    // Phần trăm còn trống của từng tài sản (để form gán tài sản hiển thị)
    const used = new Map<string, number>();
    for (const g of goals)
      for (const a of g.allocations)
        used.set(
          `${a.assetType}:${normalizeSymbol(a.symbol)}`,
          (used.get(`${a.assetType}:${normalizeSymbol(a.symbol)}`) ?? 0) + a.pct,
        );
    return {
      goals: goals.map((g) => {
        const target = (g.targetAllocation as Partial<Record<GoalAssetType, number>> | null) ?? null;
        const progress = goalProgress(
          { targetAmount: g.targetAmount, targetAllocation: target },
          g.allocations,
          v.holdings,
        );
        const date = g.targetDate.toISOString().slice(0, 10);
        const months = monthsUntil(today, date);
        const projected = project(progress.current, g.monthlyContribution, g.expectedReturnPct, months);
        return {
          id: g.id,
          name: g.name,
          targetAmount: g.targetAmount,
          targetDate: date,
          monthlyContribution: g.monthlyContribution,
          expectedReturnPct: g.expectedReturnPct,
          targetAllocation: target,
          status: g.status,
          note: g.note,
          allocations: g.allocations.map((a) => ({
            assetType: a.assetType,
            symbol: normalizeSymbol(a.symbol),
            pct: a.pct,
          })),
          progress,
          monthsLeft: months,
          /** Mô phỏng theo giả định của người dùng — không phải kết quả được đảm bảo */
          simulation: {
            projected,
            onTrack: projected >= g.targetAmount,
            requiredMonthly: requiredMonthly(progress.current, g.targetAmount, g.expectedReturnPct, months),
          },
          updatedAt: g.updatedAt,
        };
      }),
      /** Tài sản có thể gán và % còn trống */
      assets: v.holdings.map((h) => ({
        assetType: h.assetType,
        symbol: h.symbol,
        displayName: h.displayName,
        value: h.marketValue ?? h.costValue,
        usedPct: used.get(`${h.assetType}:${h.symbol}`) ?? 0,
      })),
    };
  }

  async create(userId: string, dto: GoalDto) {
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
  async update(userId: string, id: string, dto: GoalDto) {
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

  async setStatus(userId: string, id: string, dto: StatusDto) {
    await this.own(userId, id);
    await this.prisma.goal.update({ where: { id }, data: { status: dto.status } });
    return { id, status: dto.status };
  }

  async remove(userId: string, id: string) {
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

@UseGuards(JwtAuthGuard)
@Controller('goals')
class GoalsController {
  constructor(private goals: GoalsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.goals.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: GoalDto) {
    return this.goals.create(user.id, dto);
  }

  @Put(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: GoalDto) {
    return this.goals.update(user.id, id, dto);
  }

  @Post(':id/status')
  status(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: StatusDto) {
    return this.goals.setStatus(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.goals.remove(user.id, id);
  }
}

@Module({
  imports: [PortfolioModule],
  controllers: [GoalsController],
  providers: [GoalsService],
})
export class GoalsModule {}
