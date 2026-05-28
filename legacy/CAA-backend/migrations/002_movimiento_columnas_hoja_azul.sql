-- =============================================================================
-- Migración 002: Columnas estilo "hoja azul CAAA" en movimiento_cuenta
--
-- Replica el formato físico que usa actualmente la escuela:
--   FECHA · INSTRUCTOR · FACTURA NO. · AVION · H.V. · H.T. · DEBE · HABER · SALDO
-- =============================================================================

BEGIN;

ALTER TABLE movimiento_cuenta
  ADD COLUMN IF NOT EXISTS instructor_nombre VARCHAR(120),
  ADD COLUMN IF NOT EXISTS avion_codigo      VARCHAR(40),
  ADD COLUMN IF NOT EXISTS horas_vuelo       NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS horas_totales     NUMERIC(7,2),
  ADD COLUMN IF NOT EXISTS editado_en        TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS editado_por       INTEGER NULL,
  ADD COLUMN IF NOT EXISTS motivo_edicion    TEXT NULL;

-- Función helper para obtener nombre legible del instructor desde id_vuelo (best effort)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vuelo')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'instructor')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'usuario') THEN
    UPDATE movimiento_cuenta m
       SET instructor_nombre = u.username,
           avion_codigo      = a.codigo
      FROM vuelo v
      LEFT JOIN instructor i ON i.id_instructor = v.id_instructor
      LEFT JOIN usuario u ON u.id_usuario = i.id_usuario
      LEFT JOIN aeronave a ON a.id_aeronave = v.id_aeronave
     WHERE m.id_vuelo = v.id_vuelo
       AND (m.instructor_nombre IS NULL OR m.avion_codigo IS NULL);
  END IF;
END $$;

COMMIT;
