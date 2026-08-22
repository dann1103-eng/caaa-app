-- =============================================================================
-- Migración 20260822000003 · La nota de procedencia del anclaje es texto libre
--
-- `ancla_origen` se había definido VARCHAR(160) pensando en "sticker
-- CAAA/2026-0055". Al sembrar los anclajes reales quedó claro que la nota tiene
-- que poder explicar la salvedad, que es justo lo que le sirve al jefe de
-- taller para decidir si confía en el número:
--
--   "TSO del sticker de 50 h del 10-ago-2026 (verificado: 289.68 en junio +
--    49.12 de TAC). El T.T. del papel está copiado del de la célula: falta
--    dictarlo del libro."
--
-- Solo ensancha el tipo; no trunca ni transforma nada.
--
-- Spec: docs/superpowers/specs/2026-08-22-stickers-libros-aeronave-design.md
-- =============================================================================

BEGIN;

ALTER TABLE taller_componente ALTER COLUMN ancla_origen TYPE TEXT;

COMMENT ON COLUMN taller_componente.ancla_origen IS
  'De dónde salió el anclaje y con qué salvedad. Lo lee el jefe de taller para decidir si confía en el número.';

COMMIT;
