import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

/** Có token hợp lệ thì gắn người dùng, không có thì vẫn cho qua với user = null (trang công khai) */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<T>(_err: unknown, user: T): T {
    return (user || null) as T;
  }
}
