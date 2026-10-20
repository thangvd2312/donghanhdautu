import { BadRequestException, Body, Controller, Get, Module, Patch, Put, UseGuards } from '@nestjs/common';
import { IsBoolean, IsNumber, IsObject, IsOptional, Max, Min } from 'class-validator';
import { CurrentUser, JwtAuthGuard } from '../auth/auth.module';
import type { AuthUser } from '../auth/auth.module';
import { AnalyticsService } from '../analytics/analytics.service';
import { PrismaService } from '../prisma/prisma.module';
import { QUIZ, scoreQuiz } from './quiz';
import type { QuizAnswers } from './quiz';

class SubmitQuizDto {
  @IsObject() answers!: QuizAnswers;
}

class SettingsDto {
  @IsOptional() @IsNumber() @Min(1) @Max(20) alertThresholdPct?: number;
  @IsOptional() @IsBoolean() morningBrief?: boolean;
  @IsOptional() @IsBoolean() closingBrief?: boolean;
  @IsOptional() @IsBoolean() weeklyBrief?: boolean;
  @IsOptional() @IsBoolean() macroAlerts?: boolean;
}

@UseGuards(JwtAuthGuard)
@Controller('profile')
class ProfileController {
  constructor(
    private prisma: PrismaService,
    private analytics: AnalyticsService,
  ) {}

  @Get('quiz')
  quiz() {
    return QUIZ.map((q) => ({
      ...q,
      options: q.options.map(({ value, label }) => ({ value, label })),
    }));
  }

  @Put()
  async submit(@CurrentUser() user: AuthUser, @Body() dto: SubmitQuizDto) {
    let result: ReturnType<typeof scoreQuiz>;
    try {
      result = scoreQuiz(dto.answers);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const data = { ...result, answers: dto.answers };
    const saved = await this.prisma.investorProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: data,
    });
    // Lần đầu (làm lại khảo sát không tính: chống trùng theo người dùng)
    void this.analytics.track('onboarding_completed', { userId: user.id, dedupeKey: 'onboarding_completed' });
    return saved;
  }

  @Patch('settings')
  settings(@CurrentUser() user: AuthUser, @Body() dto: SettingsDto) {
    return this.prisma.investorProfile.update({
      where: { userId: user.id },
      data: dto,
    });
  }
}

@Module({ controllers: [ProfileController] })
export class ProfileModule {}
