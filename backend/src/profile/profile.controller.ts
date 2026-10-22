import { Body, Controller, Get, Patch, Put, UseGuards } from '@nestjs/common';
import type { InvestorProfile, QuizQuestion } from '@dautu/contracts';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProfileSettingsDto, SubmitQuizDto } from './dto/profile.dto';
import { ProfileService } from './profile.service';
import { QUIZ } from './quiz';

@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private profile: ProfileService) {}

  @Get('quiz')
  quiz(): QuizQuestion[] {
    return QUIZ.map((q) => ({
      ...q,
      options: q.options.map(({ value, label }) => ({ value, label })),
    }));
  }

  @Put()
  submit(@CurrentUser() user: AuthUser, @Body() dto: SubmitQuizDto): Promise<InvestorProfile> {
    return this.profile.submitQuiz(user.id, dto);
  }

  @Patch('settings')
  settings(@CurrentUser() user: AuthUser, @Body() dto: ProfileSettingsDto): Promise<InvestorProfile> {
    return this.profile.updateSettings(user.id, dto);
  }
}
