-- Fase 1 — Cuenta corriente (Nota + Multas) y vuelo extracurricular
--
-- 1A) Columna `nota` en movimiento_cuenta (entre H.T. y Debe en la UI) y nuevo
--     tipo CARGO_MULTA para multas (ej. no-show): debita saldo sin sumar horas.
-- 1B) Bandera `es_extracurricular` en vuelo: práctica extra que se cobra a tarifa
--     pero NO cuenta para horas de licencia ni avance de curso.
--
-- Aditivo y reejecutable.

-- 1A. Columna nota
ALTER TABLE movimiento_cuenta
  ADD COLUMN IF NOT EXISTS nota VARCHAR(255);

-- 1A. Ampliar el CHECK de tipo para incluir CARGO_MULTA
ALTER TABLE movimiento_cuenta DROP CONSTRAINT IF EXISTS movimiento_cuenta_tipo_check;
ALTER TABLE movimiento_cuenta
  ADD CONSTRAINT movimiento_cuenta_tipo_check
  CHECK (tipo IN ('DEPOSITO','CARGO_VUELO','CARGO_CURSO','CARGO_OTRO',
                  'CARGO_MULTA','AJUSTE_DEBE','AJUSTE_HABER','ANULACION'));

-- 1B. Bandera de vuelo extracurricular
ALTER TABLE vuelo
  ADD COLUMN IF NOT EXISTS es_extracurricular BOOLEAN NOT NULL DEFAULT FALSE;

-- Verificación
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name='movimiento_cuenta' AND column_name='nota') AS tiene_nota,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name='vuelo' AND column_name='es_extracurricular') AS tiene_extracurricular,
  pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname='movimiento_cuenta_tipo_check')) AS check_tipo;
