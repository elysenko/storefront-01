import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AuthUser } from '../common/api-role';

/**
 * Populates `request.user` when a valid token is supplied and stays silent
 * otherwise — public catalog routes must render for signed-out visitors.
 */
@Injectable()
export class OptionalJwtGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      await super.canActivate(context);
    } catch {
      // An absent or invalid token simply means "anonymous" here.
    }
    return true;
  }

  handleRequest<TUser = AuthUser>(_err: unknown, user: TUser | false): TUser {
    return (user || undefined) as TUser;
  }
}
