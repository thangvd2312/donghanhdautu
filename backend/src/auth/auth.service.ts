import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import type { AuthToken, Me } from '@dautu/contracts';
import { AnalyticsService } from '../analytics/analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { toMe } from './auth.presenter';
import type { LoginDto, RegisterDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  private google: OAuth2Client | null;
  readonly googleClientId: string | null;

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    config: ConfigService,
    private analytics: AnalyticsService,
  ) {
    this.googleClientId = config.get<string>('GOOGLE_CLIENT_ID') || null;
    this.google = this.googleClientId ? new OAuth2Client(this.googleClientId) : null;
  }

  async register(dto: RegisterDto): Promise<AuthToken> {
    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('Email đã được đăng ký');
    }
    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name,
        passwordHash: await bcrypt.hash(dto.password, 10),
      },
    });
    void this.analytics.track('signup', { userId: user.id, props: { method: 'password' }, dedupeKey: 'signup' });
    return this.issue(user.id, user.email);
  }

  async login(dto: LoginDto): Promise<AuthToken> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (user && !user.passwordHash) {
      throw new UnauthorizedException('Tài khoản này đăng nhập bằng Google — hãy dùng nút "Đăng nhập với Google"');
    }
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash!))) {
      throw new UnauthorizedException('Sai email hoặc mật khẩu');
    }
    return this.issue(user.id, user.email);
  }

  /**
   * Đăng nhập bằng Google: xác minh ID token, rồi
   *  - đã có tài khoản gắn Google này → đăng nhập
   *  - đã có tài khoản cùng email (đăng ký bằng mật khẩu) → gắn Google vào tài khoản đó
   *  - chưa có → tạo mới; người dùng mới chưa có hồ sơ nên frontend sẽ đưa vào khảo sát
   */
  async loginWithGoogle(credential: string): Promise<AuthToken> {
    if (!this.google || !this.googleClientId) {
      throw new UnauthorizedException('Máy chủ chưa cấu hình đăng nhập Google');
    }
    let payload;
    try {
      const ticket = await this.google.verifyIdToken({ idToken: credential, audience: this.googleClientId });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Phiên đăng nhập Google không hợp lệ hoặc đã hết hạn');
    }
    if (!payload?.sub || !payload.email || !payload.email_verified) {
      throw new UnauthorizedException('Tài khoản Google chưa xác minh email');
    }
    const email = payload.email.toLowerCase();
    const avatarUrl = payload.picture ?? null;

    let user = await this.prisma.user.findUnique({ where: { googleId: payload.sub } });
    if (!user) {
      const byEmail = await this.prisma.user.findUnique({ where: { email } });
      if (byEmail) {
        user = await this.prisma.user.update({
          where: { id: byEmail.id },
          data: { googleId: payload.sub, avatarUrl: byEmail.avatarUrl ?? avatarUrl },
        });
      } else {
        user = await this.prisma.user.create({
          data: { email, googleId: payload.sub, avatarUrl, name: payload.name || email.split('@')[0] },
        });
        void this.analytics.track('signup', { userId: user.id, props: { method: 'google' }, dedupeKey: 'signup' });
      }
    }
    return this.issue(user.id, user.email);
  }

  /** Dùng cho socket.io: trả về userId nếu token hợp lệ */
  verify(token: string): string | null {
    try {
      return this.jwt.verify<{ sub: string }>(token).sub;
    } catch {
      return null;
    }
  }

  async me(userId: string): Promise<Me> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true } });
    return toMe(user);
  }

  private issue(id: string, email: string): AuthToken {
    return { token: this.jwt.sign({ sub: id, email }) };
  }
}
