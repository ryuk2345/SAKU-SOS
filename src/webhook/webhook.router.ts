import { Router } from 'express';
import { webhookController } from './webhook.controller.js';

export const webhookRouter = Router();

// Verificación del webhook requerida por Meta
webhookRouter.get('/', webhookController.verify);

// Recepción de mensajes entrantes y eventos de WhatsApp
webhookRouter.post('/', webhookController.handleIncoming);
