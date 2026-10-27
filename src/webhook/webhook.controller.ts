import { Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import { enqueueIncomingMessage } from '../queue/message.queue.js';
import { GupshupWebhookBody } from './webhook.types.js';

export const webhookController = {
  /**
   * Endpoint GET /webhook
   * Útil para health-check o verificación rápida en navegadores.
   */
  verify(req: Request, res: Response): void {
    res.status(200).json({ status: 'ok', service: 'Saku WhatsApp Webhook (Gupshup)' });
  },

  /**
   * Endpoint POST /webhook (Gupshup Webhook, formato nativo v2)
   * 1. Responde 200 de inmediato (Gupshup solo necesita un ack rápido).
   * 2. Si es un mensaje de texto entrante, lo encola en BullMQ para procesamiento asíncrono.
   *
   * Nota: Gupshup también envía eventos de estado (enqueued, sent, delivered, read, failed)
   * con type distinto a "message" — esos se ignoran aquí.
   */
  async handleIncoming(req: Request, res: Response): Promise<void> {
    // 1. Responder 200 de inmediato
    res.status(200).json({ status: 'ok' });

    // 2. Procesar el payload
    try {
      const body = req.body as GupshupWebhookBody;

      if (!body || body.type !== 'message') {
        // Log completo (línea única) para poder ver detalle de eventos de estado
        // (sent/delivered/failed) mientras diagnosticamos entregas de WhatsApp.
        logger.info('Webhook:Gupshup', `Evento ignorado (type=${body?.type ?? 'desconocido'}): ${JSON.stringify(body)}`);
        return;
      }

      const msg = body.payload;
      if (!msg) {
        logger.debug('Webhook:Gupshup', 'Payload de mensaje vacío, omitiendo.');
        return;
      }

      // Preferimos el teléfono real; si el usuario adoptó un username de WhatsApp y Gupshup no
      // tiene su número, cae al BSUID (sender.userId, ej. "PE.139...") como identificador.
      const sender = msg.sender?.phone || msg.source || msg.sender?.userId;
      const senderName = msg.sender?.name || msg.sender?.username || '';
      const messageSid = msg.id;

      if (!sender || !messageSid) {
        logger.debug('Webhook:Gupshup', 'Payload recibido sin remitente o id, omitiendo encolado.', body);
        return;
      }

      // Solo manejamos texto por ahora; stickers/imágenes/audio se ignoran (type !== 'text')
      if (msg.type !== 'text') {
        logger.info('Webhook:Gupshup', `Mensaje ${messageSid} de ${sender} recibido con type="${msg.type}" (no es texto), omitiendo.`);
        return;
      }

      const messageText = (msg.payload as { text?: string })?.text?.trim() || '';

      if (!messageText) {
        logger.info('Webhook:Gupshup', `Mensaje ${messageSid} de ${sender} recibido sin texto.`);
        return;
      }

      logger.info(
        'Webhook:Gupshup',
        `Mensaje entrante de ${sender} (${senderName || 'Sin nombre'}): "${messageText.slice(0, 40)}..."`
      );

      // Encolar en BullMQ
      await enqueueIncomingMessage({
        wa_id: sender,
        sender_name: senderName,
        message_text: messageText,
        wa_message_id: messageSid,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Webhook:Gupshup', 'Error al procesar mensaje entrante de Gupshup', error);
    }
  },
};
