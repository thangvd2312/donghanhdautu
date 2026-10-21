import { Body, Controller, Delete, Get, Module, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import type { OkResponse, SavedScreen, ScreenCriterion, ScreenResult } from '@dautu/contracts';
import { CurrentUser, JwtAuthGuard } from '../auth/auth.module';
import type { AuthUser } from '../auth/auth.module';
import { MarketModule } from '../market/market.module';
import { SavedScreenService } from './saved-screen.service';
import { ScreenerService } from './screener.service';

class RunDto {
  @IsOptional() @IsArray() filters?: unknown[];
  @IsOptional() @IsObject() sort?: Record<string, unknown>;
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1000) pageSize?: number;
}

class CreateSavedDto {
  @IsString() name!: string;
  @IsArray() filters!: unknown[];
  @IsOptional() @IsObject() sort?: Record<string, unknown> | null;
}

class UpdateSavedDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsArray() filters?: unknown[];
  @IsOptional() @IsObject() sort?: Record<string, unknown> | null;
}

@UseGuards(JwtAuthGuard)
@Controller('screener')
class ScreenerController {
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

@Module({
  imports: [MarketModule],
  controllers: [ScreenerController],
  providers: [ScreenerService, SavedScreenService],
})
export class ScreenerModule {}
