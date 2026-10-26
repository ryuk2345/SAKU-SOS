export type RiskLevel = 'alto' | 'moderado' | 'sin_riesgo';

export const RISK_PROMPT_TEMPLATE = `Tu unica tarea es clasificar el nivel de riesgo del siguiente mensaje, escrito por una persona a un bot de apoyo emocional. No respondas al usuario, no des consejos, no agregues nada mas que el JSON pedido.

Clasifica en una de tres categorias:

- "alto": hay senales de intencion suicida activa, un plan, medios concretos, un intento en curso, o autolesion en curso.
- "moderado": hay desesperanza, mencion de autolesion pasada, o ideas de no querer seguir, pero sin plan concreto ni urgencia inmediata.
- "sin_riesgo": no hay senales de las dos categorias anteriores.

Ante la duda entre dos categorias, elige siempre la mas alta.

Responde solo con este JSON, sin texto adicional ni explicaciones:
{"risk_level": "alto" | "moderado" | "sin_riesgo"}

Mensaje del usuario:
{{mensaje}}`;

/**
 * Genera el prompt para Claude Haiku interpolando el mensaje del usuario.
 */
export function buildRiskEvaluationPrompt(userMessage: string): string {
  return RISK_PROMPT_TEMPLATE.replace('{{mensaje}}', userMessage);
}
