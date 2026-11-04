import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  GoalAssignResponse,
  GoalIdResponse,
  GoalKind,
  GoalLeversResponse,
  GoalPreviewResponse,
  GoalsResponse,
  GroupTargets,
  GoalStatusResponse,
  OkResponse,
} from '@dautu/contracts';
import { vnDateKey } from '../market/types';
import { PortfolioService } from '../portfolio/portfolio.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AssignDto, ChoiceDto, GoalDto, StatusDto } from './dto/goal.dto';
import { goalLevers } from './goal-levers';
import { normalizeSymbol } from './goal-math';
import { combineTargetMixes, priorityOf, resolveKind, templateKindError } from './goal-plan';
import { goalTrack } from './goal-track';
import { GoalsContextService } from './goals-context.service';
import { activeOption } from './return-plan';
import { adviceForReturn, contributionsOfGoal, holdingsByType, toGoalActual, toGoalsResponse } from './goals.presenter';

/** Ngày sau `years` năm (YYYY-MM-DD) */
function addYears(dateKey: string, years: number) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

/** Mặc định ngày đích của quỹ dự phòng khi người dùng không đặt: 1 năm nữa */
const SAFETY_DEFAULT_YEARS = 1;

@Injectable()
export class GoalsService {
  constructor(
    private prisma: PrismaService,
    private portfolio: PortfolioService,
    private context: GoalsContextService,
  ) {}

  async list(userId: string): Promise<GoalsResponse> {
    return toGoalsResponse(await this.context.load(userId));
  }

  /**
   * Tỷ trọng đích gộp (4 nhóm) của các mục tiêu đang chạy, có trọng số theo giá trị đang thuộc từng mục tiêu; để điền sẵn
   * tỷ trọng lệch ở Cảnh báo danh mục. null khi chưa có mục tiêu nào có tỷ trọng đích.
   */
  async combinedTargets(userId: string): Promise<{ label: string; targets: GroupTargets } | null> {
    const ctx = await this.context.load(userId);
    const active = ctx.goals.filter((g) => g.status === 'active' && ctx.targetMix[g.id]);
    const targets = combineTargetMixes(
      active.map((g) => ({ mix: ctx.targetMix[g.id]!, weight: ctx.attribution.byGoal[g.id].value })),
    );
    if (!targets) return null;
    return { label: active.length === 1 ? `Theo mục tiêu "${active[0].name}"` : 'Theo các mục tiêu của bạn', targets };
  }

  /** Kết luận cho một yêu cầu chưa lưu (form đang nhập); chỉ xem trước kiểu return, kiểu khác có sẵn trong GET /goals */
  async preview(userId: string, dto: GoalDto): Promise<GoalPreviewResponse> {
    if (resolveKind(dto.kind, dto.template) !== 'return') return { advice: null };
    this.checkReturn(dto);
    const [v, profile] = await Promise.all([this.portfolio.valuation(userId), this.context.profile(userId)]);
    return { advice: adviceForReturn(this.returnColumns(dto, null), profile, holdingsByType(v)) };
  }

  async create(userId: string, dto: GoalDto): Promise<GoalIdResponse> {
    const kind = this.kindOf(dto);
    const derived = await this.derived(userId, dto, kind, null);
    const g = await this.prisma.goal.create({
      data: { userId, startedAt: new Date(`${vnDateKey()}T00:00:00Z`), ...this.fields(dto, kind, derived) },
    });
    return { id: g.id };
  }

  /** Sửa mục tiêu: chỉ đổi mục tiêu, không đụng tới sổ giao dịch và tài sản đã gắn */
  async update(userId: string, id: string, dto: GoalDto): Promise<GoalIdResponse> {
    const prev = await this.own(userId, id);
    const kind = this.kindOf(dto);
    const derived = await this.derived(userId, dto, kind, prev.riskChoice);
    await this.prisma.goal.update({ where: { id }, data: this.fields(dto, kind, derived) });
    return { id };
  }

  /** Chọn phương án (trong mức rủi ro / đạt mức mong muốn); cập nhật luôn giá trị đích dự kiến */
  async choose(userId: string, id: string, dto: ChoiceDto): Promise<GoalIdResponse> {
    const g = await this.own(userId, id);
    if (g.kind !== 'return') throw new BadRequestException('Chỉ mục tiêu sinh lời mới có phương án để chọn');
    const [v, profile] = await Promise.all([this.portfolio.valuation(userId), this.context.profile(userId)]);
    const advice = adviceForReturn({ ...g, riskChoice: dto.choice }, profile, holdingsByType(v));
    if (!advice.options.some((o) => o.key === dto.choice))
      throw new BadRequestException('Phương án này không còn phù hợp');
    await this.prisma.goal.update({
      where: { id },
      data: { riskChoice: dto.choice, targetAmount: activeOption(advice).projection.mid },
    });
    return { id };
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

  /**
   * Gắn một tài sản cũ vào mục tiêu: mọi giao dịch chưa gắn của mã đó (tiền mặt: cả số dư đầu kỳ, nạp, rút, phí). Giao
   * dịch đã gắn mục tiêu khác giữ nguyên.
   */
  async assign(userId: string, id: string, dto: AssignDto): Promise<GoalAssignResponse> {
    await this.own(userId, id);
    const target =
      dto.assetType === 'cash'
        ? { OR: [{ assetType: 'cash' }, { assetType: null }] }
        : { assetType: dto.assetType, symbol: normalizeSymbol(dto.symbol) };
    const { count } = await this.prisma.transaction.updateMany({
      where: { userId, deletedAt: null, goalId: null, ...target },
      data: { goalId: id },
    });
    return { id, assigned: count };
  }

  /** Các cách tới đích sớm hơn của một mục tiêu, kèm cái giá */
  async levers(userId: string, id: string): Promise<GoalLeversResponse> {
    const ctx = await this.context.load(userId);
    const goal = ctx.goals.find((g) => g.id === id);
    if (!goal) throw new NotFoundException('Không tìm thấy mục tiêu');
    const share = ctx.attribution.byGoal[id];
    const actual = toGoalActual(share);
    const targetMix = ctx.targetMix[id] ?? null;
    const track = goalTrack({
      goal,
      today: ctx.today,
      current: share.value,
      actualPct: share.value > 0 ? actual.pct : null,
      targetMix,
      contributions: contributionsOfGoal(id, ctx.contributions),
      buys: ctx.buys[id] ?? [],
    });
    return {
      goalId: id,
      kind: goal.kind,
      status: track.status,
      targetDate: goal.targetDate,
      reachDate: track.reach?.mid ?? null,
      delayMonths: track.delayMonths,
      levers: goalLevers({ goal, current: share.value, mix: targetMix, profile: ctx.profile, today: ctx.today }),
    };
  }

  private kindOf(dto: GoalDto): GoalKind {
    const kind = resolveKind(dto.kind, dto.template);
    const mismatch = templateKindError(kind, dto.template);
    if (mismatch) throw new BadRequestException(mismatch);
    if (dto.monthlyContributionMax != null && dto.monthlyContributionMax < (dto.monthlyContribution ?? 0)) {
      throw new BadRequestException('Mức góp cao nhất phải từ mức góp thấp nhất trở lên');
    }
    return kind;
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
   * Giá trị server tự tính. Kiểu return: ngày đích = hôm nay + số năm giữ, giá trị đích = giá trị trung bình dự kiến
   * của phương án đang dùng (sửa mục tiêu giữ lựa chọn cũ nếu phương án đó vẫn còn). Kiểu safety: đích = chi tiêu
   * tháng × số tháng. Kiểu amount: không có gì để tính.
   */
  private async derived(userId: string, dto: GoalDto, kind: GoalKind, prevChoice: string | null) {
    const today = vnDateKey();
    if (kind === 'amount') {
      if (!dto.targetDate || dto.targetDate <= today) throw new BadRequestException('Ngày đích phải ở tương lai');
      return null;
    }
    if (kind === 'safety') {
      if (dto.targetDate && dto.targetDate <= today) throw new BadRequestException('Ngày đích phải ở tương lai');
      return {
        targetAmount: Math.max(1, (dto.monthlyExpense ?? 0) * (dto.safetyMonths ?? 0)),
        targetDate: dto.targetDate ?? addYears(today, SAFETY_DEFAULT_YEARS),
      };
    }
    this.checkReturn(dto);
    const [v, profile] = await Promise.all([this.portfolio.valuation(userId), this.context.profile(userId)]);
    const cols = this.returnColumns(dto, prevChoice);
    const advice = adviceForReturn(cols, profile, holdingsByType(v));
    const riskChoice =
      advice.options.some((o) => o.key === prevChoice) && advice.options.length > 1 ? prevChoice : null;
    return {
      ...cols,
      riskChoice,
      targetAmount: Math.max(1, activeOption(advice).projection.mid),
      targetDate: addYears(today, cols.holdYears),
    };
  }

  private fields(dto: GoalDto, kind: GoalKind, derived: Awaited<ReturnType<GoalsService['derived']>>) {
    const none = { capital: null, returnMinPct: null, returnMaxPct: null, holdYears: null, riskChoice: null };
    const noSafety = { monthlyExpense: null, safetyMonths: null };
    const kindFields =
      kind === 'return' && derived && 'capital' in derived
        ? {
            capital: derived.capital,
            returnMinPct: derived.returnMinPct,
            returnMaxPct: derived.returnMaxPct,
            holdYears: derived.holdYears,
            riskChoice: derived.riskChoice,
            ...noSafety,
          }
        : kind === 'safety'
          ? { ...none, monthlyExpense: dto.monthlyExpense!, safetyMonths: dto.safetyMonths! }
          : { ...none, ...noSafety };
    return {
      ...kindFields,
      kind,
      template: dto.template ?? null,
      priority: priorityOf(kind, dto.template),
      name: dto.name.trim(),
      targetAmount: derived ? derived.targetAmount : dto.targetAmount!,
      targetDate: new Date(`${derived ? derived.targetDate : dto.targetDate!}T00:00:00Z`),
      monthlyContribution: dto.monthlyContribution ?? 0,
      monthlyContributionMax: dto.monthlyContributionMax ?? null,
      contributionDay: dto.contributionDay ?? null,
      note: dto.note?.trim() || null,
    };
  }

  private async own(userId: string, id: string) {
    const g = await this.prisma.goal.findFirst({ where: { id, userId } });
    if (!g) throw new NotFoundException('Không tìm thấy mục tiêu');
    return g;
  }
}
