// Crea apps/api/.env con una clave de sesión aleatoria. Ejecutar: node scripts/setup-env.mjs
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';

const file = new URL('../.env', import.meta.url);
const force = process.argv.includes('--force');

if (existsSync(file) && !force) {
  const { readFileSync } = await import('node:fs');
  if (readFileSync(file, 'utf8').includes('JWT_SECRET=')) {
    console.log('.env ya está configurado. Usa --force para regenerarlo.');
    process.exit(0);
  }
}

writeFileSync(
  file,
  [
    '# Base de datos: MariaDB/MySQL de XAMPP (usuario root sin contraseña por defecto)',
    'DATABASE_URL="mysql://root@localhost:3306/soft_inmo"',
    '',
    '# Clave para firmar las sesiones. No la compartas ni la subas a Git.',
    `JWT_SECRET="${randomBytes(48).toString('base64url')}"`,
    '',
    '# Dominio base en producción (los subdominios son las empresas)',
    'APP_DOMAIN="softinmo.com"',
    '',
    'PORT=3001',
    '',
    '# Carpeta donde se guardan las fotos de las propiedades',
    'UPLOAD_DIR="uploads"',
    '',
  ].join('\n'),
);
console.log('Archivo .env creado.');
