import { createApp } from './app.js';
import { env } from './config/env.js';
import { createMessageWorker } from './worker/message.worker.js';
import { pool } from './db/index.js';
import { logger } from './utils/logger.js';

async function bootstrap(): Promise<void> {
  const app = createApp();

  // 1. Iniciar el servidor Express
  const server = app.listen(env.PORT, () => {
    logger.info('Server', `🚀 Servidor Express iniciado y escuchando en http://localhost:${env.PORT}`);
    logger.info('Server', `🔗 Webhook URL: http://localhost:${env.PORT}/webhook`);
  });

  // 2. Iniciar el Worker de BullMQ
  const worker = createMessageWorker();

  // 3. Manejo de apagado elegante (Graceful Shutdown)
  const shutdown = async (signal: string) => {
    logger.info('Server', `Recibida señal ${signal}. Cerrando servicios con elegancia...`);

    // Detener aceptación de nuevas peticiones HTTP
    server.close(() => {
      logger.info('Server', 'Servidor HTTP Express cerrado.');
    });

    try {
      // Pausar y cerrar worker de BullMQ
      logger.info('Worker', 'Cerrando worker de BullMQ...');
      await worker.close();

      // Cerrar pool de base de datos
      logger.info('PostgreSQL', 'Cerrando pool de conexiones PostgreSQL...');
      await pool.end();

      logger.info('Server', '✅ Todos los servicios cerrados limpiamente. Saliendo del proceso.');
      process.exit(0);
    } catch (err) {
      logger.error('Server', 'Error durante el apagado elegante', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error('Bootstrap', 'Error fatal al iniciar la aplicación', err);
  process.exit(1);
});
