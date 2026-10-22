import { Controller, Get } from '@nestjs/common';
import type { DemoResponse } from '@dautu/contracts';
import { DemoService } from './demo.service';

/** Không cần đăng nhập */
@Controller('demo')
export class DemoController {
  constructor(private demo: DemoService) {}

  @Get()
  get(): Promise<DemoResponse> {
    return this.demo.demo();
  }
}
