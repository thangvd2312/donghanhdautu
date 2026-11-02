import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type {
  ActiveDeployment,
  DeploymentPlanView,
  DeploymentPreview,
  DeploymentSetup,
  OkResponse,
} from '@dautu/contracts';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DeploymentExplainService } from './deployment-explain.service';
import { DeploymentPlansService } from './deployment-plans.service';
import { DeploymentService } from './deployment.service';
import { DeploymentDto } from './dto/deployment.dto';
import { StepDoneDto, StepSkipDto } from './dto/step.dto';

@UseGuards(JwtAuthGuard)
@Controller('deployment')
export class DeploymentController {
  constructor(
    private deployment: DeploymentService,
    private plans: DeploymentPlansService,
    private explainer: DeploymentExplainService,
  ) {}

  /** Dữ liệu điền sẵn cho các bước nhập (hồ sơ, tiền mặt, mục tiêu, giá ETF) */
  @Get('setup')
  async setup(@CurrentUser() user: AuthUser): Promise<DeploymentSetup> {
    const [setup, activePlanId] = await Promise.all([this.deployment.setup(user.id), this.plans.activeId(user.id)]);
    return { ...setup, activePlanId };
  }

  /** Lập kế hoạch giải ngân để xem trước; không ghi gì */
  @Post('preview')
  preview(@CurrentUser() user: AuthUser, @Body() dto: DeploymentDto): Promise<DeploymentPreview> {
    return this.deployment.preview(user.id, dto);
  }

  /** Lưu kế hoạch (lập lại từ đầu vào); kế hoạch đang chạy trước đó bị thay */
  @Post()
  save(@CurrentUser() user: AuthUser, @Body() dto: DeploymentDto): Promise<DeploymentPlanView> {
    return this.plans.save(user.id, dto);
  }

  /** Kế hoạch đang chạy hoặc vừa xong gần nhất; null nếu chưa có */
  @Get('active')
  async active(@CurrentUser() user: AuthUser): Promise<ActiveDeployment> {
    return { plan: await this.plans.active(user.id) };
  }

  @Post(':id/steps/:stepId/done')
  done(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @Body() dto: StepDoneDto,
  ): Promise<DeploymentPlanView> {
    return this.plans.stepDone(user.id, id, stepId, dto);
  }

  @Post(':id/steps/:stepId/skip')
  skip(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @Body() dto: StepSkipDto,
  ): Promise<DeploymentPlanView> {
    return this.plans.stepSkip(user.id, id, stepId, dto);
  }

  @Post(':id/steps/:stepId/reopen')
  reopen(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('stepId') stepId: string,
  ): Promise<DeploymentPlanView> {
    return this.plans.stepReopen(user.id, id, stepId);
  }

  /** AI viết phần "vì sao" cho kế hoạch đã lưu (một lần; đã có thì trả lại) */
  @Post(':id/explain')
  explain(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<DeploymentPlanView> {
    return this.explainer.explain(user.id, id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<OkResponse> {
    return this.plans.cancel(user.id, id);
  }
}
