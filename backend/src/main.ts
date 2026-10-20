import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  // Nhập giao dịch gửi nội dung CSV trong JSON (tối đa ~1 MB)
  app.useBodyParser('json', { limit: '2mb' });
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  serveFrontend(app, process.env.WEB_DIST ?? join(__dirname, '../../frontend/dist'));
  await app.listen(process.env.PORT ?? 3000, process.env.HOST ?? '0.0.0.0');
}

/** Production: một process phục vụ cả API lẫn bản build React (có SPA fallback). Dev: Vite lo frontend. */
function serveFrontend(app: NestExpressApplication, webDist: string) {
  const indexHtml = join(webDist, 'index.html');
  if (!existsSync(indexHtml)) return;

  // File trong assets/ có hash trong tên nên cache vĩnh viễn được
  app.useStaticAssets(join(webDist, 'assets'), { prefix: '/assets', immutable: true, maxAge: '1y' });
  app.useStaticAssets(webDist, { index: false, maxAge: '1h' });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });
}

void bootstrap();
