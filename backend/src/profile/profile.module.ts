import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Module,
  Patch,
  Put,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsNumber, IsObject, IsOptional, Max, Min } from 'class-validator';
import { CurrentUser, JwtAuthGuard } from '../auth/auth.module';
import type { AuthUser } from '../auth/auth.module';
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
  @IsOptional() @IsBoolean() macroAlerts?: boolean;
}

@UseGuards(JwtAuthGuard)
@Controller('profile')
class ProfileController {
  constructor(private prisma: PrismaService) {}

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
    return this.prisma.investorProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: data,
    });
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
