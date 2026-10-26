import { query } from '../index.js';

export interface RiskFlag {
  id: string;
  user_id: string;
  conversation_id: string | null;
  risk_level: 'moderado' | 'alto';
  reasoning: string;
  status: 'pendiente' | 'en_revision' | 'atendido';
  created_at: Date;
}

export const riskFlagRepo = {
  /**
   * Crea una bandera de riesgo cuando el mensaje es clasificado con riesgo moderado o alto.
   */
  async createRiskFlag(params: {
    userId: string;
    conversationId?: string | null;
    riskLevel: 'moderado' | 'alto';
    reasoning: string;
  }): Promise<RiskFlag> {
    const text = `
      INSERT INTO banderas_riesgo (user_id, conversation_id, risk_level, reasoning, status)
      VALUES ($1, $2, $3, $4, 'pendiente')
      RETURNING *;
    `;
    const res = await query<RiskFlag>(text, [
      params.userId,
      params.conversationId || null,
      params.riskLevel,
      params.reasoning,
    ]);
    return res.rows[0];
  },

  async getPendingFlags(): Promise<RiskFlag[]> {
    const text = `
      SELECT * FROM banderas_riesgo
      WHERE status = 'pendiente'
      ORDER BY created_at DESC;
    `;
    const res = await query<RiskFlag>(text);
    return res.rows;
  },
};
