import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../generated/prisma/enums.js';

export const IS_PUBLIC = 'isPublic';
/** Ruta accesible sin iniciar sesión. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES = 'roles';
/** Restringe la ruta a los roles indicados. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES, roles);
