import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { AppModule } from './app.module';
import { pagePreview, withPreview } from './common/link-preview';
import { appValidationPipe } from './common/validation';
import { declareAppRole } from './runtime/app-role';

async function bootstrap() {
  // API + socket + poll bảng giá; việc nền chạy ở worker.ts. Khai báo ở đây để APP_ROLE trong .env dùng chung không đổi được vai trò
  declareAppRole('web');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  // Nhập giao dịch gửi nội dung CSV trong JSON (tối đa ~1 MB)
  app.useBodyParser('json', { limit: '2mb' });
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  });
  app.useGlobalPipes(appValidationPipe());
  serveFrontend(app, process.env.WEB_DIST ?? join(__dirname, '../../frontend/dist'));
  await app.listen(process.env.PORT ?? 3000, process.env.HOST ?? '0.0.0.0');
}

const CONTENT_TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

/** Production: một process phục vụ cả API lẫn bản build React (có SPA fallback). Dev: Vite lo frontend. */
function serveFrontend(app: NestExpressApplication, webDist: string) {
  const indexHtml = join(webDist, 'index.html');
  if (!existsSync(indexHtml)) return;
  // Bản build cố định trong suốt vòng đời process (deploy là restart), nên đọc một lần
  const indexTemplate = readFileSync(indexHtml, 'utf8');
  const origin = (process.env.FRONTEND_ORIGIN ?? 'https://dautu.thangvu.io.vn').split(',')[0].trim();

  // Bản nén sẵn lúc build (.br / .gz): trả thẳng nếu trình duyệt nhận, không nén lại mỗi request.
  // Chỉ áp cho /assets nên luồng SSE của cố vấn không bị ảnh hưởng.
  const assets = resolve(webDist, 'assets');
  app.use('/assets', (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const accept = String(req.headers['accept-encoding'] ?? '');
    const type = CONTENT_TYPES[extname(req.path)];
    if (!type || req.path.includes('..')) return next();
    for (const [enc, ext] of [
      ['br', '.br'],
      ['gzip', '.gz'],
    ] as const) {
      const file = join(assets, `${req.path}${ext}`);
      if (!accept.includes(enc) || !existsSync(file)) continue;
      res.setHeader('Content-Encoding', enc);
      res.setHeader('Content-Type', type);
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.sendFile(file);
    }
    next();
  });
  // File trong assets/ có hash trong tên nên cache vĩnh viễn được
  app.useStaticAssets(join(webDist, 'assets'), { prefix: '/assets', immutable: true, maxAge: '1y' });
  app.useStaticAssets(webDist, { index: false, maxAge: '1h' });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    // Thẻ xem trước khi chia sẻ link: điền tiêu đề / mô tả theo trang vì ứng dụng chat không chạy JavaScript
    res.type('html').send(withPreview(indexTemplate, pagePreview(req.path, req.query), origin));
  });
}

void bootstrap();
