import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { DeployRationale, DeploymentPlanView, DeploymentPreview } from '@dautu/contracts';
import { AiUsageService } from '../ai/ai-usage.service';
import { writeChecked } from '../alerts/number-check';
import { LlmService } from '../alerts/llm.service';
import { PrismaService } from '../prisma/prisma.service';
import { PLAN_WITH_STEPS, toDeploymentPlanView } from './deployment.presenter';
import { EXPLAIN_PROMPT, EXPLAIN_SCHEMA, explainInput, explainMarkdown, parseExplain } from './deployment.prompt';

/**
 * AI viết phần "vì sao" cho kế hoạch đã lưu. Không quyết định con số: chỉ diễn giải kết quả quy tắc, số trong lời
 * giải thích phải khớp dữ liệu (không khớp sau một lần viết lại thì không lưu). Lỗi / hết lượt thì kế hoạch vẫn đủ với
 * câu mẫu của quy tắc. Đã có lời giải thích thì trả lại luôn, không gọi AI lần nữa.
 */
@Injectable()
export class DeploymentExplainService {
  private log = new Logger(DeploymentExplainService.name);

  constructor(
    private prisma: PrismaService,
    private llm: LlmService,
    private usage: AiUsageService,
  ) {}

  async explain(userId: string, planId: string): Promise<DeploymentPlanView> {
    const plan = await this.prisma.deploymentPlan.findFirst({
      where: { id: planId, userId, status: { in: ['active', 'done'] } },
      include: PLAN_WITH_STEPS,
    });
    if (!plan) throw new NotFoundException('Không tìm thấy kế hoạch');
    if (plan.rationale) return toDeploymentPlanView(plan);
    if (!this.llm.enabled)
      throw new ServiceUnavailableException('Cố vấn AI đang tắt; lý do theo quy tắc vẫn ở từng phần.');

    const snapshot = plan.snapshot as unknown as Omit<DeploymentPreview, 'steps'>;
    const data = explainInput(snapshot);
    const parts = snapshot.parts.map((p) => p.part);
    const rationale = await this.usage.run(userId, 'deployment_explain', async () => {
      const { result, unmatched } = await writeChecked(data, async (feedback) => {
        const raw = await this.llm.json<unknown>({
          tier: 'brief',
          feature: 'deployment_explain',
          userId,
          system: EXPLAIN_PROMPT,
          user: JSON.stringify(data) + feedback,
          schema: EXPLAIN_SCHEMA,
          effort: 'low',
          maxTokens: 4000,
        });
        const parsed = parseExplain(raw, parts);
        return parsed && { ...parsed, markdown: explainMarkdown(parsed) };
      });
      if (!result) return null;
      if (unmatched.length) {
        this.log.warn(`Giải thích kế hoạch ${planId}: số không khớp dữ liệu, không lưu: ${unmatched.join(', ')}`);
        return null;
      }
      return { summary: result.summary, parts: result.parts, at: new Date().toISOString() } satisfies DeployRationale;
    });
    if (!rationale) {
      throw new ServiceUnavailableException(
        'Chưa viết được lời giải thích khớp đúng số liệu của kế hoạch. Lý do theo quy tắc vẫn ở từng phần; thử lại sau.',
      );
    }
    const saved = await this.prisma.deploymentPlan.update({
      where: { id: planId },
      data: { rationale },
      include: PLAN_WITH_STEPS,
    });
    return toDeploymentPlanView(saved);
  }
}
