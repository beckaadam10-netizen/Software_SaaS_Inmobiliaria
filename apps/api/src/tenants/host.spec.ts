import { tenantSlugFromHost } from './host.js';

describe('tenantSlugFromHost', () => {
  const d = 'softinmo.com';
  it('resuelve empresas por subdominio', () => {
    expect(tenantSlugFromHost('abc.softinmo.com', d)).toBe('abc');
    expect(tenantSlugFromHost('ABC.localhost:3000', d)).toBe('abc');
  });
  it('trata admin y el dominio raíz como plataforma', () => {
    expect(tenantSlugFromHost('admin.softinmo.com', d)).toBeNull();
    expect(tenantSlugFromHost('admin.localhost:3000', d)).toBeNull();
    expect(tenantSlugFromHost('localhost:3001', d)).toBeNull();
    expect(tenantSlugFromHost('softinmo.com', d)).toBeNull();
  });
  it('rechaza hosts ajenos o mal formados', () => {
    expect(tenantSlugFromHost('abc.otro.com', d)).toBeUndefined();
    expect(tenantSlugFromHost('a.b.softinmo.com', d)).toBeUndefined();
    expect(tenantSlugFromHost('-x.softinmo.com', d)).toBeUndefined();
    expect(tenantSlugFromHost(undefined, d)).toBeUndefined();
  });
});
