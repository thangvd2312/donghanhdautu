import { Body, Controller, Delete, Get, Module, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
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
  criteria() {
    return this.screener.criteria();
  }

  @Post('run')
  run(@CurrentUser() user: AuthUser, @Body() dto: RunDto) {
    return this.screener.run(user.id, dto);
  }

  @Get('saved')
  list(@CurrentUser() user: AuthUser) {
    return this.saved.list(user.id);
  }

  @Post('saved')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSavedDto) {
    return this.saved.create(user.id, dto);
  }

  @Patch('saved/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateSavedDto) {
    return this.saved.update(user.id, id, dto);
  }

  @Delete('saved/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.saved.remove(user.id, id);
  }
}

@Module({
  imports: [MarketModule],
  controllers: [ScreenerController],
  providers: [ScreenerService, SavedScreenService],
})
export class ScreenerModule {}
