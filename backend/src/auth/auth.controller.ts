import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import type { AuthConfig, AuthToken, Me } from '@dautu/contracts';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import type { AuthUser } from './current-user.decorator';
import { GoogleLoginDto, LoginDto, RegisterDto } from './dto/auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto): Promise<AuthToken> {
    return this.auth.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto): Promise<AuthToken> {
    return this.auth.login(dto);
  }

  @Post('google')
  google(@Body() dto: GoogleLoginDto): Promise<AuthToken> {
    return this.auth.loginWithGoogle(dto.credential);
  }

  /** Cấu hình công khai cho trang đăng nhập (frontend chỉ hiện nút Google khi có client id) */
  @Get('config')
  config(): AuthConfig {
    return { googleClientId: this.auth.googleClientId };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<Me> {
    return this.auth.me(user.id);
  }
}
