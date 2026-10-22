import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Identity attached to the request by the JWT strategy. */
export interface AuthUser {
  id: string;
  email: string;
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest<{ user: AuthUser }>().user,
);
