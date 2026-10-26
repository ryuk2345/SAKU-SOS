import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './index.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(): Promise<void> {
  const possiblePaths = [
    path.join(__dirname, 'schema.sql'),
    path.join(process.cwd(), 'src', 'db', 'schema.sql'),
    path.join(__dirname, '..', 'src', 'db', 'schema.sql'),
  ];

  const schemaPath = possiblePaths.find((p) => fs.existsSync(p));
  if (!schemaPath) {
    throw new Error(`No se pudo encontrar el archivo schema.sql en las rutas: ${possiblePaths.join(', ')}`);
  }

  logger.info('DB:Migrate', `Leyendo esquema SQL desde: ${schemaPath}`);

  try {
    const sql = fs.readFileSync(schemaPath, 'utf8');
    logger.info('DB:Migrate', 'Ejecutando script de creación de tablas...');
    await pool.query(sql);
    logger.info('DB:Migrate', '✅ Migraciones aplicadas con éxito.');
  } catch (error) {
    logger.error('DB:Migrate', '❌ Error al aplicar migraciones:', error);
    throw error;
  }
}

// Ejecución directa cuando se corre como script
if (process.argv[1] && process.argv[1].endsWith('migrate.ts')) {
  runMigrations()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async () => {
      await pool.end();
      process.exit(1);
    });
}
