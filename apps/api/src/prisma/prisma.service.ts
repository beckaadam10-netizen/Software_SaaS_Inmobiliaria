import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client.js';
import { requestContext } from '../common/request-context.js';
import { scopeArgs } from './tenant-scope.js';

function createTenantClient(base: PrismaClient) {
  return base.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          const tenantId = requestContext.get()?.tenantId;
          return query(scopeArgs(model, operation, args as Record<string, any>, tenantId) as typeof args);
        },
      },
    },
  });
}

@Injectable()
export class PrismaService implements OnModuleDestroy {
  /**
   * Cliente SIN filtro de tenant. Solo para código de plataforma:
   * resolver la empresa por subdominio, login y módulos de superadmin.
   */
  readonly platform: PrismaClient;

  /**
   * Cliente de uso normal: aplica el tenant de la petición en cada consulta.
   * Las consultas de Prisma se ejecutan al hacer `await`, así que deben esperarse
   * dentro de la petición (o dentro de requestContext.run en tareas en segundo plano).
   */
  readonly db: ReturnType<typeof createTenantClient>;

  constructor(config: ConfigService) {
    const adapter = new PrismaMariaDb(config.getOrThrow<string>('DATABASE_URL'));
    this.platform = new PrismaClient({ adapter });
    this.db = createTenantClient(this.platform);
  }

  async onModuleDestroy() {
    await this.platform.$disconnect();
  }
}
