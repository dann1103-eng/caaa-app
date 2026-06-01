-- Backfill: vincular las tarifas de aeronave existentes (creadas con texto de
-- modelo legible) a su fila real en `aeronave` mediante id_aeronave.
--
-- Contexto: el módulo de tarifas guardaba `aeronave_tarifa.modelo_aeronave` como
-- texto libre con nombres legibles ("Cessna 152"), mientras que `aeronave.modelo`
-- usa códigos en mayúscula ("CESSNA-152"). El cargo automático al cerrar un vuelo
-- buscaba la tarifa por texto exacto y nunca casaba. Ahora el vínculo es por
-- id_aeronave; este script rellena ese id en las filas antiguas.
--
-- Idempotente: solo afecta filas con id_aeronave IS NULL.
-- Las tarifas sin aeronave equivalente (Bimotor, BATD II, BATD II Bimotor —
-- perfiles de simulador) se dejan sin vincular a propósito.

UPDATE aeronave_tarifa t
SET id_aeronave = a.id_aeronave
FROM aeronave a
WHERE t.id_aeronave IS NULL
  AND (
        (t.modelo_aeronave = 'Cessna 152'     AND a.modelo = 'CESSNA-152') OR
        (t.modelo_aeronave = 'Tomahawk'       AND a.modelo = 'TOMAHAWK')   OR
        (t.modelo_aeronave = 'Cherokee 180'   AND a.modelo = 'CHEROKEE')   OR
        (t.modelo_aeronave = 'Cherokee Arrow' AND a.modelo = 'ARROW')
      );

-- Verificación
SELECT t.id, t.id_aeronave, t.modelo_aeronave, a.codigo, a.modelo AS aeronave_modelo
FROM aeronave_tarifa t
LEFT JOIN aeronave a ON a.id_aeronave = t.id_aeronave
WHERE t.vigente_hasta IS NULL
ORDER BY t.modelo_aeronave;
