import { RedisOptions } from 'ioredis';
import { env } from '../config/env.js';

/**
 * Configuración de conexión para Redis requerida por BullMQ.
 * maxRetriesPerRequest DEBE ser null para evitar advertencias y errores en BullMQ.
 */
export const redisConnectionOptions: RedisOptions = env.REDIS_URL
  ? {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    }
  : {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
