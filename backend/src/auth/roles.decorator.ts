import { SetMetadata } from '@nestjs/common';
import type { ApiRole } from '../common/api-role';

export const ROLES_KEY = 'roles';

/** Restrict a controller or handler to the listed API roles. */
export const Roles = (...roles: ApiRole[]) => SetMetadata(ROLES_KEY, roles);
