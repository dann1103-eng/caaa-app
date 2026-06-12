-- PROPUESTA (no ejecutado): corrige los textos de modelo intercambiados de aeronaves 1 y 2.
-- Fuente de verdad: plantillas W&B y CAA-frontend/src/loadsheet/data/aircraft.js
--   YS-334-PE = PA-38 Tomahawk (plantilla 1 "PA38-Tomahawk")
--   YS-333-PE = Cessna 152     (plantilla 3 "C152")
-- OJO: el cargo automático de vuelos tiene fallback de tarifa por TEXTO de modelo
-- (aeronave_tarifa sin id vinculado). Ambas comparten tarifa $135, así que el cambio
-- no altera montos, pero revisar Tarifas tras aplicar.
UPDATE aeronave SET modelo = 'TOMAHAWK'   WHERE id_aeronave = 1 AND codigo = 'YS-334-PE';
UPDATE aeronave SET modelo = 'CESSNA-152' WHERE id_aeronave = 2 AND codigo = 'YS-333-PE';
