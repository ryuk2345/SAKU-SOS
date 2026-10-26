import { gupshupClient, SendWhatsAppMessageParams, GupshupSendResult } from './gupshup.client.js';

/**
 * Cliente unificado de mensajería para WhatsApp.
 * Redirige al cliente de Gupshup.
 */
export const whatsappClient = {
  async sendTextMessage(params: { to: string; text: string }): Promise<{ messages: Array<{ id: string }> }> {
    const result = await gupshupClient.sendMessage(params);
    return {
      messages: [{ id: result.sid }],
    };
  },
};

export { gupshupClient, SendWhatsAppMessageParams, GupshupSendResult };
