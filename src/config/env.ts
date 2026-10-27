import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),

  // Gupshup WhatsApp API (proveedor activo)
  GUPSHUP_API_KEY: z.string().min(1, 'GUPSHUP_API_KEY es requerido'),
  GUPSHUP_APP_NAME: z.string().min(1, 'GUPSHUP_APP_NAME es requerido (ej. SakuSOS)'),
  GUPSHUP_SOURCE_NUMBER: z.string().min(1, 'GUPSHUP_SOURCE_NUMBER es requerido (ej. 51984424719)'),
  GUPSHUP_APP_ID: z.string().optional(),

  // Twilio WhatsApp API (legado, ya no se usa)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_WHATSAPP_NUMBER: z.string().optional(),

  // Meta / WhatsApp Cloud API (Opcionales, flujo previo)
  META_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_API_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),

  // Gemini (Google AI Studio) - motor conversacional activo (API gratuita, sin tarjeta)
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY es requerido (consíguelo gratis en aistudio.google.com)'),
  GEMINI_RISK_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_CHAT_MODEL: z.string().default('gemini-2.5-flash'),

  // Anthropic / Claude (legado - se usará si en el futuro se vuelve a Claude)
  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_RISK_MODEL: z.string().default('claude-3-5-haiku-20241022'),
  CLAUDE_CHAT_MODEL: z.string().default('claude-3-5-sonnet-20241022'),

  // PostgreSQL
  DATABASE_URL: z.string().optional(),
  PGHOST: z.string().default('localhost'),
  PGPORT: z.coerce.number().default(5432),
  PGUSER: z.string().default('postgres'),
  PGPASSWORD: z.string().default(''),
  PGDATABASE: z.string().default('whatsapp_bot'),

  // Redis (BullMQ)
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Error de validación en variables de entorno:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  // In development, we warn if dummy values are missing, or throw if required
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Variables de entorno inválidas o faltantes en producción');
  }
}

export const env = parsed.success
  ? parsed.data
  : (process.env as unknown as z.infer<typeof envSchema>);
