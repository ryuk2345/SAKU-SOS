import express, { Express, Request, Response } from 'express';
import { webhookRouter } from './webhook/webhook.router.js';
import { logger } from './utils/logger.js';

export function createApp(): Express {
  const app = express();

  // Middleware para parsear JSON (Gupshup envía el webhook como JSON)
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // Logging básico de peticiones HTTP
  app.use((req, res, next) => {
    logger.debug('HTTP', `${req.method} ${req.url}`);
    next();
  });

  // Endpoint de salud
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
  });

  // Rutas del Webhook de WhatsApp
  app.use('/webhook', webhookRouter);

  // Manejador para rutas no encontradas
  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found' });
  });

  return app;
}
