-- =============================================================================
-- Migración 20260822000004 · Qué partes toca una orden de trabajo
--
-- Al abrir el trabajo el mecánico declara sobre qué libros va a certificar:
-- célula, motor, hélice, o los tres. Sirve para dos cosas:
--
--   1. Precargar las casillas al emitir los stickers.
--   2. Que el aviso "órdenes firmadas sin sticker" de cada libro deje de mentir.
--      Sin esto la consulta lista TODAS las órdenes firmadas del avión en LOS
--      TRES libros, así que un cambio de aceite del motor aparece como "falta
--      pegar" en el libro de la célula y en el de la hélice, para siempre.
--
-- Es un DEFAULT, no un candado (decisión de Daniel): al emitir se puede agregar
-- o quitar un libro. Un trabajo descubre trabajo — la orden CAAA/2026-0058 del
-- YS-333-PE se abrió por el motor y terminó llevándose también la hélice a
-- overhaul.
--
-- DEFAULT TRUE a propósito: de las órdenes viejas no sabemos qué tocaron, y es
-- preferible que las reclamen los tres libros a que desaparezcan en silencio.
--
-- Spec: docs/superpowers/specs/2026-08-22-stickers-libros-aeronave-design.md
-- =============================================================================

BEGIN;

ALTER TABLE orden_trabajo ADD COLUMN IF NOT EXISTS toca_celula BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE orden_trabajo ADD COLUMN IF NOT EXISTS toca_motor  BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE orden_trabajo ADD COLUMN IF NOT EXISTS toca_helice BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN orden_trabajo.toca_celula IS
  'Sobre qué libros declara certificar esta orden. Es un default para el sticker, no un candado.';

COMMIT;
