import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MacroService } from './macro.service';

@UseGuards(JwtAuthGuard)
@Controller('macro')
export class MacroController {
  constructor(private macro: MacroService) {}

  @Get()
  list() {
    return this.macro.all();
  }
}
