-- =============================================================================
-- Seed 005: Historial realista de cuentas corrientes
--
-- Para cada alumno existente (u4, u5, u7) inserta:
--   * Saldos iniciales reseteados a 0 (limpia movimientos anteriores)
--   * Depósitos (HABER) intercalados con cargos por vuelo (DEBE)
--   * Factura correlativa por cada cargo
--   * Instructor + avión + H.V. + H.T. en cada movimiento
--
-- Imita el formato exacto de la hoja azul CAAA.
-- =============================================================================

BEGIN;

-- Limpiar movimientos previos (sólo de los 3 alumnos seed)
DELETE FROM factura_detalle
 WHERE id_factura IN (SELECT id FROM factura WHERE id_alumno IN (1,2,3));
DELETE FROM factura WHERE id_alumno IN (1,2,3);
DELETE FROM recibo_pago WHERE id_alumno IN (1,2,3);
DELETE FROM movimiento_cuenta WHERE id_alumno IN (1,2,3);
UPDATE cuenta_corriente_alumno SET saldo_actual_usd = 0, ultimo_movimiento_en = NULL WHERE id_alumno IN (1,2,3);

-- =============================================================================
-- ALUMNO 1 — u4 (Juan Carlos Oporto Martinez): replica exacta de la hoja azul
-- =============================================================================

-- Recibo inicial $2,771.67
WITH r AS (
  INSERT INTO recibo_pago (numero_correlativo, id_alumno, fecha, monto_usd, metodo, descripcion)
  VALUES (nextval('recibo_correlativo_seq'), 1, '2025-07-07', 2771.67, 'TRANSFERENCIA', 'Pago teoría + 17.4 hrs vuelo IFR')
  RETURNING id, numero_correlativo
)
INSERT INTO movimiento_cuenta
  (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
   id_recibo, instructor_nombre, horas_totales, generado_automatico)
SELECT 1, 'DEPOSITO', '2025-07-07', 'Pago teoría + 17.4 hrs vuelo IFR (Recibo #' || r.numero_correlativo || ')',
       2771.67, 2771.67, r.id, 'Recibo', 17.4, FALSE
FROM r;

-- Vuelo 1: 28-07-25 H. Amaya YS-334PE 1.0h
WITH f AS (
  INSERT INTO factura (numero_correlativo, id_alumno, fecha_emision, subtotal_usd, total_usd, concepto)
  VALUES (nextval('factura_correlativo_seq'), 1, '2025-07-28', 130.00, 130.00, 'Vuelo YS-334-PE 1.0h - H. Amaya')
  RETURNING id, numero_correlativo
)
INSERT INTO movimiento_cuenta
  (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
   id_factura, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, generado_automatico)
SELECT 1, 'CARGO_VUELO', '2025-07-28', 'Vuelo YS-334-PE 1.0h - H. Amaya',
       -130.00, 2641.67, f.id, 'H. Amaya', 'YS-334-PE', 1.0, 1.0, TRUE FROM f;

-- Vuelo 2: 28-07-25 J. Burgos Batd II 1.0h
WITH f AS (
  INSERT INTO factura (numero_correlativo, id_alumno, fecha_emision, subtotal_usd, total_usd, concepto)
  VALUES (nextval('factura_correlativo_seq'), 1, '2025-07-28', 85.00, 85.00, 'Sim BATD II 1.0h - J. Burgos')
  RETURNING id, numero_correlativo
)
INSERT INTO movimiento_cuenta
  (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
   id_factura, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, generado_automatico)
SELECT 1, 'CARGO_VUELO', '2025-07-28', 'Sim BATD II 1.0h - J. Burgos',
       -85.00, 2556.67, f.id, 'J. Burgos', 'SIM-1', 1.0, 2.0, TRUE FROM f;

-- Vuelo 3: 30-07-25 H. Amaya Batd II 1.0h
WITH f AS (
  INSERT INTO factura (numero_correlativo, id_alumno, fecha_emision, subtotal_usd, total_usd, concepto)
  VALUES (nextval('factura_correlativo_seq'), 1, '2025-07-30', 85.00, 85.00, 'Sim BATD II 1.0h - H. Amaya')
  RETURNING id, numero_correlativo
)
INSERT INTO movimiento_cuenta
  (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
   id_factura, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, generado_automatico)
SELECT 1, 'CARGO_VUELO', '2025-07-30', 'Sim BATD II 1.0h - H. Amaya',
       -85.00, 2471.67, f.id, 'H. Amaya', 'SIM-1', 1.0, 3.0, TRUE FROM f;

-- Vuelo 4: 30-07-25 C. Cáceres YS-333-PE 1.0h
WITH f AS (
  INSERT INTO factura (numero_correlativo, id_alumno, fecha_emision, subtotal_usd, total_usd, concepto)
  VALUES (nextval('factura_correlativo_seq'), 1, '2025-07-30', 130.00, 130.00, 'Vuelo YS-333-PE 1.0h - C. Cáceres')
  RETURNING id, numero_correlativo
)
INSERT INTO movimiento_cuenta
  (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
   id_factura, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, generado_automatico)
SELECT 1, 'CARGO_VUELO', '2025-07-30', 'Vuelo YS-333-PE 1.0h - C. Cáceres',
       -130.00, 2341.67, f.id, 'C. Cáceres', 'YS-333-PE', 1.0, 4.0, TRUE FROM f;

-- Recibo 2: 09-08-25 $2,771.67 (Pago 21.3 hrs Instrumentos)
WITH r AS (
  INSERT INTO recibo_pago (numero_correlativo, id_alumno, fecha, monto_usd, metodo, descripcion)
  VALUES (nextval('recibo_correlativo_seq'), 1, '2025-08-09', 2771.67, 'CHEQUE', 'Pago 21.3 hrs Instrumentos')
  RETURNING id, numero_correlativo
)
INSERT INTO movimiento_cuenta
  (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
   id_recibo, instructor_nombre, generado_automatico)
SELECT 1, 'DEPOSITO', '2025-08-09', 'Pago 21.3 hrs Instrumentos (Recibo #' || r.numero_correlativo || ')',
       2771.67, 5113.34, r.id, 'Recibo', FALSE FROM r;

-- Vuelos agosto
WITH f AS (
  INSERT INTO factura (numero_correlativo, id_alumno, fecha_emision, subtotal_usd, total_usd, concepto)
  VALUES (nextval('factura_correlativo_seq'), 1, '2025-08-07', 143.00, 143.00, 'Vuelo YS-334-PE 1.1h - S. Muñoz')
  RETURNING id
)
INSERT INTO movimiento_cuenta
  (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
   id_factura, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, generado_automatico)
SELECT 1, 'CARGO_VUELO', '2025-08-07', 'Vuelo YS-334-PE 1.1h - S. Muñoz',
       -143.00, 4970.34, f.id, 'S. Muñoz', 'YS-334-PE', 1.1, 5.1, TRUE FROM f;

WITH f AS (
  INSERT INTO factura (numero_correlativo, id_alumno, fecha_emision, subtotal_usd, total_usd, concepto)
  VALUES (nextval('factura_correlativo_seq'), 1, '2025-08-08', 130.00, 130.00, 'Vuelo YS-334-PE 1.0h - C. Cáceres')
  RETURNING id
)
INSERT INTO movimiento_cuenta
  (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
   id_factura, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, generado_automatico)
SELECT 1, 'CARGO_VUELO', '2025-08-08', 'Vuelo YS-334-PE 1.0h - C. Cáceres',
       -130.00, 4840.34, f.id, 'C. Cáceres', 'YS-334-PE', 1.0, 6.1, TRUE FROM f;

WITH f AS (
  INSERT INTO factura (numero_correlativo, id_alumno, fecha_emision, subtotal_usd, total_usd, concepto)
  VALUES (nextval('factura_correlativo_seq'), 1, '2025-08-08', 169.00, 169.00, 'Vuelo YS-334-PE 1.3h - J. Muñoz')
  RETURNING id
)
INSERT INTO movimiento_cuenta
  (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
   id_factura, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, generado_automatico)
SELECT 1, 'CARGO_VUELO', '2025-08-08', 'Vuelo YS-334-PE 1.3h - J. Muñoz',
       -169.00, 4671.34, f.id, 'J. Muñoz', 'YS-334-PE', 1.3, 7.4, TRUE FROM f;

WITH f AS (
  INSERT INTO factura (numero_correlativo, id_alumno, fecha_emision, subtotal_usd, total_usd, concepto)
  VALUES (nextval('factura_correlativo_seq'), 1, '2025-08-12', 156.00, 156.00, 'Vuelo YS-333-PE 1.2h - H. Amaya')
  RETURNING id
)
INSERT INTO movimiento_cuenta
  (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
   id_factura, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, generado_automatico)
SELECT 1, 'CARGO_VUELO', '2025-08-12', 'Vuelo YS-333-PE 1.2h - H. Amaya',
       -156.00, 4515.34, f.id, 'H. Amaya', 'YS-333-PE', 1.2, 8.6, TRUE FROM f;

-- Recibo final + último vuelo
WITH r AS (
  INSERT INTO recibo_pago (numero_correlativo, id_alumno, fecha, monto_usd, metodo, descripcion)
  VALUES (nextval('recibo_correlativo_seq'), 1, '2025-09-08', 2771.67, 'EFECTIVO', 'Pago 11.2 hrs IFR + 5h Maniobras')
  RETURNING id, numero_correlativo
)
INSERT INTO movimiento_cuenta
  (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
   id_recibo, instructor_nombre, generado_automatico)
SELECT 1, 'DEPOSITO', '2025-09-08', 'Pago 11.2 hrs IFR + 5h Maniobras (Recibo #' || r.numero_correlativo || ')',
       2771.67, 7287.01, r.id, 'Recibo', FALSE FROM r;

WITH f AS (
  INSERT INTO factura (numero_correlativo, id_alumno, fecha_emision, subtotal_usd, total_usd, concepto)
  VALUES (nextval('factura_correlativo_seq'), 1, '2025-09-12', 169.00, 169.00, 'Vuelo YS-333-PE 1.3h - H. Amaya')
  RETURNING id
)
INSERT INTO movimiento_cuenta
  (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
   id_factura, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, generado_automatico)
SELECT 1, 'CARGO_VUELO', '2025-09-12', 'Vuelo YS-333-PE 1.3h - H. Amaya',
       -169.00, 7118.01, f.id, 'H. Amaya', 'YS-333-PE', 1.3, 31.3, TRUE FROM f;

UPDATE cuenta_corriente_alumno SET saldo_actual_usd = 7118.01, ultimo_movimiento_en = '2025-09-12' WHERE id_alumno = 1;

-- =============================================================================
-- ALUMNO 2 — u5: estudiante de PPL en curso intermedio
-- =============================================================================

WITH r AS (
  INSERT INTO recibo_pago (numero_correlativo, id_alumno, fecha, monto_usd, metodo, descripcion)
  VALUES (nextval('recibo_correlativo_seq'), 2, '2026-01-15', 5000.00, 'TRANSFERENCIA', 'Pago inicial curso Piloto Privado')
  RETURNING id, numero_correlativo
)
INSERT INTO movimiento_cuenta
  (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
   id_recibo, instructor_nombre, generado_automatico)
SELECT 2, 'DEPOSITO', '2026-01-15', 'Pago inicial curso PP (Recibo #' || r.numero_correlativo || ')',
       5000.00, 5000.00, r.id, 'Recibo', FALSE FROM r;

WITH f AS (
  INSERT INTO factura (numero_correlativo, id_alumno, fecha_emision, subtotal_usd, total_usd, concepto)
  VALUES (nextval('factura_correlativo_seq'), 2, '2026-02-03', 90.00, 90.00, 'Sim BATD II 1.0h - H. Amaya')
  RETURNING id
)
INSERT INTO movimiento_cuenta
  (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
   id_factura, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, generado_automatico)
SELECT 2, 'CARGO_VUELO', '2026-02-03', 'Sim BATD II 1.0h - H. Amaya',
       -90.00, 4910.00, f.id, 'H. Amaya', 'SIM-1', 1.0, 1.0, TRUE FROM f;

WITH f AS (
  INSERT INTO factura (numero_correlativo, id_alumno, fecha_emision, subtotal_usd, total_usd, concepto)
  VALUES (nextval('factura_correlativo_seq'), 2, '2026-02-10', 135.00, 135.00, 'Vuelo Cessna 152 1.0h - C. Cáceres')
  RETURNING id
)
INSERT INTO movimiento_cuenta
  (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
   id_factura, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, generado_automatico)
SELECT 2, 'CARGO_VUELO', '2026-02-10', 'Vuelo Cessna 152 1.0h - C. Cáceres',
       -135.00, 4775.00, f.id, 'C. Cáceres', 'YS-334-PE', 1.0, 2.0, TRUE FROM f;

WITH f AS (
  INSERT INTO factura (numero_correlativo, id_alumno, fecha_emision, subtotal_usd, total_usd, concepto)
  VALUES (nextval('factura_correlativo_seq'), 2, '2026-02-15', 162.00, 162.00, 'Vuelo Cessna 152 1.2h - C. Cáceres')
  RETURNING id
)
INSERT INTO movimiento_cuenta
  (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
   id_factura, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, generado_automatico)
SELECT 2, 'CARGO_VUELO', '2026-02-15', 'Vuelo Cessna 152 1.2h - C. Cáceres',
       -162.00, 4613.00, f.id, 'C. Cáceres', 'YS-334-PE', 1.2, 3.2, TRUE FROM f;

WITH f AS (
  INSERT INTO factura (numero_correlativo, id_alumno, fecha_emision, subtotal_usd, total_usd, concepto)
  VALUES (nextval('factura_correlativo_seq'), 2, '2026-02-22', 202.50, 202.50, 'Vuelo Cessna 152 1.5h - H. Amaya')
  RETURNING id
)
INSERT INTO movimiento_cuenta
  (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
   id_factura, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, generado_automatico)
SELECT 2, 'CARGO_VUELO', '2026-02-22', 'Vuelo Cessna 152 1.5h - H. Amaya',
       -202.50, 4410.50, f.id, 'H. Amaya', 'YS-334-PE', 1.5, 4.7, TRUE FROM f;

WITH r AS (
  INSERT INTO recibo_pago (numero_correlativo, id_alumno, fecha, monto_usd, metodo, descripcion)
  VALUES (nextval('recibo_correlativo_seq'), 2, '2026-03-05', 2500.00, 'EFECTIVO', 'Pago segunda cuota PP')
  RETURNING id, numero_correlativo
)
INSERT INTO movimiento_cuenta
  (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
   id_recibo, instructor_nombre, generado_automatico)
SELECT 2, 'DEPOSITO', '2026-03-05', 'Pago segunda cuota PP (Recibo #' || r.numero_correlativo || ')',
       2500.00, 6910.50, r.id, 'Recibo', FALSE FROM r;

WITH f AS (
  INSERT INTO factura (numero_correlativo, id_alumno, fecha_emision, subtotal_usd, total_usd, concepto)
  VALUES (nextval('factura_correlativo_seq'), 2, '2026-03-12', 270.00, 270.00, 'Vuelo Cessna 152 2.0h - H. Amaya')
  RETURNING id
)
INSERT INTO movimiento_cuenta
  (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
   id_factura, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, generado_automatico)
SELECT 2, 'CARGO_VUELO', '2026-03-12', 'Vuelo Cessna 152 2.0h - H. Amaya (navegación)',
       -270.00, 6640.50, f.id, 'H. Amaya', 'YS-334-PE', 2.0, 6.7, TRUE FROM f;

WITH f AS (
  INSERT INTO factura (numero_correlativo, id_alumno, fecha_emision, subtotal_usd, total_usd, concepto)
  VALUES (nextval('factura_correlativo_seq'), 2, '2026-03-19', 175.50, 175.50, 'Vuelo Cessna 152 1.3h - C. Cáceres')
  RETURNING id
)
INSERT INTO movimiento_cuenta
  (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
   id_factura, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, generado_automatico)
SELECT 2, 'CARGO_VUELO', '2026-03-19', 'Vuelo Cessna 152 1.3h - C. Cáceres',
       -175.50, 6465.00, f.id, 'C. Cáceres', 'YS-334-PE', 1.3, 8.0, TRUE FROM f;

WITH f AS (
  INSERT INTO factura (numero_correlativo, id_alumno, fecha_emision, subtotal_usd, total_usd, concepto)
  VALUES (nextval('factura_correlativo_seq'), 2, '2026-04-02', 216.00, 216.00, 'Vuelo Cessna 152 1.6h - H. Amaya')
  RETURNING id
)
INSERT INTO movimiento_cuenta
  (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
   id_factura, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, generado_automatico)
SELECT 2, 'CARGO_VUELO', '2026-04-02', 'Vuelo Cessna 152 1.6h - H. Amaya',
       -216.00, 6249.00, f.id, 'H. Amaya', 'YS-334-PE', 1.6, 9.6, TRUE FROM f;

WITH f AS (
  INSERT INTO factura (numero_correlativo, id_alumno, fecha_emision, subtotal_usd, total_usd, concepto)
  VALUES (nextval('factura_correlativo_seq'), 2, '2026-04-15', 121.50, 121.50, 'Vuelo Cessna 152 0.9h - H. Amaya')
  RETURNING id
)
INSERT INTO movimiento_cuenta
  (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
   id_factura, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, generado_automatico)
SELECT 2, 'CARGO_VUELO', '2026-04-15', 'Vuelo Cessna 152 0.9h - H. Amaya',
       -121.50, 6127.50, f.id, 'H. Amaya', 'YS-334-PE', 0.9, 10.5, TRUE FROM f;

UPDATE cuenta_corriente_alumno SET saldo_actual_usd = 6127.50, ultimo_movimiento_en = '2026-04-15' WHERE id_alumno = 2;

-- =============================================================================
-- ALUMNO 3 — u7: alumno avanzado en CPL con saldo bajo (caso "moroso")
-- =============================================================================

WITH r AS (
  INSERT INTO recibo_pago (numero_correlativo, id_alumno, fecha, monto_usd, metodo, descripcion)
  VALUES (nextval('recibo_correlativo_seq'), 3, '2025-12-10', 4000.00, 'TARJETA', 'Pago inicial CPL')
  RETURNING id, numero_correlativo
)
INSERT INTO movimiento_cuenta
  (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
   id_recibo, generado_automatico)
SELECT 3, 'DEPOSITO', '2025-12-10', 'Pago inicial CPL (Recibo #' || r.numero_correlativo || ')',
       4000.00, 4000.00, r.id, FALSE FROM r;

WITH f AS (
  INSERT INTO factura (numero_correlativo, id_alumno, fecha_emision, subtotal_usd, total_usd, concepto)
  VALUES (nextval('factura_correlativo_seq'), 3, '2026-01-08', 400.00, 400.00, 'Vuelo Cherokee 180 2.0h - C. Cáceres')
  RETURNING id
)
INSERT INTO movimiento_cuenta
  (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
   id_factura, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, generado_automatico)
SELECT 3, 'CARGO_VUELO', '2026-01-08', 'Vuelo Cherokee 180 2.0h - C. Cáceres',
       -400.00, 3600.00, f.id, 'C. Cáceres', 'YS-270-P', 2.0, 2.0, TRUE FROM f;

WITH f AS (
  INSERT INTO factura (numero_correlativo, id_alumno, fecha_emision, subtotal_usd, total_usd, concepto)
  VALUES (nextval('factura_correlativo_seq'), 3, '2026-01-22', 660.00, 660.00, 'Vuelo Cherokee Arrow 3.0h - H. Amaya')
  RETURNING id
)
INSERT INTO movimiento_cuenta
  (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
   id_factura, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, generado_automatico)
SELECT 3, 'CARGO_VUELO', '2026-01-22', 'Vuelo Cherokee Arrow 3.0h - H. Amaya',
       -660.00, 2940.00, f.id, 'H. Amaya', 'YS-127-P', 3.0, 5.0, TRUE FROM f;

WITH f AS (
  INSERT INTO factura (numero_correlativo, id_alumno, fecha_emision, subtotal_usd, total_usd, concepto)
  VALUES (nextval('factura_correlativo_seq'), 3, '2026-02-05', 880.00, 880.00, 'Vuelo Cherokee Arrow 4.0h - H. Amaya')
  RETURNING id
)
INSERT INTO movimiento_cuenta
  (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
   id_factura, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, generado_automatico)
SELECT 3, 'CARGO_VUELO', '2026-02-05', 'Vuelo Cherokee Arrow 4.0h - H. Amaya',
       -880.00, 2060.00, f.id, 'H. Amaya', 'YS-127-P', 4.0, 9.0, TRUE FROM f;

WITH f AS (
  INSERT INTO factura (numero_correlativo, id_alumno, fecha_emision, subtotal_usd, total_usd, concepto)
  VALUES (nextval('factura_correlativo_seq'), 3, '2026-02-26', 990.00, 990.00, 'Vuelo Cherokee Arrow 4.5h - H. Amaya')
  RETURNING id
)
INSERT INTO movimiento_cuenta
  (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
   id_factura, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, generado_automatico)
SELECT 3, 'CARGO_VUELO', '2026-02-26', 'Vuelo Cherokee Arrow 4.5h - H. Amaya',
       -990.00, 1070.00, f.id, 'H. Amaya', 'YS-127-P', 4.5, 13.5, TRUE FROM f;

WITH f AS (
  INSERT INTO factura (numero_correlativo, id_alumno, fecha_emision, subtotal_usd, total_usd, concepto)
  VALUES (nextval('factura_correlativo_seq'), 3, '2026-03-15', 440.00, 440.00, 'Vuelo Cherokee 180 2.2h - C. Cáceres')
  RETURNING id
)
INSERT INTO movimiento_cuenta
  (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
   id_factura, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, generado_automatico)
SELECT 3, 'CARGO_VUELO', '2026-03-15', 'Vuelo Cherokee 180 2.2h - C. Cáceres',
       -440.00, 630.00, f.id, 'C. Cáceres', 'YS-270-P', 2.2, 15.7, TRUE FROM f;

-- Ajuste manual de descuento por error de facturación previa
INSERT INTO movimiento_cuenta
  (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
   instructor_nombre, generado_automatico)
VALUES
  (3, 'AJUSTE_HABER', '2026-04-02',
   'Ajuste a favor: corrección de cargo duplicado factura anterior',
   50.00, 680.00, 'Ajuste', FALSE);

WITH f AS (
  INSERT INTO factura (numero_correlativo, id_alumno, fecha_emision, subtotal_usd, total_usd, concepto)
  VALUES (nextval('factura_correlativo_seq'), 3, '2026-04-18', 297.00, 297.00, 'Vuelo Cherokee Arrow 1.35h - H. Amaya')
  RETURNING id
)
INSERT INTO movimiento_cuenta
  (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
   id_factura, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, generado_automatico)
SELECT 3, 'CARGO_VUELO', '2026-04-18', 'Vuelo Cherokee Arrow 1.35h - H. Amaya',
       -297.00, 383.00, f.id, 'H. Amaya', 'YS-127-P', 1.35, 17.05, TRUE FROM f;

WITH f AS (
  INSERT INTO factura (numero_correlativo, id_alumno, fecha_emision, subtotal_usd, total_usd, concepto)
  VALUES (nextval('factura_correlativo_seq'), 3, '2026-05-08', 270.00, 270.00, 'Vuelo Cessna 152 2.0h - J. Burgos')
  RETURNING id
)
INSERT INTO movimiento_cuenta
  (id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd,
   id_factura, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, generado_automatico)
SELECT 3, 'CARGO_VUELO', '2026-05-08', 'Vuelo Cessna 152 2.0h - J. Burgos',
       -270.00, 113.00, f.id, 'J. Burgos', 'YS-334-PE', 2.0, 19.05, TRUE FROM f;

UPDATE cuenta_corriente_alumno SET saldo_actual_usd = 113.00, ultimo_movimiento_en = '2026-05-08' WHERE id_alumno = 3;

COMMIT;
