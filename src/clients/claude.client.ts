import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { buildRiskEvaluationPrompt, RiskLevel } from '../prompts/risk.prompt.js';
import { buildChatSystemPrompt } from '../prompts/chat.prompt.js';

export { RiskLevel };

export interface RiskClassificationResult {
  risk_level: RiskLevel;
  reasoning: string;
}

export interface ChatMessageParam {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerateChatResponseParams {
  riskLevel: RiskLevel;
  history: ChatMessageParam[];
  userMessage: string;
}

const anthropic = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
});

export const claudeClient = {
  /**
   * Paso 3a: Clasifica el nivel de riesgo del mensaje usando Claude Haiku.
   */
  async classifyRisk(userMessage: string): Promise<RiskClassificationResult> {
    logger.info('ClaudeClient:Risk', `Clasificando riesgo con modelo ${env.CLAUDE_RISK_MODEL}...`);

    try {
      const response = await anthropic.messages.create({
        model: env.CLAUDE_RISK_MODEL,
        max_tokens: 150,
        temperature: 0.0, // Consistencia máxima para clasificación
        messages: [
          {
            role: 'user',
            content: buildRiskEvaluationPrompt(userMessage),
          },
        ],
      });

      const textBlock = response.content.find((block) => block.type === 'text');
      const rawText = textBlock && 'text' in textBlock ? textBlock.text.trim() : '';

      // Limpiar posibles bloques de código markdown ```json ... ```
      const cleanedJson = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();

      try {
        const parsed = JSON.parse(cleanedJson);
        const validLevels: RiskLevel[] = ['alto', 'moderado', 'sin_riesgo'];
        const risk_level: RiskLevel = validLevels.includes(parsed.risk_level)
          ? parsed.risk_level
          : 'moderado'; // Si no coincide exactamente, asumimos moderado por precaución

        logger.info(
          'ClaudeClient:Risk',
          `Resultado de riesgo: [${risk_level.toUpperCase()}]`
        );

        return {
          risk_level,
          reasoning: parsed.reasoning || `Clasificado automáticamente como ${risk_level}`,
        };
      } catch (jsonErr) {
        logger.warn(
          'ClaudeClient:Risk',
          `Fallo al parsear JSON del clasificador. Salida cruda: "${rawText}". Asignando riesgo 'moderado' por precaución.`
        );
        return {
          risk_level: 'moderado',
          reasoning: `Error parseando respuesta del clasificador: ${rawText.slice(0, 100)}`,
        };
      }
    } catch (error) {
      logger.error('ClaudeClient:Risk', 'Error llamando a Anthropic para clasificación de riesgo', error);
      // En caso de fallo de red/API, se clasifica como 'moderado' por salvaguarda
      return {
        risk_level: 'moderado',
        reasoning: 'Fallback por error de conexión con API de clasificación',
      };
    }
  },

  /**
   * Paso 3c: Genera la respuesta conversacional con el system prompt de Saku,
   * inyectando el risk_level y el historial de la conversación.
   */
  async generateChatResponse(params: GenerateChatResponseParams): Promise<string> {
    const { riskLevel, history, userMessage } = params;
    logger.info(
      'ClaudeClient:Chat',
      `Generando respuesta con modelo ${env.CLAUDE_CHAT_MODEL} (Riesgo: ${riskLevel}, Historial: ${history.length} mensajes)...`
    );

    const systemPrompt = buildChatSystemPrompt(riskLevel);

    // Formatear mensajes asegurando formato compatible con la API de Anthropic
    const formattedMessages: Anthropic.MessageParam[] = [];

    for (const item of history) {
      if (!item.content || !item.content.trim()) continue;

      const lastMsg = formattedMessages[formattedMessages.length - 1];
      if (lastMsg && lastMsg.role === item.role) {
        lastMsg.content = `${lastMsg.content}\n\n${item.content}`;
      } else {
        formattedMessages.push({
          role: item.role,
          content: item.content,
        });
      }
    }

    // Agregar el mensaje actual del usuario al final
    const lastMsg = formattedMessages[formattedMessages.length - 1];
    if (lastMsg && lastMsg.role === 'user') {
      lastMsg.content = `${lastMsg.content}\n\n${userMessage}`;
    } else {
      formattedMessages.push({
        role: 'user',
        content: userMessage,
      });
    }

    try {
      const response = await anthropic.messages.create({
        model: env.CLAUDE_CHAT_MODEL,
        max_tokens: 1024,
        temperature: 0.7,
        system: systemPrompt,
        messages: formattedMessages,
      });

      const textBlock = response.content.find((block) => block.type === 'text');
      const botResponse = textBlock && 'text' in textBlock ? textBlock.text.trim() : '';

      logger.info('ClaudeClient:Chat', `Respuesta generada con éxito (${botResponse.length} caracteres)`);
      return botResponse;
    } catch (error) {
      logger.error('ClaudeClient:Chat', 'Error al llamar a Anthropic para generar respuesta', error);
      throw error;
    }
  },
};
