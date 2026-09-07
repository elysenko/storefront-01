import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import type { ApiRole, AuthUser } from '../common/api-role';

const contextFor = (user?: AuthUser): ExecutionContext =>
  ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  const requireRoles = (roles: ApiRole[] | undefined): void => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles);
  };

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('lets an authenticated shopper through a route with no @Roles metadata', () => {
    requireRoles(undefined);
    expect(
      guard.canActivate(contextFor({ id: 'u1', email: 'a@example.test', role: 'shopper' })),
    ).toBe(true);
  });

  it('403s (not 401s) a signed-in shopper on an admin route', () => {
    requireRoles(['admin']);
    expect(() =>
      guard.canActivate(contextFor({ id: 'u1', email: 'a@example.test', role: 'shopper' })),
    ).toThrow(ForbiddenException);
  });

  it('lets an admin through an admin route', () => {
    requireRoles(['admin']);
    expect(
      guard.canActivate(contextFor({ id: 'a1', email: 'ops@example.test', role: 'admin' })),
    ).toBe(true);
  });

  it('403s when no user is attached at all', () => {
    requireRoles(['admin']);
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(ForbiddenException);
  });
});
