/**
 * Aislamiento de tenant.
 *
 * MySQL/MariaDB no tiene seguridad a nivel de fila, así que el filtro vive aquí:
 * toda consulta sobre un modelo de empresa recibe `tenantId` automáticamente.
 *
 * Alcance: cubre las operaciones de primer nivel. Las escrituras anidadas
 * (`create` dentro de `data` de otro modelo) NO se reescriben: en ellas hay que
 * pasar el tenantId explícitamente o crear los registros por separado.
 */

/** Modelos que pertenecen a una empresa. Agrega aquí cada modelo nuevo con tenantId. */
export const TENANT_MODELS: ReadonlySet<string> = new Set([
  'User',
  'Subscription',
  'AuditLog',
  'Contact',
  'Property',
  'PropertyImage',
  'PropertyPriceHistory',
  'Lead',
  'Visit',
  'CommercialCase',
  'CommercialStage',
  'Activity',
  'Offer',
  'Reservation',
  'Document',
  'PostSale',
  'Referral',
  'Favorite',
  'PropertyStat',
  'Publication',
  'Campaign',
  'MessageTemplate',
  'Notification',
  'Transaction',
  'Receivable',
  'Payable',
  'CommissionRule',
  'Commission',
  'Settlement',
  'SettlementAdjustment',
  'Task',
  'AutomationSetting',
  'AutomationRun',
  'AiUsage',
  'ApiKey',
  'Webhook',
  'WebhookDelivery',
  'Account',
  'JournalEntry',
  'JournalLine',
  'Invoice',
  'BankAccount',
  'BankLine',
  'Branch',
  'ExchangeRate',
  'PurchaseInvoice',
  'LegalItem',
  'SignatureRequest',
  'AccountingClosing',
]);

const WHERE_OPERATIONS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
]);

type Args = Record<string, any>;

export class TenantScopeError extends Error {}

/**
 * Devuelve los argumentos de la consulta con el tenantId aplicado.
 * Lanza error si la operación no se puede aislar: es preferible fallar a filtrar datos.
 */
export function scopeArgs(
  model: string,
  operation: string,
  args: Args | undefined,
  tenantId: string | null | undefined,
): Args {
  const input: Args = { ...(args ?? {}) };
  if (!TENANT_MODELS.has(model)) return input;

  if (!tenantId) {
    throw new TenantScopeError(
      `Consulta a ${model}.${operation} sin tenant. Usa PrismaService.platform solo en código de plataforma.`,
    );
  }

  if (WHERE_OPERATIONS.has(operation)) {
    input.where = { ...(input.where ?? {}), tenantId };
    return input;
  }

  switch (operation) {
    case 'create':
      input.data = { ...(input.data ?? {}), tenantId };
      return input;
    case 'createMany':
    case 'createManyAndReturn': {
      const rows = Array.isArray(input.data) ? input.data : [input.data];
      input.data = rows.map((row: Args) => ({ ...row, tenantId }));
      return input;
    }
    case 'upsert':
      input.where = { ...(input.where ?? {}), tenantId };
      input.create = { ...(input.create ?? {}), tenantId };
      return input;
    default:
      throw new TenantScopeError(
        `Operación ${model}.${operation} no soportada por el aislamiento de tenant.`,
      );
  }
}
