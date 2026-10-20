import {
  Body,
  ConflictException,
  Controller,
  createParamDecorator,
  ExecutionContext,
  Get,
  Injectable,
  Module,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { AuthGuard, PassportModule, PassportStrategy } from '@nestjs/passport';
import * as bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.module';

export interface AuthUser {
  id: string;
  email: string;
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest().user,
);

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

@Injectable()
class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: { sub: string; email: string }): AuthUser {
    return { id: payload.sub, email: payload.email };
  }
}

class RegisterDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
  @IsString() @MinLength(1) name!: string;
}

class LoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}

class GoogleLoginDto {
  /** ID token (JWT) do Google Identity Services trả về cho frontend */
  @IsString() @MinLength(10) credential!: string;
}

@Injectable()
export class AuthService {
  private google: OAuth2Client | null;
  readonly googleClientId: string | null;

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    config: ConfigService,
  ) {
    this.googleClientId = config.get<string>('GOOGLE_CLIENT_ID') || null;
    this.google = this.googleClientId ? new OAuth2Client(this.googleClientId) : null;
  }

  async register(dto: RegisterDto) {
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
    return this.issue(user.id, user.email);
  }

  async login(dto: LoginDto) {
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
  async loginWithGoogle(credential: string) {
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
      user = byEmail
        ? await this.prisma.user.update({
            where: { id: byEmail.id },
            data: { googleId: payload.sub, avatarUrl: byEmail.avatarUrl ?? avatarUrl },
          })
        : await this.prisma.user.create({
            data: { email, googleId: payload.sub, avatarUrl, name: payload.name || email.split('@')[0] },
          });
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

  private issue(id: string, email: string) {
    return { token: this.jwt.sign({ sub: id, email }) };
  }
}

@Controller('auth')
class AuthController {
  constructor(
    private auth: AuthService,
    private prisma: PrismaService,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('google')
  google(@Body() dto: GoogleLoginDto) {
    return this.auth.loginWithGoogle(dto.credential);
  }

  /** Cấu hình công khai cho trang đăng nhập (frontend chỉ hiện nút Google khi có client id) */
  @Get('config')
  config() {
    return { googleClientId: this.auth.googleClientId };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { profile: true },
    });
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      avatarUrl: u.avatarUrl,
      onboarded: !!u.profile,
      profile: u.profile,
    };
  }
}

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
