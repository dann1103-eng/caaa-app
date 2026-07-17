-- Repara filas de solicitud_vuelo con id_bloque_fin corrupto (fuera del rango
-- válido de bloque_horario, 1-9), causado por un bug en aplicarMovimientos
-- (services/solicitudService.js) que calculaba el ancho de la RUTA usando el
-- id_bloque YA APARCADO (día 0, índice descartable) en vez del original.
-- Ver sesión 2026-07-17. El fix de código va en el mismo commit.
--
-- Los vuelos afectados son todos LOCAL (un solo bloque): la convención sana
-- es id_bloque_fin = id_bloque (confirmado contra filas LOCAL no corruptas).
-- Este UPDATE es idempotente y solo toca filas realmente corruptas.

UPDATE solicitud_vuelo
   SET id_bloque_fin = id_bloque
 WHERE id_bloque_fin IS NOT NULL
   AND (id_bloque_fin < 1 OR id_bloque_fin > 9);
