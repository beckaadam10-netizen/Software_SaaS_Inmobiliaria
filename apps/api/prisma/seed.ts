/**
 * Datos iniciales: los cuatro planes, un superadmin y una empresa de demostración.
 * Ejecutar con: pnpm db:seed   (se puede repetir sin duplicar datos)
 */
import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Falta DATABASE_URL en el archivo .env');

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });

const plans = [
  {
    code: 'inicio',
    name: 'Inicio',
    priceMonthly: 149,
    sortOrder: 1,
    limits: { agents: 2, properties: 30, contacts: 100, aiRequests: 0 },
    features: ['crm', 'commercial', 'public_portal', 'leads', 'visits', 'whatsapp_basic', 'qr', 'finance_basic', 'commissions', 'branding_basic'],
  },
  {
    code: 'profesional',
    name: 'Profesional',
    priceMonthly: 299,
    sortOrder: 2,
    limits: { agents: 5, properties: 150, contacts: 1000, aiRequests: 200 },
    features: ['crm', 'commercial', 'public_portal', 'leads', 'visits', 'marketing', 'matching', 'whatsapp', 'qr', 'analytics_advanced', 'ai_basic', 'finance_full', 'commissions', 'settlements', 'receivables', 'payables', 'cash_flow', 'subdomain', 'priority_support'],
  },
  {
    code: 'empresa',
    name: 'Empresa',
    priceMonthly: 599,
    sortOrder: 3,
    limits: { agents: 15, properties: 500, contacts: 5000, aiRequests: 1000 },
    features: ['crm', 'commercial', 'public_portal', 'leads', 'visits', 'marketing', 'marketing_advanced', 'matching', 'whatsapp', 'qr', 'analytics_advanced', 'ai_advanced', 'finance_full', 'commissions', 'settlements', 'receivables', 'payables', 'cash_flow', 'subdomain', 'owner_portal', 'audit_advanced', 'custom_domain', 'white_label', 'multi_branch', 'legal_signatures'],
  },
  {
    code: 'corporativo',
    name: 'Corporativo',
    priceMonthly: 1199,
    sortOrder: 4,
    // null = límite personalizado, se define por empresa
    limits: { agents: 30, properties: null, contacts: null, aiRequests: 5000 },
    features: ['crm', 'commercial', 'public_portal', 'leads', 'visits', 'marketing', 'marketing_advanced', 'matching', 'whatsapp', 'qr', 'analytics_advanced', 'ai_advanced', 'finance_advanced', 'commissions', 'settlements', 'receivables', 'payables', 'cash_flow', 'subdomain', 'owner_portal', 'audit_advanced', 'custom_domain', 'white_label', 'multi_branch', 'legal_signatures', 'integrations', 'accounting', 'invoicing', 'bank_reconciliation', 'custom_reports', 'premium_support'],
  },
];

async function upsertUser(tenantId: string | null, email: string, fullName: string, role: 'SUPERADMIN' | 'ADMIN', password: string) {
  const existing = await prisma.user.findFirst({ where: { tenantId, email } });
  if (existing) return false;
  await prisma.user.create({
    data: { tenantId, email, fullName, role, passwordHash: await bcrypt.hash(password, 12) },
  });
  return true;
}

async function main() {
  for (const plan of plans) {
    const { code, ...data } = plan;
    await prisma.plan.upsert({ where: { code }, create: { code, ...data }, update: {} });
  }

  // La empresa de demostración usa el plan Corporativo para mostrar todos los módulos.
  const profesional = await prisma.plan.findUniqueOrThrow({ where: { code: 'corporativo' } });
  const demo = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    create: { slug: 'demo', name: 'Inmobiliaria Demo', planId: profesional.id },
    update: {},
  });

  if (!(await prisma.subscription.findFirst({ where: { tenantId: demo.id } }))) {
    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + 30);
    await prisma.subscription.create({
      data: { tenantId: demo.id, planId: profesional.id, status: 'TRIAL', currentPeriodStart: start, currentPeriodEnd: end },
    });
  }

  const superPass = process.env.SEED_SUPERADMIN_PASSWORD ?? 'Cambiar123!';
  const adminPass = process.env.SEED_DEMO_PASSWORD ?? 'Cambiar123!';
  const a = await upsertUser(null, 'superadmin@softinmo.com', 'Superadmin', 'SUPERADMIN', superPass);
  const b = await upsertUser(demo.id, 'admin@demo.com', 'Administrador Demo', 'ADMIN', adminPass);

  console.log('Planes: inicio, profesional, empresa, corporativo');
  console.log(`Superadmin: superadmin@softinmo.com ${a ? '(creado)' : '(ya existía)'}  ->  http://admin.localhost:3000`);
  console.log(`Empresa demo: admin@demo.com ${b ? '(creado)' : '(ya existía)'}  ->  http://demo.localhost:3000`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
