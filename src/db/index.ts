import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

export const pool = new Pool(
  env.DATABASE_URL
    ? { connectionString: env.DATABASE_URL }
    : {
        host: env.PGHOST,
        port: env.PGPORT,
        user: env.PGUSER,
        password: env.PGPASSWORD,
        database: env.PGDATABASE,
      }
);

pool.on('error', (err) => {
  logger.error('PostgreSQL', 'Error inesperado en el cliente inactivo de Postgres', err);
});

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  try {
    const res = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    logger.debug('PostgreSQL', `Query ejecutada en ${duration}ms`, { text, rows: res.rowCount });
    return res;
  } catch (error) {
    logger.error('PostgreSQL', `Error ejecutando query: ${text}`, error);
    throw error;
  }
}
