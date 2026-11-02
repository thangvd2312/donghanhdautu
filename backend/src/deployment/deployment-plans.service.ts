import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { DeploymentPlanView } from '@dautu/contracts';
import { AnalyticsService } from '../analytics/analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { DeploymentService } from './deployment.service';
import { PLAN_WITH_STEPS, toDeploymentPlanView } from './deployment.presenter';
import type { DeploymentDto } from './dto/deployment.dto';
import type { StepDoneDto, StepSkipDto } from './dto/step.dto';

const day = (key: string) => new Date(`${key}T00:00:00Z`);

/** Lưu kế hoạch giải ngân và theo dõi từng đợt. Mỗi người một kế hoạch đang chạy. */
@Injectable()
export class DeploymentPlansService {
  constructor(
    private prisma: PrismaService,
    private deployment: DeploymentService,
    private analytics: AnalyticsService,
  ) {}

  /** Lập lại từ đầu vào (không tin số từ trình duyệt) rồi lưu; kế hoạch đang chạy trước đó chuyển sang cancelled */
  async save(userId: string, dto: DeploymentDto): Promise<DeploymentPlanView> {
    const preview = await this.deployment.preview(userId, dto);
    const { steps, ...snapshot } = preview;
    const plan = await this.prisma.$transaction(async (db) => {
      await db.deploymentPlan.updateMany({ where: { userId, status: 'active' }, data: { status: 'cancelled' } });
      return db.deploymentPlan.create({
        data: {
          userId,
          portfolioId: dto.portfolioId || null,
          amount: preview.amount,
          mode: preview.mode,
          horizon: preview.horizon,
          needBy: preview.needBy ? day(preview.needBy) : null,
          // Bản JSON thuần của DTO (bỏ trường undefined), kèm ngày khai
          inputs: JSON.parse(
            JSON.stringify({
              ...dto,
              fromCash: preview.mode === 'one_time' && !!dto.fromCash,
              declaredAt: preview.startDate,
            }),
          ) as Prisma.InputJsonValue,
          targetMix: preview.mix,
          suggestedMix: preview.suggestedMix,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          nextReviewAt: day(preview.nextReviewAt),
          steps: {
            create: steps.map((s, seq) => ({
              seq,
              dueDate: day(s.dueDate),
              kind: s.kind,
              assetType: s.assetType,
              symbol: s.symbol,
              label: s.label,
              amount: s.amount,
              tranche: s.tranche,
              tranches: s.tranches,
              price: s.price,
              quantity: s.quantity,
              hint: s.hint,
            })),
          },
        },
        include: PLAN_WITH_STEPS,
      });
    });
    void this.analytics.track('deployment_saved', {
      userId,
      props: { mode: preview.mode, steps: steps.length, overridden: preview.overrides.length > 0 },
    });
    return toDeploymentPlanView(plan);
  }

  async active(userId: string): Promise<DeploymentPlanView | null> {
    const p = await this.prisma.deploymentPlan.findFirst({
      where: { userId, status: { in: ['active', 'done'] } },
      orderBy: { createdAt: 'desc' },
      include: PLAN_WITH_STEPS,
    });
    return p ? toDeploymentPlanView(p) : null;
  }

  activeId(userId: string) {
    return this.prisma.deploymentPlan
      .findFirst({ where: { userId, status: 'active' }, select: { id: true } })
      .then((p) => p?.id ?? null);
  }

  /** Đánh dấu đã làm; có giao dịch vừa ghi sổ thì gắn vào (phải là giao dịch của chính người dùng) */
  async stepDone(userId: string, planId: string, stepId: string, dto: StepDoneDto) {
    await this.ownStep(userId, planId, stepId);
    if (dto.transactionId) {
      const tx = await this.prisma.transaction.findFirst({
        where: { id: dto.transactionId, userId },
        select: { id: true },
      });
      if (!tx) throw new BadRequestException('Không tìm thấy giao dịch này trong sổ của bạn');
    }
    await this.prisma.deploymentStep.update({
      where: { id: stepId },
      data: { status: 'done', doneAt: new Date(), transactionId: dto.transactionId ?? null, skipReason: null },
    });
    return this.afterChange(userId, planId);
  }

  async stepSkip(userId: string, planId: string, stepId: string, dto: StepSkipDto) {
    if (!dto.reason.trim()) throw new BadRequestException('Ghi lý do bỏ qua đợt này');
    await this.ownStep(userId, planId, stepId);
    await this.prisma.deploymentStep.update({
      where: { id: stepId },
      data: { status: 'skipped', skipReason: dto.reason.trim(), doneAt: new Date(), transactionId: null },
    });
    return this.afterChange(userId, planId);
  }

  /** Hoàn tác: đợt về lại "chưa làm" (giao dịch đã ghi sổ giữ nguyên, sửa ở Danh mục nếu cần) */
  async stepReopen(userId: string, planId: string, stepId: string) {
    await this.ownStep(userId, planId, stepId);
    await this.prisma.deploymentStep.update({
      where: { id: stepId },
      data: { status: 'pending', doneAt: null, skipReason: null, transactionId: null },
    });
    return this.afterChange(userId, planId);
  }

  async cancel(userId: string, planId: string) {
    const p = await this.prisma.deploymentPlan.findFirst({ where: { id: planId, userId } });
    if (!p) throw new NotFoundException('Không tìm thấy kế hoạch');
    await this.prisma.deploymentPlan.update({ where: { id: planId }, data: { status: 'cancelled' } });
    return { ok: true as const };
  }

  private async ownStep(userId: string, planId: string, stepId: string) {
    const s = await this.prisma.deploymentStep.findFirst({
      where: { id: stepId, planId, plan: { userId, status: { in: ['active', 'done'] } } },
    });
    if (!s) throw new NotFoundException('Không tìm thấy đợt này');
    return s;
  }

  /** Hết đợt chưa làm thì kế hoạch xong (vẫn nhắc xem lại theo lịch); mở lại một đợt thì chạy tiếp */
  private async afterChange(userId: string, planId: string): Promise<DeploymentPlanView> {
    const pending = await this.prisma.deploymentStep.count({ where: { planId, status: 'pending' } });
    const p = await this.prisma.deploymentPlan.update({
      where: { id: planId },
      data: { status: pending ? 'active' : 'done' },
      include: PLAN_WITH_STEPS,
    });
    if (!pending) void this.analytics.track('deployment_completed', { userId, props: { steps: p.steps.length } });
    return toDeploymentPlanView(p);
  }
}
