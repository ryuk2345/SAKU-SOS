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

/**
 * Cliente del motor conversacional.
 *
 * NOTA: originalmente llamaba a la API de Anthropic (Claude). Se migró a la API
 * gratuita de Gemini (Google AI Studio) porque el piloto todavía no tiene una
 * API key de pago de Anthropic. El nombre del archivo/export se mantiene
 * (`claudeClient`) para no tener que tocar el resto del código (worker, etc.).
 * Si en el futuro se vuelve a Anthropic, solo hay que reescribir este archivo.
 */

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiContent {
  role: 'user' | 'model';
  parts: { text: string }[];
}

async function callGemini(params: {
  model: string;
  contents: GeminiContent[];
  systemInstruction?: string;
  temperature: number;
  maxOutputTokens: number;
}): Promise<string> {
  const { model, contents, systemInstruction, temperature, maxOutputTokens } = params;

  const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${env.GEMINI_API_KEY}`;

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens,
    },
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = (await response.json().catch(() => ({}))) as any;

  if (!response.ok) {
    const message = data?.error?.message || JSON.stringify(data);
    throw new Error(`Gemini API error: HTTP ${response.status} - ${message}`);
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') {
    // Puede pasar si Gemini bloqueó la respuesta (finishReason SAFETY, etc.)
    const finishReason = data?.candidates?.[0]?.finishReason;
    throw new Error(`Gemini no devolvió texto. finishReason: ${finishReason || 'desconocido'}`);
  }

  return text.trim();
}

export const claudeClient = {
  /**
   * Paso 3a: Clasifica el nivel de riesgo del mensaje usando Gemini (modelo rápido/liviano).
   */
  async classifyRisk(userMessage: string): Promise<RiskClassificationResult> {
    logger.info('GeminiClient:Risk', `Clasificando riesgo con modelo ${env.GEMINI_RISK_MODEL}...`);

    try {
      const rawText = await callGemini({
        model: env.GEMINI_RISK_MODEL,
        contents: [{ role: 'user', parts: [{ text: buildRiskEvaluationPrompt(userMessage) }] }],
        temperature: 0.0,
        maxOutputTokens: 150,
      });

      // Limpiar posibles bloques de código markdown ```json ... ```
      const cleanedJson = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();

      try {
        const parsed = JSON.parse(cleanedJson);
        const validLevels: RiskLevel[] = ['alto', 'moderado', 'sin_riesgo'];
        const risk_level: RiskLevel = validLevels.includes(parsed.risk_level)
          ? parsed.risk_level
          : 'moderado'; // Si no coincide exactamente, asumimos moderado por precaución

        logger.info('GeminiClient:Risk', `Resultado de riesgo: [${risk_level.toUpperCase()}]`);

        return {
          risk_level,
          reasoning: parsed.reasoning || `Clasificado automáticamente como ${risk_level}`,
        };
      } catch (jsonErr) {
        logger.warn(
          'GeminiClient:Risk',
          `Fallo al parsear JSON del clasificador. Salida cruda: "${rawText}". Asignando riesgo 'moderado' por precaución.`
        );
        return {
          risk_level: 'moderado',
          reasoning: `Error parseando respuesta del clasificador: ${rawText.slice(0, 100)}`,
        };
      }
    } catch (error) {
      logger.error('GeminiClient:Risk', 'Error llamando a Gemini para clasificación de riesgo', error);
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
      'GeminiClient:Chat',
      `Generando respuesta con modelo ${env.GEMINI_CHAT_MODEL} (Riesgo: ${riskLevel}, Historial: ${history.length} mensajes)...`
    );

    const systemPrompt = buildChatSystemPrompt(riskLevel);

    // Formatear mensajes al formato de Gemini (role 'model' en vez de 'assistant')
    const formattedContents: GeminiContent[] = [];

    for (const item of history) {
      if (!item.content || !item.content.trim()) continue;
      const geminiRole: 'user' | 'model' = item.role === 'assistant' ? 'model' : 'user';

      const last = formattedContents[formattedContents.length - 1];
      if (last && last.role === geminiRole) {
        last.parts[0].text = `${last.parts[0].text}\n\n${item.content}`;
      } else {
        formattedContents.push({ role: geminiRole, parts: [{ text: item.content }] });
      }
    }

    // Agregar el mensaje actual del usuario al final
    const last = formattedContents[formattedContents.length - 1];
    if (last && last.role === 'user') {
      last.parts[0].text = `${last.parts[0].text}\n\n${userMessage}`;
    } else {
      formattedContents.push({ role: 'user', parts: [{ text: userMessage }] });
    }

    try {
      const botResponse = await callGemini({
        model: env.GEMINI_CHAT_MODEL,
        contents: formattedContents,
        systemInstruction: systemPrompt,
        temperature: 0.7,
        maxOutputTokens: 1024,
      });

      logger.info('GeminiClient:Chat', `Respuesta generada con éxito (${botResponse.length} caracteres)`);
      return botResponse;
    } catch (error) {
      logger.error('GeminiClient:Chat', 'Error al llamar a Gemini para generar respuesta', error);
      throw error;
    }
  },
};
