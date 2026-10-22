import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { OkResponse, WatchEntry, WatchItem } from '@dautu/contracts';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WatchDto } from './dto/watch.dto';
import { WatchlistService } from './watchlist.service';

@UseGuards(JwtAuthGuard)
@Controller('watchlist')
export class WatchlistController {
  constructor(private watchlist: WatchlistService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<WatchItem[]> {
    return this.watchlist.list(user.id);
  }

  @Post()
  add(@CurrentUser() user: AuthUser, @Body() dto: WatchDto): Promise<WatchEntry> {
    return this.watchlist.add(user.id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<OkResponse> {
    return this.watchlist.remove(user.id, id);
  }
}
