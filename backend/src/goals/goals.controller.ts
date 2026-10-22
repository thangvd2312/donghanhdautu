import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import type { GoalIdResponse, GoalsResponse, GoalStatusResponse, OkResponse } from '@dautu/contracts';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GoalDto, StatusDto } from './dto/goal.dto';
import { GoalsService } from './goals.service';

@UseGuards(JwtAuthGuard)
@Controller('goals')
export class GoalsController {
  constructor(private goals: GoalsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<GoalsResponse> {
    return this.goals.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: GoalDto): Promise<GoalIdResponse> {
    return this.goals.create(user.id, dto);
  }

  @Put(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: GoalDto): Promise<GoalIdResponse> {
    return this.goals.update(user.id, id, dto);
  }

  @Post(':id/status')
  status(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: StatusDto): Promise<GoalStatusResponse> {
    return this.goals.setStatus(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<OkResponse> {
    return this.goals.remove(user.id, id);
  }
}
