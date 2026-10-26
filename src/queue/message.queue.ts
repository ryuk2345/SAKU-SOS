import { Queue } from 'bullmq';
import { redisConnectionOptions } from './connection.js';
import { logger } from '../utils/logger.js';

export const QUEUE_NAME = 'whatsapp-incoming-messages';

export interface IncomingMessageJobData {
  wa_id: string;              // Número de teléfono de WhatsApp del remitente
  sender_name: string;        // Nombre del perfil
  message_text: string;       // Texto recibido
  wa_message_id: string;      // ID único del mensaje de WhatsApp (wamid...)
  timestamp: number;          // Timestamp epoch del mensaje
}

export const messageQueue = new Queue<IncomingMessageJobData>(QUEUE_NAME, {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1500,
    },
    removeOnComplete: 100, // Conservar los últimos 100 jobs completados
    removeOnFail: 500,     // Conservar los últimos 500 jobs fallidos para auditoría
  },
});

/**
 * Encola un mensaje entrante de WhatsApp para procesamiento asíncrono.
 */
export async function enqueueIncomingMessage(data: IncomingMessageJobData): Promise<string> {
  // Usamos wa_message_id como jobId para prevenir duplicados en la cola
  const job = await messageQueue.add('process-message', data, {
    jobId: data.wa_message_id,
  });

  logger.info('Queue', `Mensaje ${data.wa_message_id} de ${data.wa_id} encolado exitosamente (Job ID: ${job.id})`);
  return job.id!;
}
