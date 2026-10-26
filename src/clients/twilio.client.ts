import twilio from 'twilio';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface SendWhatsAppMessageParams {
  to: string; // Puede ser 'whatsapp:+51999999999' o '+51999999999'
  text: string;
}

export interface TwilioSendResult {
  sid: string;
  status: string;
  to: string;
  from: string;
}

const client = twilio(env.TWILIO_ACCOUNT_SID!, env.TWILIO_AUTH_TOKEN!);

export const twilioClient = {
  /**
   * Envía un mensaje de texto al usuario a través de la API de Twilio Messages.
   */
  async sendMessage(params: SendWhatsAppMessageParams): Promise<TwilioSendResult> {
    const { to, text } = params;

    // Asegurar que 'to' y 'from' tengan el prefijo 'whatsapp:' requerido por Twilio
    const formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    const formattedFrom = env.TWILIO_WHATSAPP_NUMBER!.startsWith('whatsapp:')
      ? env.TWILIO_WHATSAPP_NUMBER!
      : `whatsapp:${env.TWILIO_WHATSAPP_NUMBER}`;

    logger.info('TwilioClient', `Enviando mensaje a ${formattedTo} desde ${formattedFrom} (${text.length} caracteres)...`);

    try {
      const message = await client.messages.create({
        body: text,
        from: formattedFrom,
        to: formattedTo,
      });

      logger.info('TwilioClient', `Mensaje enviado con éxito. SID: ${message.sid}, Estado: ${message.status}`);
      return {
        sid: message.sid,
        status: message.status,
        to: message.to,
        from: message.from,
      };
    } catch (error) {
      logger.error('TwilioClient', `Error al enviar mensaje vía Twilio a ${formattedTo}`, error);
      throw error;
    }
  },

  /**
   * Valida la firma X-Twilio-Signature para autenticar que la petición provenga de Twilio.
   */
  validateWebhookSignature(params: {
    signature?: string;
    url: string;
    body: Record<string, any>;
  }): boolean {
    const { signature, url, body } = params;

    if (!signature) {
      logger.warn('TwilioClient:Signature', 'Falta encabezado X-Twilio-Signature en la petición');
      return false;
    }

    try {
      const isValid = twilio.validateRequest(env.TWILIO_AUTH_TOKEN!, signature, url, body);
      if (!isValid) {
        logger.warn('TwilioClient:Signature', `Firma inválida para URL: ${url}`);
      }
      return isValid;
    } catch (error) {
      logger.error('TwilioClient:Signature', 'Error verificando la firma de Twilio', error);
      return false;
    }
  },
};
