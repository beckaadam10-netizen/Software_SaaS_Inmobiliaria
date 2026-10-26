import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { avatarUrl } from '../users/avatar.js';
import { BRAND_SELECT, brandView } from '../company/brand-view.js';
import { requestContext } from '../common/request-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SessionPayload } from './auth.guard.js';

// Hash de relleno para que un email inexistente tarde lo mismo que uno real.
const DUMMY_HASH = bcrypt.hashSync('soft-inmo-dummy', 12);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const tenantId = requestContext.get()?.tenantId ?? null;

    // En el subdominio de una empresa solo entran sus usuarios;
    // en la zona de plataforma solo entran superadmins.
    const user = await this.prisma.platform.user.findFirst({
      where: tenantId
        ? { email, tenantId }
        : { email, tenantId: null, role: 'SUPERADMIN' },
    });

    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok || !user.isActive) {
      throw new UnauthorizedException('Email o contraseña incorrectos');
    }

    await this.prisma.platform.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload: SessionPayload = { sub: user.id, tenantId: user.tenantId, role: user.role };
    return { token: await this.jwt.signAsync(payload), user: this.toPublic(user) };
  }

  async me() {
    const ctx = requestContext.get();
    const user = await this.prisma.platform.user.findFirst({
      where: { id: ctx?.userId, tenantId: ctx?.tenantId ?? null, isActive: true },
      include: { tenant: { select: { ...BRAND_SELECT, plan: { select: { features: true } } } } },
    });
    if (!user) throw new UnauthorizedException('Sesión no válida');
    return { ...this.toPublic(user), avatar: avatarUrl(user), branchId: user.branchId, permissions: ctx?.permissions ?? [], tenant: user.tenant ? brandView(user.tenant) : null };
  }

  private toPublic(user: { id: string; email: string; fullName: string; role: string }) {
    return { id: user.id, email: user.email, fullName: user.fullName, role: user.role };
  }
}
