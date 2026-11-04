import type { DeploymentPlan, DeploymentStep, Prisma } from '@prisma/client';
import type {
  AssetType,
  DeployPlanStatus,
  DeployStep,
  DeployStepKind,
  DeployStepStatus,
  DeploymentPlanView,
  DeploymentPreview,
  DeployRationale,
} from '@dautu/contracts';

const dateKey = (d: Date) => d.toISOString().slice(0, 10);

/** Kế hoạch kèm các đợt theo đúng thứ tự lúc lập */
export const PLAN_WITH_STEPS = {
  steps: { orderBy: [{ dueDate: 'asc' }, { seq: 'asc' }] },
} satisfies Prisma.DeploymentPlanInclude;

export function toDeployStep(s: DeploymentStep): DeployStep {
  return {
    id: s.id,
    dueDate: dateKey(s.dueDate),
    kind: s.kind as DeployStepKind,
    assetType: s.assetType as AssetType | null,
    symbol: s.symbol,
    label: s.label,
    amount: s.amount,
    tranche: s.tranche,
    tranches: s.tranches,
    price: s.price,
    quantity: s.quantity,
    hint: s.hint,
    status: s.status as DeployStepStatus,
    skipReason: s.skipReason,
    transactionId: s.transactionId,
    doneAt: s.doneAt?.toISOString() ?? null,
  };
}

/** Các đợt cần được sắp theo `seq` (thứ tự lúc lập) */
export function toDeploymentPlanView(p: DeploymentPlan & { steps: DeploymentStep[] }): DeploymentPlanView {
  const steps = p.steps.map(toDeployStep);
  const open = steps.filter((s) => s.status === 'pending');
  const inputs = p.inputs as { fromCash?: boolean };
  return {
    id: p.id,
    status: p.status as DeployPlanStatus,
    createdAt: p.createdAt.toISOString(),
    portfolioId: p.portfolioId,
    goalId: p.goalId,
    fromCash: !!inputs.fromCash,
    plan: p.snapshot as unknown as Omit<DeploymentPreview, 'steps'>,
    steps,
    progress: {
      done: steps.filter((s) => s.status === 'done').length,
      skipped: steps.filter((s) => s.status === 'skipped').length,
      total: steps.length,
      doneAmount: steps.filter((s) => s.status === 'done').reduce((a, s) => a + s.amount, 0),
      totalAmount: steps.reduce((a, s) => a + s.amount, 0),
    },
    next: open[0] ?? null,
    nextReviewAt: dateKey(p.nextReviewAt),
    rationale: (p.rationale as DeployRationale | null) ?? null,
  };
}
