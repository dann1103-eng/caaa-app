-- ============================================================================
-- CAAA · Seeds de catálogo (idempotente)
--
-- Bypasea FK checks durante la carga (session_replication_role = replica)
-- para evitar errores de orden entre tablas con relaciones cruzadas. Las FK
-- siguen siendo validadas en runtime para todas las queries normales.
-- ============================================================================

BEGIN;
SET session_replication_role = 'replica';

-- ── wb_plantilla ────────────────────────────────────
--

SET SESSION AUTHORIZATION DEFAULT;


INSERT INTO public.wb_plantilla (id_wb_plantilla, nombre, unidad_arm, empty_weight, empty_weight_arm, empty_weight_moment, max_takeoff_weight, max_landing_weight, fuel_capacity_gal, fuel_usable_gal, fuel_burn_gal_hr, estaciones, creado_en, limits_normal, limits_utility, fuel_lb_gal, moment_div1000, fuel_burn_note) VALUES (3, 'C152', 'inches', 1118.00, 30.000, 33540.00, 1670.00, 1670.00, 26.00, 24.50, 6.80, '[{"id": "pilot", "arm": 39, "nombre": "Pilot", "max_weight": 300}, {"id": "copilot", "arm": 39, "nombre": "Co-pilot", "max_weight": 300}, {"id": "bag1", "arm": 64, "nombre": "Baggage #1 (120 lb MAX)", "max_weight": 120}, {"id": "bag2", "arm": 84, "nombre": "Baggage #2 (40 lb MAX)", "max_weight": 40}, {"id": "fuel", "arm": 42, "nombre": "Fuel (24.5 gal MAX)", "is_fuel": true, "max_gal": 24.5, "max_weight": null}]', '2026-03-21 01:37:40.158273', '[{"w": 992, "aft": 36.5, "fwd": 30.0}, {"w": 1268, "aft": 36.5, "fwd": 30.0}, {"w": 1653, "aft": 36.5, "fwd": 33.0}, {"w": 1819, "aft": 37.0, "fwd": 33.0}]', NULL, 6.00, true, 'Aprox. 6.8 gal/hr @ 75% Power') ON CONFLICT DO NOTHING;
INSERT INTO public.wb_plantilla (id_wb_plantilla, nombre, unidad_arm, empty_weight, empty_weight_arm, empty_weight_moment, max_takeoff_weight, max_landing_weight, fuel_capacity_gal, fuel_usable_gal, fuel_burn_gal_hr, estaciones, creado_en, limits_normal, limits_utility, fuel_lb_gal, moment_div1000, fuel_burn_note) VALUES (2, 'PA28-180', 'inches', 1310.00, 86.700, 113577.00, 2450.00, 2450.00, 50.00, 48.00, 8.00, '[{"id": "oil", "arm": 27.5, "is_oil": true, "nombre": "Oil (8qt max, 7lb/gal)", "is_fixed": true, "max_weight": 14, "fixed_weight": 14}, {"id": "front", "arm": 80.5, "nombre": "Front Seat L & R", "max_weight": 400}, {"id": "fuel", "arm": 95, "nombre": "Fuel (48 gal useable)", "is_fuel": true, "max_gal": 48, "max_weight": null}, {"id": "rear", "arm": 118.1, "nombre": "Rear Seat L & R", "max_weight": 300}, {"id": "bag", "arm": 142.8, "nombre": "Baggage (200 lb max)", "max_weight": 200}]', '2026-03-21 01:37:29.647696', '[{"w": 1400, "aft": 93, "fwd": 81}, {"w": 1500, "aft": 93, "fwd": 81}, {"w": 2000, "aft": 93, "fwd": 82.5}, {"w": 2100, "aft": 93, "fwd": 84}, {"w": 2450, "aft": 93.5, "fwd": 87.72}]', '[{"w": 1400, "aft": 89, "fwd": 81}, {"w": 1950, "aft": 89, "fwd": 85}]', 6.00, false, '8 gal/hr') ON CONFLICT DO NOTHING;
INSERT INTO public.wb_plantilla (id_wb_plantilla, nombre, unidad_arm, empty_weight, empty_weight_arm, empty_weight_moment, max_takeoff_weight, max_landing_weight, fuel_capacity_gal, fuel_usable_gal, fuel_burn_gal_hr, estaciones, creado_en, limits_normal, limits_utility, fuel_lb_gal, moment_div1000, fuel_burn_note) VALUES (1, 'PA38-Tomahawk', 'inches', 1128.00, 73.200, 82569.60, 1670.00, 1670.00, 32.00, 30.00, 6.00, '[{"id": "pilot", "arm": 85.5, "nombre": "Pilot", "max_weight": 300}, {"id": "copilot", "arm": 85.5, "nombre": "Co-pilot", "max_weight": 300}, {"id": "bag1", "arm": 115, "nombre": "Baggage #1 (100 lb MAX)", "max_weight": 100}, {"id": "fuel", "arm": 75.4, "nombre": "Fuel (30 gal MAX)", "is_fuel": true, "max_gal": 30, "max_weight": null}]', '2026-03-21 01:37:03.543942', '[{"w": 1100, "aft": 78.5, "fwd": 72}, {"w": 1200, "aft": 78.5, "fwd": 72}, {"w": 1500, "aft": 78.5, "fwd": 74}, {"w": 1670, "aft": 79, "fwd": 74}]', NULL, 6.00, false, 'Aprox. 6 gal/hr @ 65% Power') ON CONFLICT DO NOTHING;
INSERT INTO public.wb_plantilla (id_wb_plantilla, nombre, unidad_arm, empty_weight, empty_weight_arm, empty_weight_moment, max_takeoff_weight, max_landing_weight, fuel_capacity_gal, fuel_usable_gal, fuel_burn_gal_hr, estaciones, creado_en, limits_normal, limits_utility, fuel_lb_gal, moment_div1000, fuel_burn_note) VALUES (4, 'PA28R-180', 'inches', 1380.00, 85.500, 117990.00, 2500.00, 2500.00, 50.00, 48.00, 10.00, '[{"id": "oil", "arm": 29.5, "is_oil": true, "nombre": "Oil (8qt max, 7lb/gal)", "is_fixed": true, "max_weight": 14, "fixed_weight": 14}, {"id": "front", "arm": 85.5, "nombre": "Front Seat L & R", "max_weight": 400}, {"id": "fuel", "arm": 95, "nombre": "Fuel (48 gal useable)", "is_fuel": true, "max_gal": 48, "max_weight": null}, {"id": "rear", "arm": 118.1, "nombre": "Rear Seat L & R", "max_weight": 300}, {"id": "bag", "arm": 142.8, "nombre": "Baggage (200 lbs max.)", "max_weight": 200}]', '2026-04-06 20:30:07.957598', '[{"w": 1400, "aft": 93, "fwd": 81}, {"w": 1500, "aft": 93, "fwd": 81}, {"w": 2000, "aft": 93, "fwd": 82.5}, {"w": 2100, "aft": 93, "fwd": 84}, {"w": 2500, "aft": 93.5, "fwd": 87.72}]', '[{"w": 1400, "aft": 89, "fwd": 81}, {"w": 1950, "aft": 89, "fwd": 85}]', 6.00, false, '10 gal/hr') ON CONFLICT DO NOTHING;



--

-- ── aeronave ────────────────────────────────────
--


INSERT INTO public.aeronave (id_aeronave, codigo, modelo, tipo, activa, color, id_wb_plantilla, frecuencias_default, horas_acumuladas, horas_proxima_revision, tipo_proxima_revision, estado) VALUES (5, 'SIM-1', 'SIMULADOR', 'SIMULADOR', true, NULL, NULL, '[]', 0.00, NULL, NULL, 'ACTIVO') ON CONFLICT DO NOTHING;
INSERT INTO public.aeronave (id_aeronave, codigo, modelo, tipo, activa, color, id_wb_plantilla, frecuencias_default, horas_acumuladas, horas_proxima_revision, tipo_proxima_revision, estado) VALUES (2, 'YS-333-PE', 'TOMAHAWK', 'AVION', true, 'Amarillo', 3, '[{"frecuencia": "121.900", "descripcion": "Torre MSSS"}, {"frecuencia": "118.300", "descripcion": "Torre"}, {"frecuencia": "129.225", "descripcion": "Aprox"}, {"frecuencia": "129.200", "descripcion": "Escuela"}]', 0.00, 50.00, '50HR', 'ACTIVO') ON CONFLICT DO NOTHING;
INSERT INTO public.aeronave (id_aeronave, codigo, modelo, tipo, activa, color, id_wb_plantilla, frecuencias_default, horas_acumuladas, horas_proxima_revision, tipo_proxima_revision, estado) VALUES (4, 'YS-127-P', 'ARROW', 'AVION', true, 'Blanco y rojo', 4, '[{"frecuencia": "121.900", "descripcion": "Torre MSSS"}, {"frecuencia": "118.300", "descripcion": "Torre"}, {"frecuencia": "129.225", "descripcion": "Aprox"}, {"frecuencia": "129.200", "descripcion": "Escuela"}]', 0.00, 50.00, '50HR', 'ACTIVO') ON CONFLICT DO NOTHING;
INSERT INTO public.aeronave (id_aeronave, codigo, modelo, tipo, activa, color, id_wb_plantilla, frecuencias_default, horas_acumuladas, horas_proxima_revision, tipo_proxima_revision, estado) VALUES (3, 'YS-270-P', 'CHEROKEE', 'AVION', true, 'Blanco y rojo', 2, '[{"frecuencia": "121.900", "descripcion": "Torre MSSS"}, {"frecuencia": "118.300", "descripcion": "Torre"}, {"frecuencia": "129.225", "descripcion": "Aprox"}, {"frecuencia": "129.200", "descripcion": "Escuela"}]', 3.50, 50.00, '50HR', 'ACTIVO') ON CONFLICT DO NOTHING;
INSERT INTO public.aeronave (id_aeronave, codigo, modelo, tipo, activa, color, id_wb_plantilla, frecuencias_default, horas_acumuladas, horas_proxima_revision, tipo_proxima_revision, estado) VALUES (1, 'YS-334-PE', 'CESSNA-152', 'AVION', true, 'Blanco y azul', 1, '[{"frecuencia": "121.900", "descripcion": "Torre MSSS"}, {"frecuencia": "118.300", "descripcion": "Torre"}, {"frecuencia": "129.225", "descripcion": "Aprox"}, {"frecuencia": "129.200", "descripcion": "Escuela"}]', 47.00, 50.00, '50HR', 'ACTIVO') ON CONFLICT DO NOTHING;



--

-- ── aeronave_tarifa ────────────────────────────────────
--


INSERT INTO public.aeronave_tarifa (id, id_aeronave, modelo_aeronave, tarifa_hora_usd, vigente_desde, vigente_hasta, creado_por, creado_en) VALUES (1, NULL, 'Cessna 152', 135.00, '2026-01-01', NULL, NULL, '2026-05-19 12:58:47.629003') ON CONFLICT DO NOTHING;
INSERT INTO public.aeronave_tarifa (id, id_aeronave, modelo_aeronave, tarifa_hora_usd, vigente_desde, vigente_hasta, creado_por, creado_en) VALUES (2, NULL, 'Tomahawk', 135.00, '2026-01-01', NULL, NULL, '2026-05-19 12:58:47.629003') ON CONFLICT DO NOTHING;
INSERT INTO public.aeronave_tarifa (id, id_aeronave, modelo_aeronave, tarifa_hora_usd, vigente_desde, vigente_hasta, creado_por, creado_en) VALUES (3, NULL, 'Cherokee 180', 200.00, '2026-01-01', NULL, NULL, '2026-05-19 12:58:47.629003') ON CONFLICT DO NOTHING;
INSERT INTO public.aeronave_tarifa (id, id_aeronave, modelo_aeronave, tarifa_hora_usd, vigente_desde, vigente_hasta, creado_por, creado_en) VALUES (4, NULL, 'Cherokee Arrow', 220.00, '2026-01-01', NULL, NULL, '2026-05-19 12:58:47.629003') ON CONFLICT DO NOTHING;
INSERT INTO public.aeronave_tarifa (id, id_aeronave, modelo_aeronave, tarifa_hora_usd, vigente_desde, vigente_hasta, creado_por, creado_en) VALUES (5, NULL, 'Bimotor', 600.00, '2026-01-01', NULL, NULL, '2026-05-19 12:58:47.629003') ON CONFLICT DO NOTHING;
INSERT INTO public.aeronave_tarifa (id, id_aeronave, modelo_aeronave, tarifa_hora_usd, vigente_desde, vigente_hasta, creado_por, creado_en) VALUES (6, NULL, 'BATD II', 90.00, '2026-01-01', NULL, NULL, '2026-05-19 12:58:47.629003') ON CONFLICT DO NOTHING;
INSERT INTO public.aeronave_tarifa (id, id_aeronave, modelo_aeronave, tarifa_hora_usd, vigente_desde, vigente_hasta, creado_por, creado_en) VALUES (7, NULL, 'BATD II Bimotor', 105.00, '2026-01-01', NULL, NULL, '2026-05-19 12:58:47.629003') ON CONFLICT DO NOTHING;
INSERT INTO public.aeronave_tarifa (id, id_aeronave, modelo_aeronave, tarifa_hora_usd, vigente_desde, vigente_hasta, creado_por, creado_en) VALUES (8, NULL, 'Cessna 152', 130.00, '2025-01-01', '2025-12-31', NULL, '2026-05-19 12:58:47.629003') ON CONFLICT DO NOTHING;
INSERT INTO public.aeronave_tarifa (id, id_aeronave, modelo_aeronave, tarifa_hora_usd, vigente_desde, vigente_hasta, creado_por, creado_en) VALUES (9, NULL, 'Tomahawk', 130.00, '2025-01-01', '2025-12-31', NULL, '2026-05-19 12:58:47.629003') ON CONFLICT DO NOTHING;
INSERT INTO public.aeronave_tarifa (id, id_aeronave, modelo_aeronave, tarifa_hora_usd, vigente_desde, vigente_hasta, creado_por, creado_en) VALUES (10, NULL, 'BATD II', 85.00, '2025-01-01', '2025-12-31', NULL, '2026-05-19 12:58:47.629003') ON CONFLICT DO NOTHING;



--

-- ── licencia ────────────────────────────────────
--


INSERT INTO public.licencia (id_licencia, nombre, nivel, dia_apertura_agenda) VALUES (1, 'Privado', 1, 1) ON CONFLICT DO NOTHING;
INSERT INTO public.licencia (id_licencia, nombre, nivel, dia_apertura_agenda) VALUES (3, 'Instrumentos', 3, 2) ON CONFLICT DO NOTHING;
INSERT INTO public.licencia (id_licencia, nombre, nivel, dia_apertura_agenda) VALUES (2, 'Comercial', 2, 3) ON CONFLICT DO NOTHING;



--

-- ── bloque_horario ────────────────────────────────────
--


INSERT INTO public.bloque_horario (id_bloque, hora_inicio, hora_fin, es_almuerzo) VALUES (1, '06:00:00', '07:30:00', false) ON CONFLICT DO NOTHING;
INSERT INTO public.bloque_horario (id_bloque, hora_inicio, hora_fin, es_almuerzo) VALUES (2, '07:30:00', '09:00:00', false) ON CONFLICT DO NOTHING;
INSERT INTO public.bloque_horario (id_bloque, hora_inicio, hora_fin, es_almuerzo) VALUES (3, '09:00:00', '10:30:00', false) ON CONFLICT DO NOTHING;
INSERT INTO public.bloque_horario (id_bloque, hora_inicio, hora_fin, es_almuerzo) VALUES (4, '10:30:00', '11:50:00', false) ON CONFLICT DO NOTHING;
INSERT INTO public.bloque_horario (id_bloque, hora_inicio, hora_fin, es_almuerzo) VALUES (5, '11:50:00', '13:30:00', false) ON CONFLICT DO NOTHING;
INSERT INTO public.bloque_horario (id_bloque, hora_inicio, hora_fin, es_almuerzo) VALUES (6, '13:30:00', '14:50:00', false) ON CONFLICT DO NOTHING;
INSERT INTO public.bloque_horario (id_bloque, hora_inicio, hora_fin, es_almuerzo) VALUES (7, '14:50:00', '16:10:00', false) ON CONFLICT DO NOTHING;
INSERT INTO public.bloque_horario (id_bloque, hora_inicio, hora_fin, es_almuerzo) VALUES (8, '16:10:00', '17:20:00', false) ON CONFLICT DO NOTHING;
INSERT INTO public.bloque_horario (id_bloque, hora_inicio, hora_fin, es_almuerzo) VALUES (9, '17:20:00', '18:50:00', false) ON CONFLICT DO NOTHING;



--

-- ── condiciones_cancelacion ────────────────────────────────────
--


INSERT INTO public.condiciones_cancelacion (id_condicion, texto, activa, orden) VALUES (1, 'Las cancelaciones realizadas con más de 24 horas de anticipación no generan penalización.', true, 1) ON CONFLICT DO NOTHING;
INSERT INTO public.condiciones_cancelacion (id_condicion, texto, activa, orden) VALUES (2, 'Las cancelaciones con menos de 24 horas se consideran cancelación de emergencia y requieren justificación obligatoria con documento adjunto.', true, 2) ON CONFLICT DO NOTHING;
INSERT INTO public.condiciones_cancelacion (id_condicion, texto, activa, orden) VALUES (3, 'El abuso de cancelaciones de emergencia puede resultar en restricciones de agenda.', true, 3) ON CONFLICT DO NOTHING;
INSERT INTO public.condiciones_cancelacion (id_condicion, texto, activa, orden) VALUES (4, 'La solicitud de cancelación será notificada al instructor asignado y a programación.', true, 4) ON CONFLICT DO NOTHING;



--

-- ── curso ────────────────────────────────────
--


INSERT INTO public.curso (id, codigo, nombre, descripcion, gastos_administrativos_usd, costo_teorico_usd, horas_teoricas, total_usd_estimado, activo, creado_en) VALUES (1, 'PP', 'Piloto Privado', 'Licencia base de piloto privado.', 250.00, 870.00, 40, 7645.00, true, '2026-05-19 12:58:47.629003') ON CONFLICT DO NOTHING;
INSERT INTO public.curso (id, codigo, nombre, descripcion, gastos_administrativos_usd, costo_teorico_usd, horas_teoricas, total_usd_estimado, activo, creado_en) VALUES (2, 'IFR', 'Habilitación por Instrumentos', 'Habilitación de vuelo por instrumentos.', 0.00, 955.00, 40, 7905.00, true, '2026-05-19 12:58:47.629003') ON CONFLICT DO NOTHING;
INSERT INTO public.curso (id, codigo, nombre, descripcion, gastos_administrativos_usd, costo_teorico_usd, horas_teoricas, total_usd_estimado, activo, creado_en) VALUES (3, 'CPL', 'Piloto Comercial', 'Licencia comercial de piloto.', 0.00, 720.00, 40, 8745.00, true, '2026-05-19 12:58:47.629003') ON CONFLICT DO NOTHING;
INSERT INTO public.curso (id, codigo, nombre, descripcion, gastos_administrativos_usd, costo_teorico_usd, horas_teoricas, total_usd_estimado, activo, creado_en) VALUES (4, 'MULTI', 'Piloto Bimotor', 'Habilitación bimotor.', 0.00, 250.00, 10, 4765.00, true, '2026-05-19 12:58:47.629003') ON CONFLICT DO NOTHING;
INSERT INTO public.curso (id, codigo, nombre, descripcion, gastos_administrativos_usd, costo_teorico_usd, horas_teoricas, total_usd_estimado, activo, creado_en) VALUES (5, 'INST', 'Piloto Instructor', 'Habilitación de instructor de vuelo.', 0.00, 500.00, 40, 4550.00, true, '2026-05-19 12:58:47.629003') ON CONFLICT DO NOTHING;



--

-- ── curso_componente_practico ────────────────────────────────────
--


INSERT INTO public.curso_componente_practico (id, id_curso, tipo_aeronave, horas_requeridas, tarifa_hora_usd_referencia) VALUES (1, 1, 'Cessna 152 / Tomahawk', 45, 135.00) ON CONFLICT DO NOTHING;
INSERT INTO public.curso_componente_practico (id, id_curso, tipo_aeronave, horas_requeridas, tarifa_hora_usd_referencia) VALUES (2, 1, 'BATD II', 5, 90.00) ON CONFLICT DO NOTHING;
INSERT INTO public.curso_componente_practico (id, id_curso, tipo_aeronave, horas_requeridas, tarifa_hora_usd_referencia) VALUES (3, 2, 'Cessna 152 / Tomahawk', 30, 135.00) ON CONFLICT DO NOTHING;
INSERT INTO public.curso_componente_practico (id, id_curso, tipo_aeronave, horas_requeridas, tarifa_hora_usd_referencia) VALUES (4, 2, 'Cherokee 180', 10, 200.00) ON CONFLICT DO NOTHING;
INSERT INTO public.curso_componente_practico (id, id_curso, tipo_aeronave, horas_requeridas, tarifa_hora_usd_referencia) VALUES (5, 2, 'BATD II', 10, 90.00) ON CONFLICT DO NOTHING;
INSERT INTO public.curso_componente_practico (id, id_curso, tipo_aeronave, horas_requeridas, tarifa_hora_usd_referencia) VALUES (6, 3, 'Cessna 152 / Tomahawk', 25, 135.00) ON CONFLICT DO NOTHING;
INSERT INTO public.curso_componente_practico (id, id_curso, tipo_aeronave, horas_requeridas, tarifa_hora_usd_referencia) VALUES (7, 3, 'Cherokee 180', 10, 200.00) ON CONFLICT DO NOTHING;
INSERT INTO public.curso_componente_practico (id, id_curso, tipo_aeronave, horas_requeridas, tarifa_hora_usd_referencia) VALUES (8, 3, 'Cherokee Arrow', 10, 220.00) ON CONFLICT DO NOTHING;
INSERT INTO public.curso_componente_practico (id, id_curso, tipo_aeronave, horas_requeridas, tarifa_hora_usd_referencia) VALUES (9, 3, 'BATD II', 5, 90.00) ON CONFLICT DO NOTHING;
INSERT INTO public.curso_componente_practico (id, id_curso, tipo_aeronave, horas_requeridas, tarifa_hora_usd_referencia) VALUES (10, 4, 'Bimotor', 7, 600.00) ON CONFLICT DO NOTHING;
INSERT INTO public.curso_componente_practico (id, id_curso, tipo_aeronave, horas_requeridas, tarifa_hora_usd_referencia) VALUES (11, 4, 'BATD II Bimotor', 3, 105.00) ON CONFLICT DO NOTHING;
INSERT INTO public.curso_componente_practico (id, id_curso, tipo_aeronave, horas_requeridas, tarifa_hora_usd_referencia) VALUES (12, 5, 'Cessna 152 / Tomahawk', 30, 135.00) ON CONFLICT DO NOTHING;



--

-- ── documento_requerido_catalogo ────────────────────────────────────
--


INSERT INTO public.documento_requerido_catalogo (id, codigo, nombre, autoridad, aplica_a_menores, aplica_a_extranjeros, descripcion, frecuencia_renovacion_meses, activo) VALUES (1, 'CAAA_INSCRIPCION', 'Hoja de inscripción CAAA', 'CAAA', false, false, NULL, NULL, true) ON CONFLICT DO NOTHING;
INSERT INTO public.documento_requerido_catalogo (id, codigo, nombre, autoridad, aplica_a_menores, aplica_a_extranjeros, descripcion, frecuencia_renovacion_meses, activo) VALUES (2, 'CAAA_FOTO', 'Fotografía en digital', 'CAAA', false, false, NULL, NULL, true) ON CONFLICT DO NOTHING;
INSERT INTO public.documento_requerido_catalogo (id, codigo, nombre, autoridad, aplica_a_menores, aplica_a_extranjeros, descripcion, frecuencia_renovacion_meses, activo) VALUES (3, 'CAAA_DUI', 'DUI homologado / Pasaporte / Carnet residente', 'CAAA', false, false, NULL, NULL, true) ON CONFLICT DO NOTHING;
INSERT INTO public.documento_requerido_catalogo (id, codigo, nombre, autoridad, aplica_a_menores, aplica_a_extranjeros, descripcion, frecuencia_renovacion_meses, activo) VALUES (4, 'CAAA_NIT', 'NIT (extranjeros)', 'CAAA', false, true, NULL, NULL, true) ON CONFLICT DO NOTHING;
INSERT INTO public.documento_requerido_catalogo (id, codigo, nombre, autoridad, aplica_a_menores, aplica_a_extranjeros, descripcion, frecuencia_renovacion_meses, activo) VALUES (5, 'CAAA_BITACORA', 'Bitácora de vuelo', 'CAAA', false, false, NULL, NULL, true) ON CONFLICT DO NOTHING;
INSERT INTO public.documento_requerido_catalogo (id, codigo, nombre, autoridad, aplica_a_menores, aplica_a_extranjeros, descripcion, frecuencia_renovacion_meses, activo) VALUES (6, 'CAAA_ANTECEDENTES', 'Antecedentes policiales y penales', 'CAAA', false, false, NULL, 12, true) ON CONFLICT DO NOTHING;
INSERT INTO public.documento_requerido_catalogo (id, codigo, nombre, autoridad, aplica_a_menores, aplica_a_extranjeros, descripcion, frecuencia_renovacion_meses, activo) VALUES (7, 'CAAA_ANTIDOPAJE', 'Prueba antidopaje (CME)', 'CAAA', false, false, NULL, 12, true) ON CONFLICT DO NOTHING;
INSERT INTO public.documento_requerido_catalogo (id, codigo, nombre, autoridad, aplica_a_menores, aplica_a_extranjeros, descripcion, frecuencia_renovacion_meses, activo) VALUES (8, 'AAC_PARTIDA', 'Partida de nacimiento (menores de 18 años)', 'AAC', true, false, NULL, NULL, true) ON CONFLICT DO NOTHING;
INSERT INTO public.documento_requerido_catalogo (id, codigo, nombre, autoridad, aplica_a_menores, aplica_a_extranjeros, descripcion, frecuencia_renovacion_meses, activo) VALUES (9, 'AAC_BACHILLER', 'Título de bachiller completado', 'AAC', false, false, NULL, NULL, true) ON CONFLICT DO NOTHING;
INSERT INTO public.documento_requerido_catalogo (id, codigo, nombre, autoridad, aplica_a_menores, aplica_a_extranjeros, descripcion, frecuencia_renovacion_meses, activo) VALUES (10, 'AAC_EXAMENES', 'Exámenes por especialista y de laboratorio', 'AAC', false, false, NULL, 24, true) ON CONFLICT DO NOTHING;
INSERT INTO public.documento_requerido_catalogo (id, codigo, nombre, autoridad, aplica_a_menores, aplica_a_extranjeros, descripcion, frecuencia_renovacion_meses, activo) VALUES (11, 'AAC_SEGURO', 'Seguro de vida (carrera de piloto)', 'AAC', false, false, NULL, 12, true) ON CONFLICT DO NOTHING;
INSERT INTO public.documento_requerido_catalogo (id, codigo, nombre, autoridad, aplica_a_menores, aplica_a_extranjeros, descripcion, frecuencia_renovacion_meses, activo) VALUES (12, 'AAC_FORMULARIO', 'Formulario de aplicación AAC', 'AAC', false, false, NULL, NULL, true) ON CONFLICT DO NOTHING;
INSERT INTO public.documento_requerido_catalogo (id, codigo, nombre, autoridad, aplica_a_menores, aplica_a_extranjeros, descripcion, frecuencia_renovacion_meses, activo) VALUES (13, 'AAC_PERMISO', 'Permiso ambos padres notariado (<18)', 'AAC', true, false, NULL, NULL, true) ON CONFLICT DO NOTHING;
INSERT INTO public.documento_requerido_catalogo (id, codigo, nombre, autoridad, aplica_a_menores, aplica_a_extranjeros, descripcion, frecuencia_renovacion_meses, activo) VALUES (14, 'AAC_MEDICO_II', 'Certificado médico clase II', 'AAC', false, false, NULL, 24, true) ON CONFLICT DO NOTHING;



--

-- ── unidad_teorica ────────────────────────────────────
--


INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (1, 1, 1, 'Regulaciones aéreas', NULL, 4.0, 1, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (2, 1, 2, 'Conocimiento general de aeronaves', NULL, 4.0, 2, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (3, 1, 3, 'Performance y planeamiento de vuelo', NULL, 4.0, 3, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (4, 1, 4, 'Capacidades humanas (Factores)', NULL, 3.0, 4, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (5, 1, 5, 'Meteorología', NULL, 5.0, 5, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (6, 1, 6, 'Navegación', NULL, 6.0, 6, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (7, 1, 7, 'Procedimientos operacionales', NULL, 3.0, 7, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (8, 1, 8, 'Principios de vuelo', NULL, 4.0, 8, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (9, 1, 9, 'Comunicaciones y radiotelefonía', NULL, 3.0, 9, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (10, 1, 10, 'Examen integrador AAC', NULL, 4.0, 10, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (11, 2, 1, 'Reglamentación IFR', NULL, 4.0, 1, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (12, 2, 2, 'Sistema y procedimientos IFR', NULL, 6.0, 2, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (13, 2, 3, 'Cartas de aproximación', NULL, 6.0, 3, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (14, 2, 4, 'Meteorología avanzada', NULL, 5.0, 4, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (15, 2, 5, 'Sistemas de navegación', NULL, 6.0, 5, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (16, 2, 6, 'Performance aeronave IFR', NULL, 4.0, 6, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (17, 2, 7, 'Factores humanos en IFR', NULL, 3.0, 7, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (18, 2, 8, 'Examen integrador IFR', NULL, 6.0, 8, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (19, 3, 1, 'Reglamentación CPL', NULL, 4.0, 1, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (20, 3, 2, 'Performance y limitaciones', NULL, 5.0, 2, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (21, 3, 3, 'Sistemas avanzados de aeronaves', NULL, 5.0, 3, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (22, 3, 4, 'Meteorología operacional', NULL, 5.0, 4, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (23, 3, 5, 'Navegación avanzada', NULL, 5.0, 5, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (24, 3, 6, 'Procedimientos comerciales', NULL, 5.0, 6, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (25, 3, 7, 'CRM y factores humanos', NULL, 4.0, 7, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (26, 3, 8, 'Examen integrador CPL', NULL, 7.0, 8, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (27, 4, 1, 'Sistemas bimotor', NULL, 3.0, 1, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (28, 4, 2, 'Procedimientos asimétricos', NULL, 3.0, 2, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (29, 4, 3, 'Performance multimotor', NULL, 2.0, 3, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (30, 4, 4, 'Examen bimotor', NULL, 2.0, 4, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (31, 5, 1, 'Pedagogía aeronáutica', NULL, 5.0, 1, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (32, 5, 2, 'Técnicas de enseñanza', NULL, 5.0, 2, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (33, 5, 3, 'Briefings y debriefings', NULL, 4.0, 3, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (34, 5, 4, 'Evaluación de progreso', NULL, 4.0, 4, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (35, 5, 5, 'Seguridad en instrucción', NULL, 5.0, 5, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (36, 5, 6, 'Maniobras avanzadas', NULL, 5.0, 6, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (37, 5, 7, 'Gestión de aula y vuelo', NULL, 5.0, 7, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;
INSERT INTO public.unidad_teorica (id, id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo, creado_en) VALUES (38, 5, 8, 'Examen instructor', NULL, 7.0, 8, NULL, true, '2026-05-19 14:37:15.861138') ON CONFLICT DO NOTHING;



--

-- ── instructor_tarifa ────────────────────────────────────
--





--

-- ── licencia_aeronave ────────────────────────────────────
--


INSERT INTO public.licencia_aeronave (id_licencia, id_aeronave) VALUES (3, 1) ON CONFLICT DO NOTHING;
INSERT INTO public.licencia_aeronave (id_licencia, id_aeronave) VALUES (3, 2) ON CONFLICT DO NOTHING;
INSERT INTO public.licencia_aeronave (id_licencia, id_aeronave) VALUES (2, 3) ON CONFLICT DO NOTHING;
INSERT INTO public.licencia_aeronave (id_licencia, id_aeronave) VALUES (2, 4) ON CONFLICT DO NOTHING;
INSERT INTO public.licencia_aeronave (id_licencia, id_aeronave) VALUES (2, 5) ON CONFLICT DO NOTHING;
INSERT INTO public.licencia_aeronave (id_licencia, id_aeronave) VALUES (1, 1) ON CONFLICT DO NOTHING;
INSERT INTO public.licencia_aeronave (id_licencia, id_aeronave) VALUES (1, 2) ON CONFLICT DO NOTHING;
INSERT INTO public.licencia_aeronave (id_licencia, id_aeronave) VALUES (1, 3) ON CONFLICT DO NOTHING;
INSERT INTO public.licencia_aeronave (id_licencia, id_aeronave) VALUES (1, 4) ON CONFLICT DO NOTHING;
INSERT INTO public.licencia_aeronave (id_licencia, id_aeronave) VALUES (1, 5) ON CONFLICT DO NOTHING;



--

-- ── medico_autorizado ────────────────────────────────────
--


INSERT INTO public.medico_autorizado (id, especialidad, nombre, telefonos, correo, activo, creado_en) VALUES (1, 'CARDIOLOGO', 'Dr. Juan Francisco Escolán', '2263-4212 / 7938-0217', 'sanmia78@yahoo.com', true, '2026-05-19 12:58:47.629003') ON CONFLICT DO NOTHING;
INSERT INTO public.medico_autorizado (id, especialidad, nombre, telefonos, correo, activo, creado_en) VALUES (2, 'CARDIOLOGO', 'Dr. Manuel Rivera Castaneda', '2555-3700', 'mariveracastaneda@gmail.com', true, '2026-05-19 12:58:47.629003') ON CONFLICT DO NOTHING;
INSERT INTO public.medico_autorizado (id, especialidad, nombre, telefonos, correo, activo, creado_en) VALUES (3, 'CARDIOLOGO', 'Dr. Fidel Candray', '2235-5881 / 2235-5882', 'marcialcabrera@hotmail.com', true, '2026-05-19 12:58:47.629003') ON CONFLICT DO NOTHING;
INSERT INTO public.medico_autorizado (id, especialidad, nombre, telefonos, correo, activo, creado_en) VALUES (4, 'OTORRINO', 'Dr. Fernando Godoy Aparicio', '2235-0524 / 2225-0122', 'godoyyori@yahoo.com', true, '2026-05-19 12:58:47.629003') ON CONFLICT DO NOTHING;
INSERT INTO public.medico_autorizado (id, especialidad, nombre, telefonos, correo, activo, creado_en) VALUES (5, 'OTORRINO', 'Dr. Juan Caballero', '2525-0900 / 2525-0918', 'atencion@audiomed.com.sv', true, '2026-05-19 12:58:47.629003') ON CONFLICT DO NOTHING;
INSERT INTO public.medico_autorizado (id, especialidad, nombre, telefonos, correo, activo, creado_en) VALUES (6, 'OTORRINO', 'Dra. Alicia Marisol Galán Campos', '2304-4090 / 7284-3022', 'alexagalan86@gmail.com', true, '2026-05-19 12:58:47.629003') ON CONFLICT DO NOTHING;
INSERT INTO public.medico_autorizado (id, especialidad, nombre, telefonos, correo, activo, creado_en) VALUES (7, 'OTORRINO', 'Dr. Alex Wilfredo Minero Ortiz', '2264-4658 / 2200-3208', 'audiolabcentroamerica@gmail.com', true, '2026-05-19 12:58:47.629003') ON CONFLICT DO NOTHING;
INSERT INTO public.medico_autorizado (id, especialidad, nombre, telefonos, correo, activo, creado_en) VALUES (8, 'OFTALMOLOGO', 'Dr. Mario Rene Tevez', '2225-3356 / 7934-2562', 'mariotevezmolina@gmail.com', true, '2026-05-19 12:58:47.629003') ON CONFLICT DO NOTHING;
INSERT INTO public.medico_autorizado (id, especialidad, nombre, telefonos, correo, activo, creado_en) VALUES (9, 'OFTALMOLOGO', 'Dra. Evelin Regina Portillo de Quezada', '2264-4151 / 2264-5241', 'evelynportillo@hotmail.com', true, '2026-05-19 12:58:47.629003') ON CONFLICT DO NOTHING;
INSERT INTO public.medico_autorizado (id, especialidad, nombre, telefonos, correo, activo, creado_en) VALUES (10, 'OFTALMOLOGO', 'Dr. Manuel Cruz Cerna Guzmán', '2225-3079 / 7150-7686', 'manuel.ccg@gmail.com', true, '2026-05-19 12:58:47.629003') ON CONFLICT DO NOTHING;
INSERT INTO public.medico_autorizado (id, especialidad, nombre, telefonos, correo, activo, creado_en) VALUES (11, 'OFTALMOLOGO', 'Dr. Mario Roberto García Rivas', '2519-4949 / 7930-1529', 'c@vivasinlentes.com', true, '2026-05-19 12:58:47.629003') ON CONFLICT DO NOTHING;



--

-- ── webhook_endpoint ────────────────────────────────────
--


INSERT INTO public.webhook_endpoint (id_webhook, nombre, url, secret_token, activo, timeout_ms, creado_en, actualizado_en) VALUES (1, 'asdads', 'https://webhook.site/93e54fd2-ec14-4d76-a665-024453de4eff', NULL, true, 9999, '2026-03-12 18:49:11.499499', '2026-04-06 19:13:13.974765') ON CONFLICT DO NOTHING;



--


SET session_replication_role = 'origin';
COMMIT;
