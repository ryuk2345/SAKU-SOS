import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface SendWhatsAppMessageParams {
  to: string; // Teléfono del destinatario. Puede venir como '+51999999999', 'whatsapp:+51999999999' o '51999999999'.
  text: string;
}

export interface GupshupSendResult {
  sid: string; // messageId devuelto por Gupshup
  status: string;
  to: string;
  from: string;
}

const GUPSHUP_SEND_URL = 'https://api.gupshup.io/wa/api/v1/msg';

/**
 * Normaliza un número de teléfono al formato que espera Gupshup:
 * solo dígitos, sin '+' ni prefijo 'whatsapp:'.
 */
function normalizePhone(phone: string): string {
  return phone.replace(/^whatsapp:/, '').replace(/[^0-9]/g, '');
}

/**
 * Un BSUID (Business-Scoped User ID) de WhatsApp tiene forma "XX.<dígitos>" (ej. "PE.139...").
 * Se usa como identificador cuando el usuario adoptó un username de WhatsApp y no compartió
 * su teléfono real. Doc: https://support.gupshup.io/hc/en-us/articles/55873677826713
 */
function isBsuid(id: string): boolean {
  return /^[A-Za-z]{2}\.\d+$/.test(id);
}

export const gupshupClient = {
  /**
   * Envía un mensaje de texto al usuario a través de la API de Gupshup.
   * Doc: https://docs.gupshup.io/reference/msg
   */
  async sendMessage(params: SendWhatsAppMessageParams): Promise<GupshupSendResult> {
    const { to, text } = params;

    const sendingToBsuid = isBsuid(to);
    const destination = sendingToBsuid ? '' : normalizePhone(to);
    const source = normalizePhone(env.GUPSHUP_SOURCE_NUMBER);

    logger.info(
      'GupshupClient',
      `Enviando mensaje a ${sendingToBsuid ? `BSUID ${to}` : destination} desde ${source} (${text.length} caracteres)...`
    );

    const body = new URLSearchParams();
    body.set('channel', 'whatsapp');
    body.set('source', source);
    if (sendingToBsuid) {
      // Usuario sin teléfono disponible (adoptó username de WhatsApp): se envía por BSUID.
      body.set('userId', to);
    } else {
      body.set('destination', destination);
    }
    body.set('src.name', env.GUPSHUP_APP_NAME);
    body.set('message', JSON.stringify({ type: 'text', text }));

    try {
      const response = await fetch(GUPSHUP_SEND_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          apikey: env.GUPSHUP_API_KEY,
        },
        body,
      });

      const data = (await response.json().catch(() => ({}))) as {
        status?: string;
        messageId?: string;
        message?: string;
      };

      if (!response.ok || data.status !== 'submitted') {
        logger.error(
          'GupshupClient',
          `Error al enviar mensaje vía Gupshup a ${sendingToBsuid ? to : destination}. HTTP ${response.status}. Respuesta: ${JSON.stringify(data)}`
        );
        throw new Error(`Gupshup send failed: HTTP ${response.status} - ${data.message || JSON.stringify(data)}`);
      }

      logger.info('GupshupClient', `Mensaje enviado con éxito. messageId: ${data.messageId}`);
      return {
        sid: data.messageId || '',
        status: data.status || 'submitted',
        to: sendingToBsuid ? to : destination,
        from: source,
      };
    } catch (error) {
      logger.error('GupshupClient', `Error al enviar mensaje vía Gupshup a ${sendingToBsuid ? to : destination}`, error);
      throw error;
    }
  },
};
