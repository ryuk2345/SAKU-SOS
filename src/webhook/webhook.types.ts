/**
 * Definiciones de tipos para el formato del webhook de WhatsApp vía Gupshup.
 *
 * Gupshup puede enviar los webhooks en su formato nativo ("Gupshup format v2").
 * Esta es la forma documentada y estable; es la que usamos aquí.
 * Doc: https://docs.gupshup.io/docs/inbound-messages
 */

export interface GupshupSender {
  phone: string; // Ej: "51984424719" (sin '+', sin prefijo whatsapp:)
  name?: string;
  country_code?: string;
  dial_code?: string;
}

export interface GupshupTextPayload {
  text: string;
}

export interface GupshupMessagePayload {
  id: string; // ID único del mensaje de WhatsApp
  source: string; // Teléfono del remitente (E.164 sin '+')
  type: string; // "text" | "image" | "file" | "audio" | "video" | "button_reply" | "list_reply" | ...
  payload: GupshupTextPayload | Record<string, any>;
  sender: GupshupSender;
  context?: {
    id: string;
    gsId: string;
  };
}

export interface GupshupWebhookBody {
  app: string;
  timestamp: number;
  version: number;
  type: string; // "message" para mensajes entrantes; otros valores son eventos de estado (delivered, read, etc.)
  payload: GupshupMessagePayload;
}

/**
 * Tipos legados (Twilio). Conservados temporalmente por referencia;
 * ya no se usan en el controller tras la migración a Gupshup.
 */
export interface TwilioWebhookBody {
  From: string;
  To: string;
  Body?: string;
  MessageSid: string;
  SmsMessageSid?: string;
  SmsSid?: string;
  AccountSid: string;
  ProfileName?: string;
  WaId?: string;
  NumMedia?: string;
  [key: string]: any;
}
