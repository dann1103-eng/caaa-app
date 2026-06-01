-- Fase 3 (incremento 6) — Pago de teoría al instructor por curso aprobado
--
-- El pago de teoría es un MONTO FIJO POR CURSO (igual para cualquier instructor).
-- Se genera un pago pendiente cuando el alumno aprueba el examen FINAL interno;
-- se le paga al instructor de esa evaluación final. La nómina lo incluye y lo
-- marca PAGADO al pagar el periodo.

ALTER TABLE curso
  ADD COLUMN IF NOT EXISTS pago_teoria_instructor_usd NUMERIC(10,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS pago_teoria_pendiente (
  id                BIGSERIAL PRIMARY KEY,
  id_instructor     INTEGER NOT NULL,
  id_curso          INTEGER NOT NULL REFERENCES curso(id),
  id_alumno         INTEGER NOT NULL,
  monto_usd         NUMERIC(10,2) NOT NULL DEFAULT 0,
  estado            VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE'
                    CHECK (estado IN ('PENDIENTE','PAGADO')),
  id_nomina_detalle INTEGER NULL,
  creado_en         TIMESTAMP NOT NULL DEFAULT NOW(),
  pagado_en         TIMESTAMP NULL,
  UNIQUE (id_curso, id_alumno)
);
CREATE INDEX IF NOT EXISTS ix_pago_teoria_instructor ON pago_teoria_pendiente(id_instructor, estado);

-- Verificación
SELECT
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name='curso' AND column_name='pago_teoria_instructor_usd') AS curso_col,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name='pago_teoria_pendiente') AS tabla_pendiente;
