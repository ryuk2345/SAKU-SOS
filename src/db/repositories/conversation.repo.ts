import { query } from '../index.js';

export interface ConversationMessage {
  id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  wa_message_id: string | null;
  risk_level: 'alto' | 'moderado' | 'sin_riesgo' | 'bajo' | null;
  created_at: Date;
}

export const conversationRepo = {
  /**
   * Guarda un mensaje de usuario o del asistente en la tabla conversaciones.
   */
  async saveMessage(params: {
    userId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    waMessageId?: string;
    riskLevel?: 'alto' | 'moderado' | 'sin_riesgo' | 'bajo' | null;
  }): Promise<ConversationMessage> {
    const text = `
      INSERT INTO conversaciones (user_id, role, content, wa_message_id, risk_level)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const res = await query<ConversationMessage>(text, [
      params.userId,
      params.role,
      params.content,
      params.waMessageId || null,
      params.riskLevel || null,
    ]);
    return res.rows[0];
  },

  /**
   * Obtiene los últimos N mensajes de la conversación ordenados cronológicamente (antiguos primero).
   */
  async getRecentHistory(userId: string, limit: number = 10): Promise<ConversationMessage[]> {
    const text = `
      SELECT * FROM (
        SELECT * FROM conversaciones
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      ) sub
      ORDER BY created_at ASC;
    `;
    const res = await query<ConversationMessage>(text, [userId, limit]);
    return res.rows;
  },

  /**
   * Verifica si un mensaje de WhatsApp ya fue procesado (idempotencia).
   */
  async existsByWaMessageId(waMessageId: string): Promise<boolean> {
    const res = await query(
      'SELECT 1 FROM conversaciones WHERE wa_message_id = $1 LIMIT 1',
      [waMessageId]
    );
    return (res.rowCount ?? 0) > 0;
  },
};
