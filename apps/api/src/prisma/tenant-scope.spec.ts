import { scopeArgs, TenantScopeError } from './tenant-scope.js';

describe('aislamiento de tenant', () => {
  it('filtra las lecturas por tenant', () => {
    expect(scopeArgs('User', 'findMany', { where: { isActive: true } }, 't1')).toEqual({
      where: { isActive: true, tenantId: 't1' },
    });
    expect(scopeArgs('User', 'findMany', undefined, 't1')).toEqual({ where: { tenantId: 't1' } });
  });

  it('no deja que el llamador elija otro tenant', () => {
    const out = scopeArgs('User', 'findFirst', { where: { tenantId: 'otro' } }, 't1');
    expect(out.where.tenantId).toBe('t1');
    const created = scopeArgs('User', 'create', { data: { email: 'a@b.c', tenantId: 'otro' } }, 't1');
    expect(created.data.tenantId).toBe('t1');
  });

  it('acota búsquedas por id, actualizaciones y borrados', () => {
    for (const op of ['findUnique', 'update', 'delete', 'updateMany', 'deleteMany']) {
      expect(scopeArgs('User', op, { where: { id: 'u1' } }, 't1').where).toEqual({
        id: 'u1',
        tenantId: 't1',
      });
    }
  });

  it('asigna el tenant al crear, crear en lote y upsert', () => {
    expect(scopeArgs('AuditLog', 'createMany', { data: [{ action: 'a' }, { action: 'b' }] }, 't1').data).toEqual([
      { action: 'a', tenantId: 't1' },
      { action: 'b', tenantId: 't1' },
    ]);
    const up = scopeArgs('User', 'upsert', { where: { id: 'u1' }, create: { email: 'x' }, update: {} }, 't1');
    expect(up.where.tenantId).toBe('t1');
    expect(up.create.tenantId).toBe('t1');
  });

  it('rechaza consultas de empresa sin tenant', () => {
    expect(() => scopeArgs('User', 'findMany', {}, null)).toThrow(TenantScopeError);
    expect(() => scopeArgs('User', 'findMany', {}, undefined)).toThrow(TenantScopeError);
  });

  it('rechaza operaciones que no sabe aislar', () => {
    expect(() => scopeArgs('User', 'operacionNueva', {}, 't1')).toThrow(TenantScopeError);
  });

  it('no toca los modelos de plataforma', () => {
    expect(scopeArgs('Plan', 'findMany', { where: { isActive: true } }, null)).toEqual({
      where: { isActive: true },
    });
  });

  it('no modifica los argumentos originales', () => {
    const args = { where: { id: 'u1' } };
    scopeArgs('User', 'findFirst', args, 't1');
    expect(args).toEqual({ where: { id: 'u1' } });
  });
});
