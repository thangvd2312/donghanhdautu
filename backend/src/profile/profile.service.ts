import { BadRequestException, Injectable } from '@nestjs/common';
import type { InvestorProfile } from '@dautu/contracts';
import { AnalyticsService } from '../analytics/analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ProfileSettingsDto, SubmitQuizDto } from './dto/profile.dto';
import { toInvestorProfile } from './investor-profile';
import { scoreQuiz } from './quiz';

/** The investor profile: quiz submission (scored on the server) and alert / brief settings. */
@Injectable()
export class ProfileService {
  constructor(
    private prisma: PrismaService,
    private analytics: AnalyticsService,
  ) {}

  async submitQuiz(userId: string, dto: SubmitQuizDto): Promise<InvestorProfile> {
    let result: ReturnType<typeof scoreQuiz>;
    try {
      result = scoreQuiz(dto.answers);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const data = { ...result, answers: dto.answers };
    const saved = await this.prisma.investorProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    // Lần đầu (làm lại khảo sát không tính: chống trùng theo người dùng)
    void this.analytics.track('onboarding_completed', { userId, dedupeKey: 'onboarding_completed' });
    return toInvestorProfile(saved);
  }

  async updateSettings(userId: string, dto: ProfileSettingsDto): Promise<InvestorProfile> {
    return toInvestorProfile(await this.prisma.investorProfile.update({ where: { userId }, data: dto }));
  }
}
