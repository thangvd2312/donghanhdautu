import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { OkResponse, SavedScreen, ScreenCriterion, ScreenResult } from '@dautu/contracts';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateSavedDto, RunDto, UpdateSavedDto } from './dto/screener.dto';
import { SavedScreenService } from './saved-screen.service';
import { ScreenerService } from './screener.service';

@UseGuards(JwtAuthGuard)
@Controller('screener')
export class ScreenerController {
  constructor(
    private screener: ScreenerService,
    private saved: SavedScreenService,
  ) {}

  @Get('criteria')
  criteria(): Promise<ScreenCriterion[]> {
    return this.screener.criteria();
  }

  @Post('run')
  run(@CurrentUser() user: AuthUser, @Body() dto: RunDto): Promise<ScreenResult> {
    return this.screener.run(user.id, dto);
  }

  @Get('saved')
  list(@CurrentUser() user: AuthUser): Promise<SavedScreen[]> {
    return this.saved.list(user.id);
  }

  @Post('saved')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSavedDto): Promise<SavedScreen> {
    return this.saved.create(user.id, dto);
  }

  @Patch('saved/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateSavedDto): Promise<SavedScreen> {
    return this.saved.update(user.id, id, dto);
  }

  @Delete('saved/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<OkResponse> {
    return this.saved.remove(user.id, id);
  }
}
