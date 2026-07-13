-- =============================================================================
-- Suscripciones de Web Push (notificaciones del navegador). Cada dispositivo/
-- navegador que activa notificaciones guarda aquí su suscripción (endpoint +
-- llaves). El backend envía push a estas suscripciones (web-push) cuando Turno
-- hace acciones (abrir/cerrar operaciones, avisos, salidas/entradas al hangar).
-- endpoint es único por dispositivo.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS push_subscription (
  id         BIGSERIAL PRIMARY KEY,
  id_usuario INTEGER NOT NULL REFERENCES usuario(id_usuario),
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  creado_en  TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_sub_usuario ON push_subscription (id_usuario);

COMMIT;

SELECT to_regclass('public.push_subscription') AS tabla;
