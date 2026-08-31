-- =============================================================================
-- Migración 20260822000002 · El anclaje de un componente puede no existir
--
-- Al sembrar los anclajes desde los stickers reales apareció un caso que el
-- diseño no había previsto: hay partes cuyo T.T. NO se puede confiar porque en
-- el papel está copiado del de la célula (el motor y la hélice del YS-127-P y
-- del YS-270-P dicen exactamente el mismo número que el avión).
--
-- Poner 0 en esas filas sería peor que dejarlas vacías: la fórmula
--   T.T. = (lectura - tac_ancla) + tt_ancla
-- devolvería la lectura cruda como si fuera el tiempo total, y ese número
-- terminaría impreso en un libro oficial.
--
-- Con NULL la fórmula propaga NULL, `componenteController.list` devuelve
-- horas_componente = null, y la pantalla puede decir "sin anclaje: dictalo del
-- libro". El primer sticker que emita el mecánico lo ancla.
--
-- Solo relaja un NOT NULL; no borra ni transforma nada.
--
-- Spec: docs/superpowers/specs/2026-08-22-stickers-libros-aeronave-design.md
-- =============================================================================

BEGIN;

ALTER TABLE taller_componente ALTER COLUMN horas_aeronave_instalacion   DROP NOT NULL;
ALTER TABLE taller_componente ALTER COLUMN horas_componente_instalacion DROP NOT NULL;

COMMENT ON COLUMN taller_componente.horas_componente_instalacion IS
  'T.T. de la parte en el TAC del anclaje, en la escala del libro. NULL = sin anclaje confiable: el sistema no propone T.T. y lo pide dictado del libro.';

COMMIT;
