# Backend para Bot de WhatsApp de Apoyo Emocional

Esqueleto modular de backend en **TypeScript** (Node.js) diseñado para procesar mensajes entrantes de la **WhatsApp Cloud API** de Meta, evaluar el riesgo emocional con **Claude Haiku**, persistir usuarios, conversaciones y alertas en **PostgreSQL**, generar respuestas empáticas con **Claude** (modelo configurable) y enviar la respuesta al usuario a través de WhatsApp.

---

## 🏛️ Arquitectura del Sistema

```text
[WhatsApp User] 
       │
       ▼ (Mensaje entrante)
[WhatsApp Cloud API (Meta)]
       │
       ▼ (POST /webhook)
[Express Server] ──────> Responde 200 OK inmediatamente
       │
       ▼ (Encola job con jobId = wa_message_id)
[BullMQ (Redis)]
       │
       ▼ (Consume job)
[Message Worker]
  ├─ 1. Clasificador de Riesgo (Claude Haiku) ───> ['bajo' | 'moderado' | 'alto']
  ├─ 2. Persistencia en PostgreSQL ─────────────> (usuarios, conversaciones, estado_conversacion)
  ├─ 3. Banderas de Riesgo (si riesgo != 'bajo')─> (banderas_riesgo)
  ├─ 4. Motor Conversacional (Claude) ──────────> (System prompt + risk_level + historial)
  ├─ 5. Enviar mensaje de vuelta ───────────────> WhatsApp Cloud API
  └─ 6. Guardar respuesta del bot ──────────────> (conversaciones)
```

---

## 📁 Estructura del Proyecto

```text
.
├── .env.example                  # Plantilla de variables de entorno
├── package.json                  # Dependencias y scripts
├── tsconfig.json                 # Configuración estricta de TypeScript
├── README.md                     # Documentación y guía de uso
└── src/
    ├── app.ts                    # Configuración de Express (middlewares, rutas, /health)
    ├── server.ts                 # Entrypoint (inicia Express + Worker con Graceful Shutdown)
    ├── config/
    │   └── env.ts                # Validación estricta con Zod y dotenv
    ├── utils/
    │   └── logger.ts             # Logger estructurado con niveles (INFO, WARN, ERROR, DEBUG)
    ├── prompts/
    │   ├── risk.prompt.ts        # Prompt para clasificación de riesgo (Paso 3a)
    │   └── chat.prompt.ts        # System prompt conversacional (Paso 3c)
    ├── clients/
    │   ├── whatsapp.client.ts    # Cliente HTTP para la WhatsApp Cloud API
    │   └── claude.client.ts      # Cliente SDK Anthropic (Haiku + Chat configurable)
    ├── db/
    │   ├── index.ts              # Pool de conexiones pg
    │   ├── schema.sql            # Script DDL de tablas e índices
    │   ├── migrate.ts            # Ejecutor de migraciones (npm run db:migrate)
    │   └── repositories/
    │       ├── user.repo.ts          # Gestión de usuarios y estado_conversacion
    │       ├── conversation.repo.ts  # Guardado de mensajes e historial
    │       └── risk-flag.repo.ts     # Registro de banderas_riesgo
    ├── queue/
    │   ├── connection.ts         # Configuración de conexión IORedis
    │   └── message.queue.ts      # Definición de la cola BullMQ y encolador
    ├── worker/
    │   └── message.worker.ts     # Worker que ejecuta secuencialmente los pasos 3a - 3e
    └── webhook/
        ├── webhook.types.ts      # Interfaces TypeScript de la WhatsApp Cloud API
        ├── webhook.controller.ts # Handlers para GET (verificación) y POST (recepción)
        └── webhook.router.ts     # Router Express montado en /webhook
```

---

## 📋 Requisitos Previos

- **Node.js** >= 18 (Probado en Node.js v24)
- **PostgreSQL** >= 14
- **Redis** >= 6 (Local o en la nube)
- Cuenta de desarrollador en **Meta for Developers** con WhatsApp Cloud API configurada.
- API Key de **Anthropic**.

---

## ⚙️ Configuración (.env)

Copia el archivo `.env.example` a `.env`:

```bash
cp .env.example .env
```

Configura tus credenciales:

```env
PORT=3000

# Meta / WhatsApp Cloud API
META_VERIFY_TOKEN=mi_token_secreto_para_meta
WHATSAPP_API_TOKEN=EAAG...
WHATSAPP_PHONE_NUMBER_ID=109876543210987

# Anthropic / Claude
ANTHROPIC_API_KEY=sk-ant-api03-...
CLAUDE_RISK_MODEL=claude-3-5-haiku-20241022
CLAUDE_CHAT_MODEL=claude-3-5-sonnet-20241022

# PostgreSQL
DATABASE_URL=postgresql://postgres:password@localhost:5432/whatsapp_bot

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

---

## 🗄️ Base de Datos y Migraciones

El backend utiliza 4 tablas principales en PostgreSQL:

1. **`usuarios`**: Almacena el número de WhatsApp (`wa_id`), nombre de perfil y fechas.
2. **`conversaciones`**: Registra cada mensaje (`user` o `assistant`), el `wa_message_id` para evitar duplicados y el `risk_level`.
3. **`estado_conversacion`**: Almacena el estado actual de la sesión por usuario (`activo`, `en_crisis`), último nivel de riesgo y contexto.
4. **`banderas_riesgo`**: Se inserta una fila automáticamente cuando el mensaje es clasificado con riesgo `moderado` o `alto`.

Para ejecutar la creación de tablas:

```bash
npm run db:migrate
```

---

## 🚀 Ejecución

### Modo Desarrollo (con recarga en vivo)
```bash
npm run dev
```

### Modo Producción
```bash
npm run build
npm run start
```

---

## 🧪 Pruebas Locales del Webhook

### 1. Verificación de Meta (`GET /webhook`)
Meta envía una petición GET para validar que el webhook te pertenece:

```bash
curl -X GET "http://localhost:3000/webhook?hub.mode=subscribe&hub.verify_token=mi_token_secreto_para_meta&hub.challenge=1158201444"
```
**Respuesta esperada:** `1158201444` (HTTP 200).

### 2. Simulación de Mensaje Entrante (`POST /webhook`)
Simula un mensaje enviado por un usuario:

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [
      {
        "id": "WHATSAPP_BUSINESS_ACCOUNT_ID",
        "changes": [
          {
            "value": {
              "messaging_product": "whatsapp",
              "metadata": {
                "display_phone_number": "15550234567",
                "phone_number_id": "109876543210987"
              },
              "contacts": [
                {
                  "profile": { "name": "Usuario Demo" },
                  "wa_id": "5215512345678"
                }
              ],
              "messages": [
                {
                  "from": "5215512345678",
                  "id": "wamid.HBgLMTE1NTUwMjM0NTYVAgASGBQzQjE2NTQ5NzNDODk4ODAxMjlBQQA=",
                  "timestamp": "1710000000",
                  "text": { "body": "Hola, me he sentido muy triste y solo estos días." },
                  "type": "text"
                }
              ]
            },
            "field": "messages"
          }
        ]
      }
    ]
  }'
```
**Respuesta esperada:** `{"status":"received"}` de inmediato (HTTP 200). En la terminal verás los logs del encolado y procesamiento del worker.

---

## 💬 Personalización de Prompts

Para colocar los prompts específicos de tu proyecto:
1. **Clasificador de Riesgo (Claude Haiku):** Edita [`src/prompts/risk.prompt.ts`](file:///Users/user/Documents/piloto%20bot%20/src/prompts/risk.prompt.ts).
2. **Motor Conversacional (Claude):** Edita [`src/prompts/chat.prompt.ts`](file:///Users/user/Documents/piloto%20bot%20/src/prompts/chat.prompt.ts).
