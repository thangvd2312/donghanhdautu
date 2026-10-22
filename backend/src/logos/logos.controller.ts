import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { LogosService } from './logos.service';

/** Không cần đăng nhập: thẻ <img> không gửi kèm token, và logo là dữ liệu công khai */
@Controller('logos')
export class LogosController {
  constructor(private logos: LogosService) {}

  @Get('stock/:symbol')
  async stock(@Param('symbol') raw: string, @Res() res: Response) {
    const symbol = raw.toUpperCase().replace(/\.\w+$/, '');
    if (!/^[A-Z0-9]{3,10}$/.test(symbol)) throw new NotFoundException();
    const logo = await this.logos.stock(symbol);
    if (!logo.body) {
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.status(404).end();
    }
    res.setHeader('Content-Type', logo.type);
    res.setHeader('Cache-Control', 'public, max-age=604800');
    return res.end(logo.body);
  }

  @Get('crypto/:base')
  crypto(@Param('base') raw: string, @Res() res: Response) {
    const base = raw
      .toLowerCase()
      .replace(/usdt$/, '')
      .replace(/\.svg$/, '');
    if (!/^[a-z0-9]{2,10}$/.test(base)) throw new NotFoundException();
    const svg = this.logos.crypto(base);
    if (!svg) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.status(404).end();
    }
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=2592000');
    return res.end(svg);
  }
}
