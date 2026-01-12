import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '../../user/entity/user.entity';

/**
 * Custom decorator to extract the authenticated user from the request.
 * The user is attached to the request by the JwtStrategy after JWT validation.
 *
 * @example
 * ```typescript
 * @Get('profile')
 * @UseGuards(AuthGuard())
 * async getProfile(@CurrentUser() user: User) {
 *   return user;
 * }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
