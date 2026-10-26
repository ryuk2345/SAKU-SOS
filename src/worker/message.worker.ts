import { Worker, Job } from 'bullmq';
import { QUEUE_NAME, IncomingMessageJobData } from '../queue/message.queue.js';
import { redisConnectionOptions } from '../queue/connection.js';
import { claudeClient, ChatMessageParam } from '../clients/claude.client.js';
import { whatsappClient } from '../clients/whatsapp.client.js';
import { userRepo } from '../db/repositories/user.repo.js';
import { conversationRepo } from '../db/repositories/conversation.repo.js';
import { riskFlagRepo } from '../db/repositories/risk-flag.repo.js';
import { logger } from '../utils/logger.js';

/**
 * Procesa un trabajo individual de mensaje entrante de WhatsApp cumpliendo los pasos 3a - 3e.
 */
export async function processIncomingMessageJob(job: Job<IncomingMessageJobData>): Promise<void> {
  const { wa_id, sender_name, message_text, wa_message_id } = job.data;
  const logPrefix = `Worker [Job ${job.id} | WA: ${wa_id}]`;

  logger.info(logPrefix, `Iniciando procesamiento de mensaje: "${message_text.slice(0, 60)}..."`);

  // Verificación de idempotencia para evitar procesar mensajes duplicados
  const alreadyProcessed = await conversationRepo.existsByWaMessageId(wa_message_id);
  if (alreadyProcessed) {
    logger.warn(logPrefix, `Mensaje ${wa_message_id} ya fue procesado previamente. Omitiendo.`);
    return;
  }

  // ---------------------------------------------------------------------------
  // PASO 3a: Clasificador de Riesgo (Claude Haiku)
  // ---------------------------------------------------------------------------
  logger.info(logPrefix, 'Paso 3a: Evaluando nivel de riesgo con Claude Haiku...');
  const riskResult = await claudeClient.classifyRisk(message_text);
  logger.info(
    logPrefix,
    `Paso 3a completado: Riesgo detectado = [${riskResult.risk_level.toUpperCase()}] (${riskResult.reasoning})`
  );

  // ---------------------------------------------------------------------------
  // PASO 3b: Guardar usuario, mensaje y estado en PostgreSQL
  // ---------------------------------------------------------------------------
  logger.info(logPrefix, 'Paso 3b: Persistiendo usuario, mensaje y estado en base de datos...');
  const user = await userRepo.upsertUser(wa_id, sender_name);

  const savedUserMessage = await conversationRepo.saveMessage({
    userId: user.id,
    role: 'user',
    content: message_text,
    waMessageId: wa_message_id,
    riskLevel: riskResult.risk_level,
  });

  await userRepo.updateConversationState(user.id, {
    last_risk_level: riskResult.risk_level,
    status: riskResult.risk_level === 'alto' ? 'en_crisis' : 'activo',
  });
  logger.info(logPrefix, `Paso 3b completado: Mensaje persistido con ID ${savedUserMessage.id}`);

  // ---------------------------------------------------------------------------
  // PASO 3e: Si el riesgo es "alto" o "moderado", crear fila en banderas_riesgo
  // ---------------------------------------------------------------------------
  if (riskResult.risk_level === 'alto' || riskResult.risk_level === 'moderado') {
    logger.warn(
      logPrefix,
      `Paso 3e: Creando bandera de riesgo [${riskResult.risk_level.toUpperCase()}] en banderas_riesgo...`
    );
    const flag = await riskFlagRepo.createRiskFlag({
      userId: user.id,
      conversationId: savedUserMessage.id,
      riskLevel: riskResult.risk_level,
      reasoning: riskResult.reasoning,
    });
    logger.info(logPrefix, `Paso 3e completado: Bandera de riesgo registrada con ID ${flag.id}`);
  }

  // ---------------------------------------------------------------------------
  // PASO 3c: Llamar al motor conversacional (Claude) con el risk_level e historial
  // ---------------------------------------------------------------------------
  logger.info(logPrefix, 'Paso 3c: Obteniendo historial y generando respuesta con Claude...');
  // Obtenemos los últimos 10 mensajes anteriores al actual para dar contexto
  const rawHistory = await conversationRepo.getRecentHistory(user.id, 11);
  // Excluimos el mensaje que acabamos de guardar para evitar duplicarlo en userMessage
  const previousHistory = rawHistory.filter((m) => m.id !== savedUserMessage.id);

  const formattedHistory: ChatMessageParam[] = previousHistory
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

  const botReplyText = await claudeClient.generateChatResponse({
    riskLevel: riskResult.risk_level,
    history: formattedHistory,
    userMessage: message_text,
  });
  logger.info(logPrefix, 'Paso 3c completado: Respuesta generada por Claude.');

  // ---------------------------------------------------------------------------
  // PASO 4: Verificación estricta de Protocolo de Crisis (Línea 113 opción 5)
  // Si el riesgo es "alto", la respuesta enviada DEBE incluir la Línea 113 opción 5.
  // Si el modelo no lo incluyó, se adjunta obligatoriamente por código.
  // ---------------------------------------------------------------------------
  let finalReplyText = botReplyText;
  if (riskResult.risk_level === 'alto') {
    const hasLine113 = /113/i.test(finalReplyText);
    if (!hasLine113) {
      logger.warn(
        logPrefix,
        '🚨 PROTOCOLO DE CRISIS: La respuesta no contiene la Línea 113. Adjuntando texto obligatorio por código...'
      );
      const MANDATORY_CRISIS_TEXT =
        '\n\nRecuerda que puedes comunicarte de inmediato y gratis a la Línea 113 opción 5 (Minsa, 24 horas). En caso de peligro inmediato, también puedes llamar al 105 (Policía) o 106 (SAMU). Un psicólogo de nuestro equipo te va a contactar pronto.';
      finalReplyText = `${finalReplyText.trim()}${MANDATORY_CRISIS_TEXT}`;
    } else {
      logger.info(logPrefix, 'Protocolo de crisis verificado: La respuesta incluye la Línea 113.');
    }
  }

  // ---------------------------------------------------------------------------
  // PASO 3d: Enviar la respuesta de vuelta al usuario vía WhatsApp (Gupshup)
  // ---------------------------------------------------------------------------
  logger.info(logPrefix, `Paso 3d: Enviando respuesta a WhatsApp ${wa_id}...`);
  const waResponse = await whatsappClient.sendTextMessage({
    to: wa_id,
    text: finalReplyText,
  });

  const assistantWaMsgId = waResponse.messages?.[0]?.id;
  // Guardamos la respuesta final del bot en la tabla de conversaciones para continuidad del historial
  await conversationRepo.saveMessage({
    userId: user.id,
    role: 'assistant',
    content: finalReplyText,
    waMessageId: assistantWaMsgId,
    riskLevel: null,
  });

  logger.info(logPrefix, `Paso 3d completado: Mensaje entregado a WhatsApp API (ID: ${assistantWaMsgId || 'N/A'})`);
}

/**
 * Crea e inicializa el worker de BullMQ.
 */
export function createMessageWorker(): Worker<IncomingMessageJobData> {
  const worker = new Worker<IncomingMessageJobData>(
    QUEUE_NAME,
    async (job) => {
      await processIncomingMessageJob(job);
    },
    {
      connection: redisConnectionOptions,
      concurrency: 5, // Número de mensajes concurrentes procesados
    }
  );

  worker.on('completed', (job) => {
    logger.info('Worker', `Job ${job.id} completado con éxito.`);
  });

  worker.on('failed', (job, err) => {
    logger.error('Worker', `Job ${job?.id} falló con error: ${err.message}`, err);
  });

  worker.on('error', (err) => {
    logger.error('Worker', 'Error interno en el worker de BullMQ', err);
  });

  logger.info('Worker', `Message Worker inicializado y escuchando en la cola "${QUEUE_NAME}"`);
  return worker;
}
