import { Body, Controller, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { Roles } from '../auth/auth.decorators.js';
import { validate } from '../common/validate.js';
import { AUTOMATIONS, AutomationsService } from './automations.service.js';

@Roles('ADMIN')
@Controller('automations')
export class AutomationsController {
  constructor(private readonly automations: AutomationsService) {}

  @Get()
  list() {
    return this.automations.settings();
  }

  @Patch(':key')
  async toggle(@Param('key') key: string, @Body() body: unknown) {
    const { enabled } = validate(z.object({ enabled: z.boolean() }), body);
    if (!AUTOMATIONS.some((a) => a.key === key)) throw new NotFoundException('Automatización no encontrada');
    await this.automations.setEnabled(key, enabled);
    return this.automations.settings();
  }

  /** Ejecuta ahora las automatizaciones diarias (las que aún no corrieron hoy). */
  @Post('run')
  run() {
    return this.automations.runDaily();
  }
}
