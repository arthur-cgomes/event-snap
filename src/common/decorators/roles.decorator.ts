import { SetMetadata } from '@nestjs/common';
import { UserType } from '../enum/user-type.enum';

export const ROLES_KEY = 'roles';

/**
 * Decorator to specify which user types (roles) can access a route.
 * Must be used in combination with RolesGuard.
 *
 * @example
 * ```typescript
 * @Get('admin/users')
 * @Roles(UserType.ADMIN)
 * @UseGuards(AuthGuard(), RolesGuard)
 * async getAllUsers() {
 *   // Only accessible by ADMIN users
 * }
 * ```
 */
export const Roles = (...roles: UserType[]) => SetMetadata(ROLES_KEY, roles);
