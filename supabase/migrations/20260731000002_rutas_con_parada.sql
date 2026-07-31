-- Rutas con parada: una ruta = N vuelos (tramos) independientes.
-- Spec: docs/superpowers/specs/2026-07-31-rutas-con-parada-design.md
-- La solicitud sigue siendo una (con_parada + cadena de ICAOs intermedios);
-- al publicar se generan N filas de vuelo hermanas enlazadas por grupo_ruta.

ALTER TABLE solicitud_vuelo ADD COLUMN IF NOT EXISTS con_parada boolean NOT NULL DEFAULT false;
ALTER TABLE solicitud_vuelo ADD COLUMN IF NOT EXISTS tramos_ruta jsonb;

ALTER TABLE vuelo ADD COLUMN IF NOT EXISTS grupo_ruta integer;
ALTER TABLE vuelo ADD COLUMN IF NOT EXISTS orden_tramo smallint;
ALTER TABLE vuelo ADD COLUMN IF NOT EXISTS total_tramos smallint;
ALTER TABLE vuelo ADD COLUMN IF NOT EXISTS icao_origen varchar(4);
ALTER TABLE vuelo ADD COLUMN IF NOT EXISTS icao_destino varchar(4);
CREATE INDEX IF NOT EXISTS idx_vuelo_grupo_ruta ON vuelo (grupo_ruta) WHERE grupo_ruta IS NOT NULL;

-- Estado nuevo EN_ESPERA_TRAMO (tramos 2..N esperando en el aeropuerto destino).
-- ⚠️ SIEMPRE las DOS tablas hermanas (lección de la migración 20260713000003:
-- vuelo_estado_tiempo nunca se actualizó con EN_PROGRESO y todo hacía ROLLBACK).
ALTER TABLE vuelo DROP CONSTRAINT IF EXISTS vuelo_estado_check;
ALTER TABLE vuelo ADD CONSTRAINT vuelo_estado_check CHECK (
  (estado)::text = ANY (ARRAY[
    'SOLICITADO','AJUSTADO','PUBLICADO','PROGRAMADO','SALIDA_HANGAR',
    'EN_VUELO','EN_PROGRESO','REGRESO_HANGAR','FINALIZANDO','COMPLETADO',
    'CANCELADO','EN_ESPERA_TRAMO'
  ]::text[])
);

ALTER TABLE vuelo_estado_tiempo DROP CONSTRAINT IF EXISTS vuelo_estado_tiempo_estado_check;
ALTER TABLE vuelo_estado_tiempo ADD CONSTRAINT vuelo_estado_tiempo_estado_check
  CHECK (estado IN ('PROGRAMADO','SALIDA_HANGAR','EN_VUELO','EN_PROGRESO',
                    'REGRESO_HANGAR','COMPLETADO','CANCELADO','FINALIZANDO',
                    'EN_ESPERA_TRAMO'));
