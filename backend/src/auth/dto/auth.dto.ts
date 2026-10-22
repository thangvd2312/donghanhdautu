import type { GoogleLoginRequest, LoginRequest, RegisterRequest } from '@dautu/contracts';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto implements RegisterRequest {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
  @IsString() @MinLength(1) name!: string;
}

export class LoginDto implements LoginRequest {
  @IsEmail() email!: string;
  @IsString() password!: string;
}

export class GoogleLoginDto implements GoogleLoginRequest {
  /** ID token (JWT) do Google Identity Services trả về cho frontend */
  @IsString() @MinLength(10) credential!: string;
}
