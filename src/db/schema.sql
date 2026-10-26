-- Extensión para generación de UUIDs si no existe
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. Tabla de Usuarios
-- =============================================================================
CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wa_id VARCHAR(50) UNIQUE NOT NULL,       -- Número de teléfono WhatsApp (ej. 5215512345678)
    name VARCHAR(255),                       -- Nombre del perfil de WhatsApp
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_usuarios_wa_id ON usuarios(wa_id);

-- =============================================================================
-- 2. Tabla de Conversaciones (Mensajes y su historial)
-- =============================================================================
CREATE TABLE IF NOT EXISTS conversaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    wa_message_id VARCHAR(255) UNIQUE,       -- ID original del mensaje de WhatsApp (para idempotencia)
    risk_level VARCHAR(20) CHECK (risk_level IN ('alto', 'moderado', 'sin_riesgo', 'bajo', NULL)),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conversaciones_user_id ON conversaciones(user_id);
CREATE INDEX IF NOT EXISTS idx_conversaciones_created_at ON conversaciones(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversaciones_wa_msg_id ON conversaciones(wa_message_id);

-- =============================================================================
-- 3. Tabla de Estado de la Conversación (Sesión actual por usuario)
-- =============================================================================
CREATE TABLE IF NOT EXISTS estado_conversacion (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'activo',      -- 'activo', 'esperando_evaluacion', 'en_crisis', 'cerrado'
    last_risk_level VARCHAR(20) DEFAULT 'sin_riesgo' CHECK (last_risk_level IN ('alto', 'moderado', 'sin_riesgo', 'bajo')),
    context_data JSONB DEFAULT '{}'::jsonb,  -- Almacén flexible para variables de sesión / memoria corta
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_estado_conversacion_user_id ON estado_conversacion(user_id);

-- =============================================================================
-- 4. Tabla de Banderas de Riesgo (Incidentes de riesgo moderado o alto)
-- =============================================================================
CREATE TABLE IF NOT EXISTS banderas_riesgo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversaciones(id) ON DELETE SET NULL,
    risk_level VARCHAR(20) NOT NULL CHECK (risk_level IN ('moderado', 'alto')),
    reasoning TEXT NOT NULL,                 -- Explicación emitida por el clasificador
    status VARCHAR(50) DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'en_revision', 'atendido')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_banderas_riesgo_user_id ON banderas_riesgo(user_id);
CREATE INDEX IF NOT EXISTS idx_banderas_riesgo_level ON banderas_riesgo(risk_level);
CREATE INDEX IF NOT EXISTS idx_banderas_riesgo_created_at ON banderas_riesgo(created_at DESC);
