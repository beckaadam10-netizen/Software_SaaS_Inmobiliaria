import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { TenantScopeError } from '../prisma/tenant-scope.js';

/** Traduce errores conocidos a respuestas claras y evita filtrar detalles internos. */
@Catch()
export class ErrorsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException) {
      const body = error.getResponse();
      return res.status(error.getStatus()).json(typeof body === 'string' ? { message: body, statusCode: error.getStatus() } : body);
    }
    const code = (error as { code?: string })?.code;
    if (error instanceof TenantScopeError) {
      return res.status(403).json({ message: 'Esta sección pertenece al panel de una empresa', statusCode: 403 });
    }
    if (code === 'P2002') {
      return res.status(409).json({ message: 'Ya existe un registro con esos datos', statusCode: 409 });
    }
    if (code === 'P2025') {
      return res.status(404).json({ message: 'No se encontró el registro', statusCode: 404 });
    }
    if (code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ message: 'La imagen supera el tamaño máximo de 5 MB', statusCode: 413 });
    }
    this.logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    return res.status(500).json({ message: 'Error interno del servidor', statusCode: 500 });
  }
}
