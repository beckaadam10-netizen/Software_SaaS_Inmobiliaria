import { BadRequestException, Body, Controller, Get, HttpCode, HttpException, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Public } from './auth.decorators.js';
import { AuthService } from './auth.service.js';
import { SESSION_COOKIE } from './cookies.js';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(200),
});

const SESSION_HOURS = 8;

/** Freno contra adivinar contraseñas: 8 intentos fallidos cada 15 minutos por email y dirección. */
const failures = new Map<string, number[]>();
const WINDOW = 15 * 60 * 1000, MAX_FAILURES = 8;
const recentFailures = (key: string) => (failures.get(key) ?? []).filter((t) => Date.now() - t < WINDOW);

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Email o contraseña con formato inválido');

    const key = `${req.headers['x-forwarded-host'] ?? req.headers.host}|${parsed.data.email}|${req.ip}`;
    if (recentFailures(key).length >= MAX_FAILURES) throw new HttpException('Demasiados intentos fallidos. Espera 15 minutos e intenta de nuevo.', 429);
    const { token, user } = await this.auth.login(parsed.data.email, parsed.data.password).catch((e) => {
      failures.set(key, [...recentFailures(key), Date.now()]);
      if (failures.size > 10000) for (const k of failures.keys()) if (!recentFailures(k).length) failures.delete(k);
      throw e;
    });
    failures.delete(key);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_HOURS * 60 * 60 * 1000,
    });
    return { user };
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  me() {
    return this.auth.me();
  }
}
