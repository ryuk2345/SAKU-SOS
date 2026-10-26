import { query } from '../index.js';

export interface User {
  id: string;
  wa_id: string;
  name: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ConversationState {
  id: string;
  user_id: string;
  status: string;
  last_risk_level: 'alto' | 'moderado' | 'sin_riesgo' | 'bajo';
  context_data: Record<string, any>;
  updated_at: Date;
}

export const userRepo = {
  /**
   * Obtiene o crea un usuario por su número de WhatsApp (wa_id)
   * e inicializa su estado_conversacion si no existe.
   */
  async upsertUser(waId: string, name?: string): Promise<User> {
    const userQuery = `
      INSERT INTO usuarios (wa_id, name, updated_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (wa_id)
      DO UPDATE SET
        name = COALESCE(EXCLUDED.name, usuarios.name),
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    const result = await query<User>(userQuery, [waId, name || null]);
    const user = result.rows[0];

    // Asegurar que existe un registro de estado_conversacion para este usuario
    const stateQuery = `
      INSERT INTO estado_conversacion (user_id, status, last_risk_level, context_data, updated_at)
      VALUES ($1, 'activo', 'sin_riesgo', '{}'::jsonb, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id) DO NOTHING;
    `;
    await query(stateQuery, [user.id]);

    return user;
  },

  async getUserByWaId(waId: string): Promise<User | null> {
    const res = await query<User>('SELECT * FROM usuarios WHERE wa_id = $1 LIMIT 1', [waId]);
    return res.rows[0] || null;
  },

  async updateConversationState(
    userId: string,
    updates: {
      status?: string;
      last_risk_level?: 'alto' | 'moderado' | 'sin_riesgo' | 'bajo';
      context_data?: Record<string, any>;
    }
  ): Promise<ConversationState | null> {
    const res = await query<ConversationState>(
      `
      UPDATE estado_conversacion
      SET
        status = COALESCE($2, status),
        last_risk_level = COALESCE($3, last_risk_level),
        context_data = COALESCE($4, context_data),
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING *;
      `,
      [
        userId,
        updates.status || null,
        updates.last_risk_level || null,
        updates.context_data ? JSON.stringify(updates.context_data) : null,
      ]
    );
    return res.rows[0] || null;
  },

  async getConversationState(userId: string): Promise<ConversationState | null> {
    const res = await query<ConversationState>(
      'SELECT * FROM estado_conversacion WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    return res.rows[0] || null;
  },
};
