-- Fase 3 (incremento 5) — Notificaciones in-app
--
-- Una notificación por usuario destinatario (los "broadcast" por rol se expanden
-- a una fila por usuario, para que el estado "leída" sea por persona).

CREATE TABLE IF NOT EXISTS notificacion (
  id          BIGSERIAL PRIMARY KEY,
  id_usuario  INTEGER NOT NULL,
  tipo        VARCHAR(40) NOT NULL DEFAULT 'INFO',
  mensaje     TEXT NOT NULL,
  enlace      VARCHAR(200),
  leida       BOOLEAN NOT NULL DEFAULT FALSE,
  creada_en   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_notificacion_usuario ON notificacion(id_usuario, leida, creada_en DESC);

-- Verificación
SELECT COUNT(*) AS notificacion_existe FROM information_schema.tables WHERE table_name='notificacion';
