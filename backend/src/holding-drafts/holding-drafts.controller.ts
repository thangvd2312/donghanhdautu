import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { HoldingDraftRequest, HoldingDraftResponse } from '@dautu/contracts';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HoldingDraftsService } from './holding-drafts.service';

export class HoldingDraftDto implements HoldingDraftRequest {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text!: string;
}

@Controller('holding-drafts')
@UseGuards(JwtAuthGuard)
export class HoldingDraftsController {
  constructor(private drafts: HoldingDraftsService) {}

  @Post()
  draft(@CurrentUser() user: AuthUser, @Body() dto: HoldingDraftDto): Promise<HoldingDraftResponse> {
    return this.drafts.draft(user.id, dto.text);
  }
}
