-- =============================================================================
-- Tarifa del simulador: unificar los dos "BATD II" en una sola, vinculada al
-- SIM-1, a $90/h. Y sacar de la lista las tarifas sueltas que ya no aplican.
--
-- CONTEXTO (sesión 2026-07-16): en Administración → Tarifas aparecían tres filas
-- "sin vincular" (id_aeronave NULL, solo texto de modelo), heredadas del seed
-- original del módulo:
--   * 'BATD II'         $90   <- el simulador
--   * 'BATD II Bimotor' $105  <- el MISMO simulador, con otro precio
--   * 'Bimotor'         $600  <- ya no aplica: el YS-259-PE tiene la suya vinculada
--
-- Ninguna cobraba nada. El cargo automático (cargarVueloACuentaDentroTx) matchea
-- por id_aeronave y, si no, por texto de modelo — y el modelo del SIM-1 es
-- 'SIMULADOR', que no coincide con ninguno de esos textos. Resultado: la vouchera
-- de simulador funcionaba pero debitaba $0, en silencio (el catch del cargo se
-- traga el error). Este fix la hace cobrar de verdad.
--
-- Decisión de Daniel (2026-07-16): los dos BATD son el mismo simulador -> una sola
-- tarifa de $90. La dualidad de precios (cobro a estudiante vs. cobro especial /
-- secundario) se modela en otra sesión, no con dos filas sueltas.
--
-- SEGURIDAD CONTABLE: las tarifas se referencian desde factura_detalle
-- (id_aeronave_tarifa). Por eso NO se borra a ciegas: si una fila ya se usó en
-- alguna factura se RETIRA (vigente_hasta = ayer) para no romper el historial;
-- solo se borran las que nunca se usaron. El SQL decide solo.
--
-- OJO: movimiento_cuenta NO tiene id_aeronave_tarifa (guarda el monto ya calculado
-- más avion_codigo/horas_vuelo, no un puntero a la tarifa). La única tabla que
-- apunta a aeronave_tarifa es factura_detalle.
--
-- Solo toca filas VIGENTES. Las históricas ya vencidas (p.ej. 'BATD II' $85 de
-- 2025) se dejan intactas: no ensucian la lista y son historial.
-- =============================================================================

BEGIN;

-- 1) La tarifa del simulador, vinculada por id_aeronave (el match que prioriza el
--    cargo automático). Solo si SIM-1 no tiene ya una vigente.
INSERT INTO aeronave_tarifa (id_aeronave, modelo_aeronave, tarifa_hora_usd, vigente_desde)
SELECT a.id_aeronave, 'BATD II', 90.00, DATE '2026-01-01'
  FROM aeronave a
 WHERE a.codigo = 'SIM-1'
   AND NOT EXISTS (
     SELECT 1 FROM aeronave_tarifa t
      WHERE t.id_aeronave = a.id_aeronave
        AND (t.vigente_hasta IS NULL OR t.vigente_hasta >= CURRENT_DATE)
   );

-- 2a) Las que YA se usaron en una factura: se retiran, no se borran.
UPDATE aeronave_tarifa t
   SET vigente_hasta = CURRENT_DATE - 1
 WHERE t.id_aeronave IS NULL
   AND t.modelo_aeronave IN ('BATD II', 'BATD II Bimotor', 'Bimotor')
   AND (t.vigente_hasta IS NULL OR t.vigente_hasta >= CURRENT_DATE)
   AND EXISTS (SELECT 1 FROM factura_detalle f WHERE f.id_aeronave_tarifa = t.id);

-- 2b) Las que nunca se usaron: se borran.
DELETE FROM aeronave_tarifa t
 WHERE t.id_aeronave IS NULL
   AND t.modelo_aeronave IN ('BATD II', 'BATD II Bimotor', 'Bimotor')
   AND (t.vigente_hasta IS NULL OR t.vigente_hasta >= CURRENT_DATE)
   AND NOT EXISTS (SELECT 1 FROM factura_detalle f WHERE f.id_aeronave_tarifa = t.id);

COMMIT;

-- =============================================================================
-- Verificación: la lista de tarifas vigentes debe quedar con una fila por
-- aeronave y SIN filas "sin vincular".
-- =============================================================================
SELECT COALESCE(a.codigo, '(sin vincular)') AS aeronave,
       t.modelo_aeronave,
       t.tarifa_hora_usd,
       t.vigente_desde,
       t.vigente_hasta
  FROM aeronave_tarifa t
  LEFT JOIN aeronave a ON a.id_aeronave = t.id_aeronave
 WHERE t.vigente_hasta IS NULL OR t.vigente_hasta >= CURRENT_DATE
 ORDER BY (t.id_aeronave IS NULL) DESC, a.codigo;
