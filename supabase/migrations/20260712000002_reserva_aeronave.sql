-- =============================================================================
-- Reserva de aeronave para USO ESPECIAL (sin alumno): traslado, prueba, uso
-- administrativo, etc. Hasta hoy no había forma de "ocupar" un avión salvo
-- asignándoselo a un alumno o mandándolo a mantenimiento, porque vuelo.id_alumno
-- es NOT NULL. Esta tabla es un bloqueo por slot (fecha + rango de bloques) con
-- motivo, independiente de la tabla vuelo.
--
-- Bloquea el agendamiento de ese avión en ese día+bloque(s) (igual que un
-- mantenimiento, pero a nivel de bloque y sin fila en mantenimiento_aeronave).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS reserva_aeronave (
  id            BIGSERIAL PRIMARY KEY,
  id_aeronave   INTEGER NOT NULL REFERENCES aeronave(id_aeronave),
  fecha         DATE NOT NULL,
  id_bloque     INTEGER NOT NULL REFERENCES bloque_horario(id_bloque),
  id_bloque_fin INTEGER REFERENCES bloque_horario(id_bloque),
  motivo        VARCHAR(20) NOT NULL DEFAULT 'OTRO'
                  CHECK (motivo IN ('TRASLADO','PRUEBA','ADMINISTRATIVO','OTRO')),
  descripcion   TEXT,
  creado_por    INTEGER REFERENCES usuario(id_usuario),
  creado_en     TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reserva_aeronave_fecha ON reserva_aeronave (id_aeronave, fecha);

COMMIT;

-- Verificación
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'reserva_aeronave' ORDER BY ordinal_position;
