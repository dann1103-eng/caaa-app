-- ============================================================================
-- CAAA · Datos operativos (NO idempotente). Solo para clonar staging.
-- En producción, NO correr este archivo: deja la app llenar las tablas.
-- ============================================================================

-- ── aeronave ────────────────────────────────────
--


INSERT INTO public.aeronave (id_aeronave, codigo, modelo, tipo, activa, color, id_wb_plantilla, frecuencias_default, horas_acumuladas, horas_proxima_revision, tipo_proxima_revision, estado) VALUES (5, 'SIM-1', 'SIMULADOR', 'SIMULADOR', true, NULL, NULL, '[]', 0.00, NULL, NULL, 'ACTIVO');
INSERT INTO public.aeronave (id_aeronave, codigo, modelo, tipo, activa, color, id_wb_plantilla, frecuencias_default, horas_acumuladas, horas_proxima_revision, tipo_proxima_revision, estado) VALUES (2, 'YS-333-PE', 'TOMAHAWK', 'AVION', true, 'Amarillo', 3, '[{"frecuencia": "121.900", "descripcion": "Torre MSSS"}, {"frecuencia": "118.300", "descripcion": "Torre"}, {"frecuencia": "129.225", "descripcion": "Aprox"}, {"frecuencia": "129.200", "descripcion": "Escuela"}]', 0.00, 50.00, '50HR', 'ACTIVO');
INSERT INTO public.aeronave (id_aeronave, codigo, modelo, tipo, activa, color, id_wb_plantilla, frecuencias_default, horas_acumuladas, horas_proxima_revision, tipo_proxima_revision, estado) VALUES (4, 'YS-127-P', 'ARROW', 'AVION', true, 'Blanco y rojo', 4, '[{"frecuencia": "121.900", "descripcion": "Torre MSSS"}, {"frecuencia": "118.300", "descripcion": "Torre"}, {"frecuencia": "129.225", "descripcion": "Aprox"}, {"frecuencia": "129.200", "descripcion": "Escuela"}]', 0.00, 50.00, '50HR', 'ACTIVO');
INSERT INTO public.aeronave (id_aeronave, codigo, modelo, tipo, activa, color, id_wb_plantilla, frecuencias_default, horas_acumuladas, horas_proxima_revision, tipo_proxima_revision, estado) VALUES (3, 'YS-270-P', 'CHEROKEE', 'AVION', true, 'Blanco y rojo', 2, '[{"frecuencia": "121.900", "descripcion": "Torre MSSS"}, {"frecuencia": "118.300", "descripcion": "Torre"}, {"frecuencia": "129.225", "descripcion": "Aprox"}, {"frecuencia": "129.200", "descripcion": "Escuela"}]', 3.50, 50.00, '50HR', 'ACTIVO');
INSERT INTO public.aeronave (id_aeronave, codigo, modelo, tipo, activa, color, id_wb_plantilla, frecuencias_default, horas_acumuladas, horas_proxima_revision, tipo_proxima_revision, estado) VALUES (1, 'YS-334-PE', 'CESSNA-152', 'AVION', true, 'Blanco y azul', 1, '[{"frecuencia": "121.900", "descripcion": "Torre MSSS"}, {"frecuencia": "118.300", "descripcion": "Torre"}, {"frecuencia": "129.225", "descripcion": "Aprox"}, {"frecuencia": "129.200", "descripcion": "Escuela"}]', 47.00, 50.00, '50HR', 'ACTIVO');



--

-- ── usuario ────────────────────────────────────
--


INSERT INTO public.usuario (id_usuario, nombre, apellido, correo, password_hash, rol, activo, fecha_creacion, must_change_password, username, must_set_email, failed_login_count, locked_until) VALUES (8, 'Alfredo', 'Rodriguez', 'instructor@demo.com', 'demo123', 'INSTRUCTOR', true, '2026-01-20 19:57:59.908712', true, 'u8', true, 0, '2026-04-08 10:00:41.540173');
INSERT INTO public.usuario (id_usuario, nombre, apellido, correo, password_hash, rol, activo, fecha_creacion, must_change_password, username, must_set_email, failed_login_count, locked_until) VALUES (3, 'Juan', 'Pérez', 'jperez@demo.com', 'demo123', 'ALUMNO', true, '2026-01-20 19:57:59.908712', false, 'u3', false, 0, NULL);
INSERT INTO public.usuario (id_usuario, nombre, apellido, correo, password_hash, rol, activo, fecha_creacion, must_change_password, username, must_set_email, failed_login_count, locked_until) VALUES (7, 'Sofia', 'Hernandez', 'shernandez@demo.com', 'demo123', 'ALUMNO', true, '2026-02-02 20:40:21.378024', false, 'u7', false, 0, NULL);
INSERT INTO public.usuario (id_usuario, nombre, apellido, correo, password_hash, rol, activo, fecha_creacion, must_change_password, username, must_set_email, failed_login_count, locked_until) VALUES (9, 'Maria', 'Sanchez', 'tutor@demo.com', 'demo123', 'TURNO', true, '2026-01-20 19:57:59.908712', false, 'u9', false, 0, NULL);
INSERT INTO public.usuario (id_usuario, nombre, apellido, correo, password_hash, rol, activo, fecha_creacion, must_change_password, username, must_set_email, failed_login_count, locked_until) VALUES (2, 'Prog', 'Horario', 'prog@demo1.com', 'demo123', 'PROGRAMACION', true, '2026-01-20 19:57:59.908712', false, 'u2', false, 0, NULL);
INSERT INTO public.usuario (id_usuario, nombre, apellido, correo, password_hash, rol, activo, fecha_creacion, must_change_password, username, must_set_email, failed_login_count, locked_until) VALUES (6, 'Ricardo', 'Henríquez', 'rhenriquez@demo.com', 'demo123', 'INSTRUCTOR', true, '2026-01-20 19:58:12.395039', false, 'u6', false, 0, NULL);
INSERT INTO public.usuario (id_usuario, nombre, apellido, correo, password_hash, rol, activo, fecha_creacion, must_change_password, username, must_set_email, failed_login_count, locked_until) VALUES (4, 'Carlos', 'Quevedo', 'cquevedo@demo.com', 'demo123', 'ALUMNO', true, '2026-01-20 19:57:59.908712', false, 'u4', false, 0, NULL);
INSERT INTO public.usuario (id_usuario, nombre, apellido, correo, password_hash, rol, activo, fecha_creacion, must_change_password, username, must_set_email, failed_login_count, locked_until) VALUES (5, 'Daniel', 'Aguilar', 'daguilar@demo.com', 'demo123', 'ALUMNO', true, '2026-01-20 19:57:59.908712', false, 'u5', false, 0, NULL);
INSERT INTO public.usuario (id_usuario, nombre, apellido, correo, password_hash, rol, activo, fecha_creacion, must_change_password, username, must_set_email, failed_login_count, locked_until) VALUES (1, 'Admin', 'Sistema', 'admin@demo.com', 'demo123', 'ADMIN', true, '2026-01-20 19:57:59.908712', false, 'u1', false, 0, NULL);
INSERT INTO public.usuario (id_usuario, nombre, apellido, correo, password_hash, rol, activo, fecha_creacion, must_change_password, username, must_set_email, failed_login_count, locked_until) VALUES (11, 'Administración Financiera', 'CAAA', 'administracion@caaa-sv.com', '$2b$10$Rp.1FrHhKmwQuVwxFw0Lhe6T6q2hxqXLvfXf1g.0LBP1tCdLhYxYa', 'ADMINISTRACION', true, '2026-05-19 12:58:47.629003', true, 'u_admin_fin', true, 0, NULL);



--

-- ── instructor ────────────────────────────────────
--


INSERT INTO public.instructor (id_instructor, id_usuario, activo) VALUES (1, 6, true);
INSERT INTO public.instructor (id_instructor, id_usuario, activo) VALUES (2, 8, true);



--

-- ── alumno ────────────────────────────────────
--


INSERT INTO public.alumno (id_alumno, id_usuario, id_instructor, id_licencia, numero_licencia, activo, soleado, telefono, certificado_medico, horas_acumuladas) VALUES (1, 4, 1, 1, '1234', true, false, NULL, NULL, 2.17);
INSERT INTO public.alumno (id_alumno, id_usuario, id_instructor, id_licencia, numero_licencia, activo, soleado, telefono, certificado_medico, horas_acumuladas) VALUES (2, 5, 1, 2, '5678', true, true, NULL, NULL, 1.33);
INSERT INTO public.alumno (id_alumno, id_usuario, id_instructor, id_licencia, numero_licencia, activo, soleado, telefono, certificado_medico, horas_acumuladas) VALUES (3, 7, 1, 3, '3691', true, true, NULL, NULL, 0.00);



--

-- ── bloque_bloqueado_dia ────────────────────────────────────
--


INSERT INTO public.bloque_bloqueado_dia (id_bloque, dia_semana, motivo) VALUES (5, 1, 'ALMUERZO');
INSERT INTO public.bloque_bloqueado_dia (id_bloque, dia_semana, motivo) VALUES (5, 2, 'ALMUERZO');
INSERT INTO public.bloque_bloqueado_dia (id_bloque, dia_semana, motivo) VALUES (5, 3, 'ALMUERZO');
INSERT INTO public.bloque_bloqueado_dia (id_bloque, dia_semana, motivo) VALUES (5, 4, 'ALMUERZO');
INSERT INTO public.bloque_bloqueado_dia (id_bloque, dia_semana, motivo) VALUES (5, 5, 'ALMUERZO');
INSERT INTO public.bloque_bloqueado_dia (id_bloque, dia_semana, motivo) VALUES (6, 6, 'ALMUERZO');



--

-- ── semana_vuelo ────────────────────────────────────
--


INSERT INTO public.semana_vuelo (id_semana, fecha_inicio, fecha_fin, publicada, fecha_publicacion) VALUES (1, '2026-04-13', '2026-04-19', true, '2026-04-06 13:57:16.751504');
INSERT INTO public.semana_vuelo (id_semana, fecha_inicio, fecha_fin, publicada, fecha_publicacion) VALUES (2, '2026-04-20', '2026-04-26', false, NULL);
INSERT INTO public.semana_vuelo (id_semana, fecha_inicio, fecha_fin, publicada, fecha_publicacion) VALUES (3, '2026-04-06', '2026-04-12', true, NULL);



--

-- ── solicitud_semana ────────────────────────────────────
--


INSERT INTO public.solicitud_semana (id_solicitud, id_semana, id_alumno, estado, fecha_creacion, fecha_actualizacion, limite_vuelos) VALUES (1, 1, 2, 'PUBLICADO', '2026-04-06 13:54:19.135882', '2026-04-06 13:57:16.751504', NULL);
INSERT INTO public.solicitud_semana (id_solicitud, id_semana, id_alumno, estado, fecha_creacion, fecha_actualizacion, limite_vuelos) VALUES (2, 1, 1, 'PUBLICADO', '2026-04-06 13:54:50.704064', '2026-04-06 13:57:16.751504', NULL);
INSERT INTO public.solicitud_semana (id_solicitud, id_semana, id_alumno, estado, fecha_creacion, fecha_actualizacion, limite_vuelos) VALUES (3, 1, 3, 'PUBLICADO', '2026-04-06 13:55:06.375933', '2026-04-08 10:06:27.490235', 6);



--

-- ── solicitud_vuelo ────────────────────────────────────
--


INSERT INTO public.solicitud_vuelo (id_detalle, id_solicitud, id_aeronave, dia_semana, id_bloque, id_semana) VALUES (5, 2, 1, 2, 6, 1);
INSERT INTO public.solicitud_vuelo (id_detalle, id_solicitud, id_aeronave, dia_semana, id_bloque, id_semana) VALUES (6, 2, 5, 3, 7, 1);
INSERT INTO public.solicitud_vuelo (id_detalle, id_solicitud, id_aeronave, dia_semana, id_bloque, id_semana) VALUES (7, 3, 1, 3, 7, 1);
INSERT INTO public.solicitud_vuelo (id_detalle, id_solicitud, id_aeronave, dia_semana, id_bloque, id_semana) VALUES (8, 3, 2, 4, 7, 1);
INSERT INTO public.solicitud_vuelo (id_detalle, id_solicitud, id_aeronave, dia_semana, id_bloque, id_semana) VALUES (1, 1, 4, 1, 6, 1);
INSERT INTO public.solicitud_vuelo (id_detalle, id_solicitud, id_aeronave, dia_semana, id_bloque, id_semana) VALUES (3, 1, 4, 5, 6, 1);
INSERT INTO public.solicitud_vuelo (id_detalle, id_solicitud, id_aeronave, dia_semana, id_bloque, id_semana) VALUES (4, 2, 3, 1, 7, 1);
INSERT INTO public.solicitud_vuelo (id_detalle, id_solicitud, id_aeronave, dia_semana, id_bloque, id_semana) VALUES (2, 1, 1, 3, 4, 1);
INSERT INTO public.solicitud_vuelo (id_detalle, id_solicitud, id_aeronave, dia_semana, id_bloque, id_semana) VALUES (9, 3, 4, 5, 7, 1);



--

-- ── vuelo ────────────────────────────────────
--


INSERT INTO public.vuelo (id_vuelo, id_semana, id_alumno, id_instructor, id_aeronave, dia_semana, id_bloque, estado, creado_por, fecha_creacion, id_detalle, fecha_vuelo, tipo_cancelacion, justificacion_cancelacion, archivo_cancelacion, cancelado_por_id_usuario, fecha_cancelacion, duracion_estimada_min, tiempo_vuelo_min) VALUES (1, 1, 1, 1, 1, 2, 6, 'PUBLICADO', 'ADMIN', '2026-04-06 13:57:16.751504', 5, '2026-04-14', NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.vuelo (id_vuelo, id_semana, id_alumno, id_instructor, id_aeronave, dia_semana, id_bloque, estado, creado_por, fecha_creacion, id_detalle, fecha_vuelo, tipo_cancelacion, justificacion_cancelacion, archivo_cancelacion, cancelado_por_id_usuario, fecha_cancelacion, duracion_estimada_min, tiempo_vuelo_min) VALUES (2, 1, 1, 1, 5, 3, 7, 'PUBLICADO', 'ADMIN', '2026-04-06 13:57:16.751504', 6, '2026-04-15', NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.vuelo (id_vuelo, id_semana, id_alumno, id_instructor, id_aeronave, dia_semana, id_bloque, estado, creado_por, fecha_creacion, id_detalle, fecha_vuelo, tipo_cancelacion, justificacion_cancelacion, archivo_cancelacion, cancelado_por_id_usuario, fecha_cancelacion, duracion_estimada_min, tiempo_vuelo_min) VALUES (3, 1, 3, 1, 1, 3, 7, 'PUBLICADO', 'ADMIN', '2026-04-06 13:57:16.751504', 7, '2026-04-15', NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.vuelo (id_vuelo, id_semana, id_alumno, id_instructor, id_aeronave, dia_semana, id_bloque, estado, creado_por, fecha_creacion, id_detalle, fecha_vuelo, tipo_cancelacion, justificacion_cancelacion, archivo_cancelacion, cancelado_por_id_usuario, fecha_cancelacion, duracion_estimada_min, tiempo_vuelo_min) VALUES (4, 1, 3, 1, 2, 4, 7, 'PUBLICADO', 'ADMIN', '2026-04-06 13:57:16.751504', 8, '2026-04-16', NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.vuelo (id_vuelo, id_semana, id_alumno, id_instructor, id_aeronave, dia_semana, id_bloque, estado, creado_por, fecha_creacion, id_detalle, fecha_vuelo, tipo_cancelacion, justificacion_cancelacion, archivo_cancelacion, cancelado_por_id_usuario, fecha_cancelacion, duracion_estimada_min, tiempo_vuelo_min) VALUES (6, 1, 2, 1, 4, 5, 6, 'PUBLICADO', 'ADMIN', '2026-04-06 13:57:16.751504', 3, '2026-04-17', NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.vuelo (id_vuelo, id_semana, id_alumno, id_instructor, id_aeronave, dia_semana, id_bloque, estado, creado_por, fecha_creacion, id_detalle, fecha_vuelo, tipo_cancelacion, justificacion_cancelacion, archivo_cancelacion, cancelado_por_id_usuario, fecha_cancelacion, duracion_estimada_min, tiempo_vuelo_min) VALUES (8, 1, 2, 1, 1, 3, 4, 'PUBLICADO', 'ADMIN', '2026-04-06 13:57:16.751504', 2, '2026-04-15', NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.vuelo (id_vuelo, id_semana, id_alumno, id_instructor, id_aeronave, dia_semana, id_bloque, estado, creado_por, fecha_creacion, id_detalle, fecha_vuelo, tipo_cancelacion, justificacion_cancelacion, archivo_cancelacion, cancelado_por_id_usuario, fecha_cancelacion, duracion_estimada_min, tiempo_vuelo_min) VALUES (9, 1, 3, 1, 4, 5, 7, 'PUBLICADO', 'ADMIN', '2026-04-06 13:57:16.751504', 9, '2026-04-17', NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.vuelo (id_vuelo, id_semana, id_alumno, id_instructor, id_aeronave, dia_semana, id_bloque, estado, creado_por, fecha_creacion, id_detalle, fecha_vuelo, tipo_cancelacion, justificacion_cancelacion, archivo_cancelacion, cancelado_por_id_usuario, fecha_cancelacion, duracion_estimada_min, tiempo_vuelo_min) VALUES (10, 3, 1, 1, 3, 5, 6, 'PUBLICADO', 'ADMIN', '2026-04-07 20:06:23.184655', NULL, '2026-04-09', NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.vuelo (id_vuelo, id_semana, id_alumno, id_instructor, id_aeronave, dia_semana, id_bloque, estado, creado_por, fecha_creacion, id_detalle, fecha_vuelo, tipo_cancelacion, justificacion_cancelacion, archivo_cancelacion, cancelado_por_id_usuario, fecha_cancelacion, duracion_estimada_min, tiempo_vuelo_min) VALUES (11, 3, 1, 1, 3, 3, 6, 'PUBLICADO', 'ADMIN', '2026-04-07 20:06:23.184655', NULL, '2026-04-08', NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.vuelo (id_vuelo, id_semana, id_alumno, id_instructor, id_aeronave, dia_semana, id_bloque, estado, creado_por, fecha_creacion, id_detalle, fecha_vuelo, tipo_cancelacion, justificacion_cancelacion, archivo_cancelacion, cancelado_por_id_usuario, fecha_cancelacion, duracion_estimada_min, tiempo_vuelo_min) VALUES (12, 3, 1, 1, 3, 3, 2, 'COMPLETADO', 'ADMIN', '2026-04-07 20:06:23.184655', NULL, '2026-04-08', NULL, NULL, NULL, NULL, NULL, 60, 60.00);
INSERT INTO public.vuelo (id_vuelo, id_semana, id_alumno, id_instructor, id_aeronave, dia_semana, id_bloque, estado, creado_por, fecha_creacion, id_detalle, fecha_vuelo, tipo_cancelacion, justificacion_cancelacion, archivo_cancelacion, cancelado_por_id_usuario, fecha_cancelacion, duracion_estimada_min, tiempo_vuelo_min) VALUES (13, 3, 1, 1, 3, 3, 3, 'COMPLETADO', 'ADMIN', '2026-04-07 20:06:23.184655', NULL, '2026-04-08', NULL, NULL, NULL, NULL, NULL, 60, 70.00);
INSERT INTO public.vuelo (id_vuelo, id_semana, id_alumno, id_instructor, id_aeronave, dia_semana, id_bloque, estado, creado_por, fecha_creacion, id_detalle, fecha_vuelo, tipo_cancelacion, justificacion_cancelacion, archivo_cancelacion, cancelado_por_id_usuario, fecha_cancelacion, duracion_estimada_min, tiempo_vuelo_min) VALUES (14, 3, 2, 1, 3, 3, 3, 'COMPLETADO', 'ADMIN', '2026-04-07 20:06:23.184655', NULL, '2026-04-08', NULL, NULL, NULL, NULL, NULL, 60, 80.00);
INSERT INTO public.vuelo (id_vuelo, id_semana, id_alumno, id_instructor, id_aeronave, dia_semana, id_bloque, estado, creado_por, fecha_creacion, id_detalle, fecha_vuelo, tipo_cancelacion, justificacion_cancelacion, archivo_cancelacion, cancelado_por_id_usuario, fecha_cancelacion, duracion_estimada_min, tiempo_vuelo_min) VALUES (5, 1, 2, 1, 4, 1, 6, 'COMPLETADO', 'ADMIN', '2026-04-06 13:57:16.751504', 1, '2026-04-13', NULL, NULL, NULL, NULL, NULL, NULL, 65.00);
INSERT INTO public.vuelo (id_vuelo, id_semana, id_alumno, id_instructor, id_aeronave, dia_semana, id_bloque, estado, creado_por, fecha_creacion, id_detalle, fecha_vuelo, tipo_cancelacion, justificacion_cancelacion, archivo_cancelacion, cancelado_por_id_usuario, fecha_cancelacion, duracion_estimada_min, tiempo_vuelo_min) VALUES (7, 1, 1, 1, 3, 1, 7, 'COMPLETADO', 'ADMIN', '2026-04-06 13:57:16.751504', 4, '2026-04-13', NULL, NULL, NULL, NULL, NULL, NULL, 60.00);



--

-- ── checklist_postvuelo ────────────────────────────────────
--


INSERT INTO public.checklist_postvuelo (id_checklist, id_vuelo, freno_parqueo, mezcla_corte, magnetos_off, master_switch_off, llaves_removidas, calzos_colocados, fuselaje_sin_danos, bordes_ataque_sin_impactos, alerones_libres, tapas_combustible, sin_fugas_combustible, llantas_buen_estado, helice_sin_melladuras, aceite_en_rango, cowling_asegurado, switches_breakers_off, horas_registradas, combustible_anotado, discrepancias_reportadas, comentarios, firma_piloto, licencia_numero, creado_en) VALUES (1, 7, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, 'asdasdasd', 'data:image/png;base64,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', '', '2026-04-13 22:20:31.142411');



--

-- ── cuenta_corriente_alumno ────────────────────────────────────
--


INSERT INTO public.cuenta_corriente_alumno (id_alumno, saldo_actual_usd, ultimo_movimiento_en, ultima_factura_correlativo, creado_en) VALUES (1, 7118.01, '2025-09-12 00:00:00', NULL, '2026-05-19 12:58:47.629003');
INSERT INTO public.cuenta_corriente_alumno (id_alumno, saldo_actual_usd, ultimo_movimiento_en, ultima_factura_correlativo, creado_en) VALUES (2, 6127.50, '2026-04-15 00:00:00', NULL, '2026-05-19 12:58:47.629003');
INSERT INTO public.cuenta_corriente_alumno (id_alumno, saldo_actual_usd, ultimo_movimiento_en, ultima_factura_correlativo, creado_en) VALUES (3, 113.00, '2026-05-08 00:00:00', NULL, '2026-05-19 12:58:47.629003');



--

-- ── documento_alumno ────────────────────────────────────
--





--

-- ── egreso ────────────────────────────────────
--





--

-- ── estado_operaciones ────────────────────────────────────
--


INSERT INTO public.estado_operaciones (id_estado, beacon, viento, clima, estado_general, observaciones, actualizado_por, actualizado_en, motivo_inactivo) VALUES (1, true, NULL, NULL, 'ACTIVO', NULL, NULL, '2026-03-21 01:43:21.911817', NULL);



--

-- ── evaluacion ────────────────────────────────────
--





--

-- ── evaluacion_alumno ────────────────────────────────────
--





--

-- ── factura ────────────────────────────────────
--


INSERT INTO public.factura (id, numero_correlativo, id_alumno, fecha_emision, subtotal_usd, iva_usd, total_usd, estado, id_vuelo, concepto, pdf_path, emitida_por, motivo_anulacion) VALUES (1, 1, 1, '2025-07-28 00:00:00', 130.00, 0.00, 130.00, 'EMITIDA', NULL, 'Vuelo YS-334-PE 1.0h - H. Amaya', NULL, NULL, NULL);
INSERT INTO public.factura (id, numero_correlativo, id_alumno, fecha_emision, subtotal_usd, iva_usd, total_usd, estado, id_vuelo, concepto, pdf_path, emitida_por, motivo_anulacion) VALUES (2, 2, 1, '2025-07-28 00:00:00', 85.00, 0.00, 85.00, 'EMITIDA', NULL, 'Sim BATD II 1.0h - J. Burgos', NULL, NULL, NULL);
INSERT INTO public.factura (id, numero_correlativo, id_alumno, fecha_emision, subtotal_usd, iva_usd, total_usd, estado, id_vuelo, concepto, pdf_path, emitida_por, motivo_anulacion) VALUES (3, 3, 1, '2025-07-30 00:00:00', 85.00, 0.00, 85.00, 'EMITIDA', NULL, 'Sim BATD II 1.0h - H. Amaya', NULL, NULL, NULL);
INSERT INTO public.factura (id, numero_correlativo, id_alumno, fecha_emision, subtotal_usd, iva_usd, total_usd, estado, id_vuelo, concepto, pdf_path, emitida_por, motivo_anulacion) VALUES (4, 4, 1, '2025-07-30 00:00:00', 130.00, 0.00, 130.00, 'EMITIDA', NULL, 'Vuelo YS-333-PE 1.0h - C. Cáceres', NULL, NULL, NULL);
INSERT INTO public.factura (id, numero_correlativo, id_alumno, fecha_emision, subtotal_usd, iva_usd, total_usd, estado, id_vuelo, concepto, pdf_path, emitida_por, motivo_anulacion) VALUES (5, 5, 1, '2025-08-07 00:00:00', 143.00, 0.00, 143.00, 'EMITIDA', NULL, 'Vuelo YS-334-PE 1.1h - S. Muñoz', NULL, NULL, NULL);
INSERT INTO public.factura (id, numero_correlativo, id_alumno, fecha_emision, subtotal_usd, iva_usd, total_usd, estado, id_vuelo, concepto, pdf_path, emitida_por, motivo_anulacion) VALUES (6, 6, 1, '2025-08-08 00:00:00', 130.00, 0.00, 130.00, 'EMITIDA', NULL, 'Vuelo YS-334-PE 1.0h - C. Cáceres', NULL, NULL, NULL);
INSERT INTO public.factura (id, numero_correlativo, id_alumno, fecha_emision, subtotal_usd, iva_usd, total_usd, estado, id_vuelo, concepto, pdf_path, emitida_por, motivo_anulacion) VALUES (7, 7, 1, '2025-08-08 00:00:00', 169.00, 0.00, 169.00, 'EMITIDA', NULL, 'Vuelo YS-334-PE 1.3h - J. Muñoz', NULL, NULL, NULL);
INSERT INTO public.factura (id, numero_correlativo, id_alumno, fecha_emision, subtotal_usd, iva_usd, total_usd, estado, id_vuelo, concepto, pdf_path, emitida_por, motivo_anulacion) VALUES (8, 8, 1, '2025-08-12 00:00:00', 156.00, 0.00, 156.00, 'EMITIDA', NULL, 'Vuelo YS-333-PE 1.2h - H. Amaya', NULL, NULL, NULL);
INSERT INTO public.factura (id, numero_correlativo, id_alumno, fecha_emision, subtotal_usd, iva_usd, total_usd, estado, id_vuelo, concepto, pdf_path, emitida_por, motivo_anulacion) VALUES (9, 9, 1, '2025-09-12 00:00:00', 169.00, 0.00, 169.00, 'EMITIDA', NULL, 'Vuelo YS-333-PE 1.3h - H. Amaya', NULL, NULL, NULL);
INSERT INTO public.factura (id, numero_correlativo, id_alumno, fecha_emision, subtotal_usd, iva_usd, total_usd, estado, id_vuelo, concepto, pdf_path, emitida_por, motivo_anulacion) VALUES (10, 10, 2, '2026-02-03 00:00:00', 90.00, 0.00, 90.00, 'EMITIDA', NULL, 'Sim BATD II 1.0h - H. Amaya', NULL, NULL, NULL);
INSERT INTO public.factura (id, numero_correlativo, id_alumno, fecha_emision, subtotal_usd, iva_usd, total_usd, estado, id_vuelo, concepto, pdf_path, emitida_por, motivo_anulacion) VALUES (11, 11, 2, '2026-02-10 00:00:00', 135.00, 0.00, 135.00, 'EMITIDA', NULL, 'Vuelo Cessna 152 1.0h - C. Cáceres', NULL, NULL, NULL);
INSERT INTO public.factura (id, numero_correlativo, id_alumno, fecha_emision, subtotal_usd, iva_usd, total_usd, estado, id_vuelo, concepto, pdf_path, emitida_por, motivo_anulacion) VALUES (12, 12, 2, '2026-02-15 00:00:00', 162.00, 0.00, 162.00, 'EMITIDA', NULL, 'Vuelo Cessna 152 1.2h - C. Cáceres', NULL, NULL, NULL);
INSERT INTO public.factura (id, numero_correlativo, id_alumno, fecha_emision, subtotal_usd, iva_usd, total_usd, estado, id_vuelo, concepto, pdf_path, emitida_por, motivo_anulacion) VALUES (13, 13, 2, '2026-02-22 00:00:00', 202.50, 0.00, 202.50, 'EMITIDA', NULL, 'Vuelo Cessna 152 1.5h - H. Amaya', NULL, NULL, NULL);
INSERT INTO public.factura (id, numero_correlativo, id_alumno, fecha_emision, subtotal_usd, iva_usd, total_usd, estado, id_vuelo, concepto, pdf_path, emitida_por, motivo_anulacion) VALUES (14, 14, 2, '2026-03-12 00:00:00', 270.00, 0.00, 270.00, 'EMITIDA', NULL, 'Vuelo Cessna 152 2.0h - H. Amaya', NULL, NULL, NULL);
INSERT INTO public.factura (id, numero_correlativo, id_alumno, fecha_emision, subtotal_usd, iva_usd, total_usd, estado, id_vuelo, concepto, pdf_path, emitida_por, motivo_anulacion) VALUES (15, 15, 2, '2026-03-19 00:00:00', 175.50, 0.00, 175.50, 'EMITIDA', NULL, 'Vuelo Cessna 152 1.3h - C. Cáceres', NULL, NULL, NULL);
INSERT INTO public.factura (id, numero_correlativo, id_alumno, fecha_emision, subtotal_usd, iva_usd, total_usd, estado, id_vuelo, concepto, pdf_path, emitida_por, motivo_anulacion) VALUES (16, 16, 2, '2026-04-02 00:00:00', 216.00, 0.00, 216.00, 'EMITIDA', NULL, 'Vuelo Cessna 152 1.6h - H. Amaya', NULL, NULL, NULL);
INSERT INTO public.factura (id, numero_correlativo, id_alumno, fecha_emision, subtotal_usd, iva_usd, total_usd, estado, id_vuelo, concepto, pdf_path, emitida_por, motivo_anulacion) VALUES (17, 17, 2, '2026-04-15 00:00:00', 121.50, 0.00, 121.50, 'EMITIDA', NULL, 'Vuelo Cessna 152 0.9h - H. Amaya', NULL, NULL, NULL);
INSERT INTO public.factura (id, numero_correlativo, id_alumno, fecha_emision, subtotal_usd, iva_usd, total_usd, estado, id_vuelo, concepto, pdf_path, emitida_por, motivo_anulacion) VALUES (18, 18, 3, '2026-01-08 00:00:00', 400.00, 0.00, 400.00, 'EMITIDA', NULL, 'Vuelo Cherokee 180 2.0h - C. Cáceres', NULL, NULL, NULL);
INSERT INTO public.factura (id, numero_correlativo, id_alumno, fecha_emision, subtotal_usd, iva_usd, total_usd, estado, id_vuelo, concepto, pdf_path, emitida_por, motivo_anulacion) VALUES (19, 19, 3, '2026-01-22 00:00:00', 660.00, 0.00, 660.00, 'EMITIDA', NULL, 'Vuelo Cherokee Arrow 3.0h - H. Amaya', NULL, NULL, NULL);
INSERT INTO public.factura (id, numero_correlativo, id_alumno, fecha_emision, subtotal_usd, iva_usd, total_usd, estado, id_vuelo, concepto, pdf_path, emitida_por, motivo_anulacion) VALUES (20, 20, 3, '2026-02-05 00:00:00', 880.00, 0.00, 880.00, 'EMITIDA', NULL, 'Vuelo Cherokee Arrow 4.0h - H. Amaya', NULL, NULL, NULL);
INSERT INTO public.factura (id, numero_correlativo, id_alumno, fecha_emision, subtotal_usd, iva_usd, total_usd, estado, id_vuelo, concepto, pdf_path, emitida_por, motivo_anulacion) VALUES (21, 21, 3, '2026-02-26 00:00:00', 990.00, 0.00, 990.00, 'EMITIDA', NULL, 'Vuelo Cherokee Arrow 4.5h - H. Amaya', NULL, NULL, NULL);
INSERT INTO public.factura (id, numero_correlativo, id_alumno, fecha_emision, subtotal_usd, iva_usd, total_usd, estado, id_vuelo, concepto, pdf_path, emitida_por, motivo_anulacion) VALUES (22, 22, 3, '2026-03-15 00:00:00', 440.00, 0.00, 440.00, 'EMITIDA', NULL, 'Vuelo Cherokee 180 2.2h - C. Cáceres', NULL, NULL, NULL);
INSERT INTO public.factura (id, numero_correlativo, id_alumno, fecha_emision, subtotal_usd, iva_usd, total_usd, estado, id_vuelo, concepto, pdf_path, emitida_por, motivo_anulacion) VALUES (23, 23, 3, '2026-04-18 00:00:00', 297.00, 0.00, 297.00, 'EMITIDA', NULL, 'Vuelo Cherokee Arrow 1.35h - H. Amaya', NULL, NULL, NULL);
INSERT INTO public.factura (id, numero_correlativo, id_alumno, fecha_emision, subtotal_usd, iva_usd, total_usd, estado, id_vuelo, concepto, pdf_path, emitida_por, motivo_anulacion) VALUES (24, 24, 3, '2026-05-08 00:00:00', 270.00, 0.00, 270.00, 'EMITIDA', NULL, 'Vuelo Cessna 152 2.0h - J. Burgos', NULL, NULL, NULL);



--

-- ── factura_detalle ────────────────────────────────────
--





--

-- ── inscripcion_curso ────────────────────────────────────
--





--

-- ── inscripcion_curso_avance ────────────────────────────────────
--





--

-- ── loadsheet ────────────────────────────────────
--


INSERT INTO public.loadsheet (id_loadsheet, id_vuelo, power_setting, fuel_flow, dep_atis, arr_atis, taxi_fuel, trip_fuel, reserve_rr, alt1_fuel, alt2_fuel, final_reserve, min_req, extra, tfob, tod_min, ld_min, etd, eta, eet, atd, ata, notas, estado, archivo_pdf, creado_en, actualizado_en) VALUES (5, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 168.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'ENVIADO', NULL, '2026-04-06 19:54:46.123513', '2026-04-06 19:54:46.123513');
INSERT INTO public.loadsheet (id_loadsheet, id_vuelo, power_setting, fuel_flow, dep_atis, arr_atis, taxi_fuel, trip_fuel, reserve_rr, alt1_fuel, alt2_fuel, final_reserve, min_req, extra, tfob, tod_min, ld_min, etd, eta, eet, atd, ata, notas, estado, archivo_pdf, creado_en, actualizado_en) VALUES (6, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 180.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'ENVIADO', NULL, '2026-04-06 22:46:53.562141', '2026-04-06 22:47:30.80049');
INSERT INTO public.loadsheet (id_loadsheet, id_vuelo, power_setting, fuel_flow, dep_atis, arr_atis, taxi_fuel, trip_fuel, reserve_rr, alt1_fuel, alt2_fuel, final_reserve, min_req, extra, tfob, tod_min, ld_min, etd, eta, eet, atd, ata, notas, estado, archivo_pdf, creado_en, actualizado_en) VALUES (3, 7, NULL, NULL, NULL, NULL, 12.00, 40.00, 10.00, 10.00, 10.00, 20.00, 12.00, NULL, 240.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'BORRADOR', NULL, '2026-04-06 19:44:01.315704', '2026-04-08 11:06:52.017115');



--

-- ── loadsheet_waypoint ────────────────────────────────────
--


INSERT INTO public.loadsheet_waypoint (id_waypoint, id_loadsheet, orden, waypoint, altitud_fl, wind_vel, tc, variacion, mc, wca, mh, desviacion, ch, tas, gs, distancia_nm, eta, ata, fuel_req, fuel_act) VALUES (7, 5, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.loadsheet_waypoint (id_waypoint, id_loadsheet, orden, waypoint, altitud_fl, wind_vel, tc, variacion, mc, wca, mh, desviacion, ch, tas, gs, distancia_nm, eta, ata, fuel_req, fuel_act) VALUES (8, 5, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.loadsheet_waypoint (id_waypoint, id_loadsheet, orden, waypoint, altitud_fl, wind_vel, tc, variacion, mc, wca, mh, desviacion, ch, tas, gs, distancia_nm, eta, ata, fuel_req, fuel_act) VALUES (9, 5, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.loadsheet_waypoint (id_waypoint, id_loadsheet, orden, waypoint, altitud_fl, wind_vel, tc, variacion, mc, wca, mh, desviacion, ch, tas, gs, distancia_nm, eta, ata, fuel_req, fuel_act) VALUES (13, 6, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.loadsheet_waypoint (id_waypoint, id_loadsheet, orden, waypoint, altitud_fl, wind_vel, tc, variacion, mc, wca, mh, desviacion, ch, tas, gs, distancia_nm, eta, ata, fuel_req, fuel_act) VALUES (14, 6, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.loadsheet_waypoint (id_waypoint, id_loadsheet, orden, waypoint, altitud_fl, wind_vel, tc, variacion, mc, wca, mh, desviacion, ch, tas, gs, distancia_nm, eta, ata, fuel_req, fuel_act) VALUES (15, 6, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.loadsheet_waypoint (id_waypoint, id_loadsheet, orden, waypoint, altitud_fl, wind_vel, tc, variacion, mc, wca, mh, desviacion, ch, tas, gs, distancia_nm, eta, ata, fuel_req, fuel_act) VALUES (16, 3, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.loadsheet_waypoint (id_waypoint, id_loadsheet, orden, waypoint, altitud_fl, wind_vel, tc, variacion, mc, wca, mh, desviacion, ch, tas, gs, distancia_nm, eta, ata, fuel_req, fuel_act) VALUES (17, 3, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.loadsheet_waypoint (id_waypoint, id_loadsheet, orden, waypoint, altitud_fl, wind_vel, tc, variacion, mc, wca, mh, desviacion, ch, tas, gs, distancia_nm, eta, ata, fuel_req, fuel_act) VALUES (18, 3, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);



--

-- ── mantenimiento_aeronave ────────────────────────────────────
--





--

-- ── mensaje_turno ────────────────────────────────────
--





--

-- ── movimiento_cuenta ────────────────────────────────────
--


INSERT INTO public.movimiento_cuenta (id, id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd, id_vuelo, id_factura, id_recibo, generado_automatico, registrado_por, anulado, motivo_anulacion, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, editado_en, editado_por, motivo_edicion) VALUES (4, 1, 'DEPOSITO', '2025-07-07 00:00:00', 'Pago teoría + 17.4 hrs vuelo IFR (Recibo #1)', 2771.67, 2771.67, NULL, NULL, 1, false, NULL, false, NULL, 'Recibo', NULL, NULL, 17.40, NULL, NULL, NULL);
INSERT INTO public.movimiento_cuenta (id, id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd, id_vuelo, id_factura, id_recibo, generado_automatico, registrado_por, anulado, motivo_anulacion, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, editado_en, editado_por, motivo_edicion) VALUES (5, 1, 'CARGO_VUELO', '2025-07-28 00:00:00', 'Vuelo YS-334-PE 1.0h - H. Amaya', -130.00, 2641.67, NULL, 1, NULL, true, NULL, false, NULL, 'H. Amaya', 'YS-334-PE', 1.00, 1.00, NULL, NULL, NULL);
INSERT INTO public.movimiento_cuenta (id, id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd, id_vuelo, id_factura, id_recibo, generado_automatico, registrado_por, anulado, motivo_anulacion, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, editado_en, editado_por, motivo_edicion) VALUES (6, 1, 'CARGO_VUELO', '2025-07-28 00:00:00', 'Sim BATD II 1.0h - J. Burgos', -85.00, 2556.67, NULL, 2, NULL, true, NULL, false, NULL, 'J. Burgos', 'SIM-1', 1.00, 2.00, NULL, NULL, NULL);
INSERT INTO public.movimiento_cuenta (id, id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd, id_vuelo, id_factura, id_recibo, generado_automatico, registrado_por, anulado, motivo_anulacion, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, editado_en, editado_por, motivo_edicion) VALUES (7, 1, 'CARGO_VUELO', '2025-07-30 00:00:00', 'Sim BATD II 1.0h - H. Amaya', -85.00, 2471.67, NULL, 3, NULL, true, NULL, false, NULL, 'H. Amaya', 'SIM-1', 1.00, 3.00, NULL, NULL, NULL);
INSERT INTO public.movimiento_cuenta (id, id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd, id_vuelo, id_factura, id_recibo, generado_automatico, registrado_por, anulado, motivo_anulacion, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, editado_en, editado_por, motivo_edicion) VALUES (8, 1, 'CARGO_VUELO', '2025-07-30 00:00:00', 'Vuelo YS-333-PE 1.0h - C. Cáceres', -130.00, 2341.67, NULL, 4, NULL, true, NULL, false, NULL, 'C. Cáceres', 'YS-333-PE', 1.00, 4.00, NULL, NULL, NULL);
INSERT INTO public.movimiento_cuenta (id, id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd, id_vuelo, id_factura, id_recibo, generado_automatico, registrado_por, anulado, motivo_anulacion, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, editado_en, editado_por, motivo_edicion) VALUES (9, 1, 'DEPOSITO', '2025-08-09 00:00:00', 'Pago 21.3 hrs Instrumentos (Recibo #2)', 2771.67, 5113.34, NULL, NULL, 2, false, NULL, false, NULL, 'Recibo', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.movimiento_cuenta (id, id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd, id_vuelo, id_factura, id_recibo, generado_automatico, registrado_por, anulado, motivo_anulacion, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, editado_en, editado_por, motivo_edicion) VALUES (10, 1, 'CARGO_VUELO', '2025-08-07 00:00:00', 'Vuelo YS-334-PE 1.1h - S. Muñoz', -143.00, 4970.34, NULL, 5, NULL, true, NULL, false, NULL, 'S. Muñoz', 'YS-334-PE', 1.10, 5.10, NULL, NULL, NULL);
INSERT INTO public.movimiento_cuenta (id, id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd, id_vuelo, id_factura, id_recibo, generado_automatico, registrado_por, anulado, motivo_anulacion, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, editado_en, editado_por, motivo_edicion) VALUES (11, 1, 'CARGO_VUELO', '2025-08-08 00:00:00', 'Vuelo YS-334-PE 1.0h - C. Cáceres', -130.00, 4840.34, NULL, 6, NULL, true, NULL, false, NULL, 'C. Cáceres', 'YS-334-PE', 1.00, 6.10, NULL, NULL, NULL);
INSERT INTO public.movimiento_cuenta (id, id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd, id_vuelo, id_factura, id_recibo, generado_automatico, registrado_por, anulado, motivo_anulacion, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, editado_en, editado_por, motivo_edicion) VALUES (12, 1, 'CARGO_VUELO', '2025-08-08 00:00:00', 'Vuelo YS-334-PE 1.3h - J. Muñoz', -169.00, 4671.34, NULL, 7, NULL, true, NULL, false, NULL, 'J. Muñoz', 'YS-334-PE', 1.30, 7.40, NULL, NULL, NULL);
INSERT INTO public.movimiento_cuenta (id, id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd, id_vuelo, id_factura, id_recibo, generado_automatico, registrado_por, anulado, motivo_anulacion, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, editado_en, editado_por, motivo_edicion) VALUES (13, 1, 'CARGO_VUELO', '2025-08-12 00:00:00', 'Vuelo YS-333-PE 1.2h - H. Amaya', -156.00, 4515.34, NULL, 8, NULL, true, NULL, false, NULL, 'H. Amaya', 'YS-333-PE', 1.20, 8.60, NULL, NULL, NULL);
INSERT INTO public.movimiento_cuenta (id, id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd, id_vuelo, id_factura, id_recibo, generado_automatico, registrado_por, anulado, motivo_anulacion, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, editado_en, editado_por, motivo_edicion) VALUES (14, 1, 'DEPOSITO', '2025-09-08 00:00:00', 'Pago 11.2 hrs IFR + 5h Maniobras (Recibo #3)', 2771.67, 7287.01, NULL, NULL, 3, false, NULL, false, NULL, 'Recibo', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.movimiento_cuenta (id, id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd, id_vuelo, id_factura, id_recibo, generado_automatico, registrado_por, anulado, motivo_anulacion, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, editado_en, editado_por, motivo_edicion) VALUES (15, 1, 'CARGO_VUELO', '2025-09-12 00:00:00', 'Vuelo YS-333-PE 1.3h - H. Amaya', -169.00, 7118.01, NULL, 9, NULL, true, NULL, false, NULL, 'H. Amaya', 'YS-333-PE', 1.30, 31.30, NULL, NULL, NULL);
INSERT INTO public.movimiento_cuenta (id, id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd, id_vuelo, id_factura, id_recibo, generado_automatico, registrado_por, anulado, motivo_anulacion, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, editado_en, editado_por, motivo_edicion) VALUES (16, 2, 'DEPOSITO', '2026-01-15 00:00:00', 'Pago inicial curso PP (Recibo #4)', 5000.00, 5000.00, NULL, NULL, 4, false, NULL, false, NULL, 'Recibo', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.movimiento_cuenta (id, id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd, id_vuelo, id_factura, id_recibo, generado_automatico, registrado_por, anulado, motivo_anulacion, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, editado_en, editado_por, motivo_edicion) VALUES (17, 2, 'CARGO_VUELO', '2026-02-03 00:00:00', 'Sim BATD II 1.0h - H. Amaya', -90.00, 4910.00, NULL, 10, NULL, true, NULL, false, NULL, 'H. Amaya', 'SIM-1', 1.00, 1.00, NULL, NULL, NULL);
INSERT INTO public.movimiento_cuenta (id, id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd, id_vuelo, id_factura, id_recibo, generado_automatico, registrado_por, anulado, motivo_anulacion, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, editado_en, editado_por, motivo_edicion) VALUES (18, 2, 'CARGO_VUELO', '2026-02-10 00:00:00', 'Vuelo Cessna 152 1.0h - C. Cáceres', -135.00, 4775.00, NULL, 11, NULL, true, NULL, false, NULL, 'C. Cáceres', 'YS-334-PE', 1.00, 2.00, NULL, NULL, NULL);
INSERT INTO public.movimiento_cuenta (id, id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd, id_vuelo, id_factura, id_recibo, generado_automatico, registrado_por, anulado, motivo_anulacion, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, editado_en, editado_por, motivo_edicion) VALUES (19, 2, 'CARGO_VUELO', '2026-02-15 00:00:00', 'Vuelo Cessna 152 1.2h - C. Cáceres', -162.00, 4613.00, NULL, 12, NULL, true, NULL, false, NULL, 'C. Cáceres', 'YS-334-PE', 1.20, 3.20, NULL, NULL, NULL);
INSERT INTO public.movimiento_cuenta (id, id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd, id_vuelo, id_factura, id_recibo, generado_automatico, registrado_por, anulado, motivo_anulacion, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, editado_en, editado_por, motivo_edicion) VALUES (20, 2, 'CARGO_VUELO', '2026-02-22 00:00:00', 'Vuelo Cessna 152 1.5h - H. Amaya', -202.50, 4410.50, NULL, 13, NULL, true, NULL, false, NULL, 'H. Amaya', 'YS-334-PE', 1.50, 4.70, NULL, NULL, NULL);
INSERT INTO public.movimiento_cuenta (id, id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd, id_vuelo, id_factura, id_recibo, generado_automatico, registrado_por, anulado, motivo_anulacion, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, editado_en, editado_por, motivo_edicion) VALUES (21, 2, 'DEPOSITO', '2026-03-05 00:00:00', 'Pago segunda cuota PP (Recibo #5)', 2500.00, 6910.50, NULL, NULL, 5, false, NULL, false, NULL, 'Recibo', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.movimiento_cuenta (id, id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd, id_vuelo, id_factura, id_recibo, generado_automatico, registrado_por, anulado, motivo_anulacion, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, editado_en, editado_por, motivo_edicion) VALUES (22, 2, 'CARGO_VUELO', '2026-03-12 00:00:00', 'Vuelo Cessna 152 2.0h - H. Amaya (navegación)', -270.00, 6640.50, NULL, 14, NULL, true, NULL, false, NULL, 'H. Amaya', 'YS-334-PE', 2.00, 6.70, NULL, NULL, NULL);
INSERT INTO public.movimiento_cuenta (id, id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd, id_vuelo, id_factura, id_recibo, generado_automatico, registrado_por, anulado, motivo_anulacion, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, editado_en, editado_por, motivo_edicion) VALUES (23, 2, 'CARGO_VUELO', '2026-03-19 00:00:00', 'Vuelo Cessna 152 1.3h - C. Cáceres', -175.50, 6465.00, NULL, 15, NULL, true, NULL, false, NULL, 'C. Cáceres', 'YS-334-PE', 1.30, 8.00, NULL, NULL, NULL);
INSERT INTO public.movimiento_cuenta (id, id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd, id_vuelo, id_factura, id_recibo, generado_automatico, registrado_por, anulado, motivo_anulacion, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, editado_en, editado_por, motivo_edicion) VALUES (24, 2, 'CARGO_VUELO', '2026-04-02 00:00:00', 'Vuelo Cessna 152 1.6h - H. Amaya', -216.00, 6249.00, NULL, 16, NULL, true, NULL, false, NULL, 'H. Amaya', 'YS-334-PE', 1.60, 9.60, NULL, NULL, NULL);
INSERT INTO public.movimiento_cuenta (id, id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd, id_vuelo, id_factura, id_recibo, generado_automatico, registrado_por, anulado, motivo_anulacion, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, editado_en, editado_por, motivo_edicion) VALUES (25, 2, 'CARGO_VUELO', '2026-04-15 00:00:00', 'Vuelo Cessna 152 0.9h - H. Amaya', -121.50, 6127.50, NULL, 17, NULL, true, NULL, false, NULL, 'H. Amaya', 'YS-334-PE', 0.90, 10.50, NULL, NULL, NULL);
INSERT INTO public.movimiento_cuenta (id, id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd, id_vuelo, id_factura, id_recibo, generado_automatico, registrado_por, anulado, motivo_anulacion, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, editado_en, editado_por, motivo_edicion) VALUES (26, 3, 'DEPOSITO', '2025-12-10 00:00:00', 'Pago inicial CPL (Recibo #6)', 4000.00, 4000.00, NULL, NULL, 6, false, NULL, false, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.movimiento_cuenta (id, id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd, id_vuelo, id_factura, id_recibo, generado_automatico, registrado_por, anulado, motivo_anulacion, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, editado_en, editado_por, motivo_edicion) VALUES (27, 3, 'CARGO_VUELO', '2026-01-08 00:00:00', 'Vuelo Cherokee 180 2.0h - C. Cáceres', -400.00, 3600.00, NULL, 18, NULL, true, NULL, false, NULL, 'C. Cáceres', 'YS-270-P', 2.00, 2.00, NULL, NULL, NULL);
INSERT INTO public.movimiento_cuenta (id, id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd, id_vuelo, id_factura, id_recibo, generado_automatico, registrado_por, anulado, motivo_anulacion, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, editado_en, editado_por, motivo_edicion) VALUES (28, 3, 'CARGO_VUELO', '2026-01-22 00:00:00', 'Vuelo Cherokee Arrow 3.0h - H. Amaya', -660.00, 2940.00, NULL, 19, NULL, true, NULL, false, NULL, 'H. Amaya', 'YS-127-P', 3.00, 5.00, NULL, NULL, NULL);
INSERT INTO public.movimiento_cuenta (id, id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd, id_vuelo, id_factura, id_recibo, generado_automatico, registrado_por, anulado, motivo_anulacion, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, editado_en, editado_por, motivo_edicion) VALUES (29, 3, 'CARGO_VUELO', '2026-02-05 00:00:00', 'Vuelo Cherokee Arrow 4.0h - H. Amaya', -880.00, 2060.00, NULL, 20, NULL, true, NULL, false, NULL, 'H. Amaya', 'YS-127-P', 4.00, 9.00, NULL, NULL, NULL);
INSERT INTO public.movimiento_cuenta (id, id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd, id_vuelo, id_factura, id_recibo, generado_automatico, registrado_por, anulado, motivo_anulacion, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, editado_en, editado_por, motivo_edicion) VALUES (30, 3, 'CARGO_VUELO', '2026-02-26 00:00:00', 'Vuelo Cherokee Arrow 4.5h - H. Amaya', -990.00, 1070.00, NULL, 21, NULL, true, NULL, false, NULL, 'H. Amaya', 'YS-127-P', 4.50, 13.50, NULL, NULL, NULL);
INSERT INTO public.movimiento_cuenta (id, id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd, id_vuelo, id_factura, id_recibo, generado_automatico, registrado_por, anulado, motivo_anulacion, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, editado_en, editado_por, motivo_edicion) VALUES (31, 3, 'CARGO_VUELO', '2026-03-15 00:00:00', 'Vuelo Cherokee 180 2.2h - C. Cáceres', -440.00, 630.00, NULL, 22, NULL, true, NULL, false, NULL, 'C. Cáceres', 'YS-270-P', 2.20, 15.70, NULL, NULL, NULL);
INSERT INTO public.movimiento_cuenta (id, id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd, id_vuelo, id_factura, id_recibo, generado_automatico, registrado_por, anulado, motivo_anulacion, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, editado_en, editado_por, motivo_edicion) VALUES (32, 3, 'AJUSTE_HABER', '2026-04-02 00:00:00', 'Ajuste a favor: corrección de cargo duplicado factura anterior', 50.00, 680.00, NULL, NULL, NULL, false, NULL, false, NULL, 'Ajuste', NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.movimiento_cuenta (id, id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd, id_vuelo, id_factura, id_recibo, generado_automatico, registrado_por, anulado, motivo_anulacion, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, editado_en, editado_por, motivo_edicion) VALUES (33, 3, 'CARGO_VUELO', '2026-04-18 00:00:00', 'Vuelo Cherokee Arrow 1.35h - H. Amaya', -297.00, 383.00, NULL, 23, NULL, true, NULL, false, NULL, 'H. Amaya', 'YS-127-P', 1.35, 17.05, NULL, NULL, NULL);
INSERT INTO public.movimiento_cuenta (id, id_alumno, tipo, fecha, descripcion, monto_usd, saldo_resultante_usd, id_vuelo, id_factura, id_recibo, generado_automatico, registrado_por, anulado, motivo_anulacion, instructor_nombre, avion_codigo, horas_vuelo, horas_totales, editado_en, editado_por, motivo_edicion) VALUES (34, 3, 'CARGO_VUELO', '2026-05-08 00:00:00', 'Vuelo Cessna 152 2.0h - J. Burgos', -270.00, 113.00, NULL, 24, NULL, true, NULL, false, NULL, 'J. Burgos', 'YS-334-PE', 2.00, 19.05, NULL, NULL, NULL);



--

-- ── nomina_periodo ────────────────────────────────────
--





--

-- ── nomina_detalle ────────────────────────────────────
--





--

-- ── nomina_detalle_vuelo ────────────────────────────────────
--





--

-- ── plan_vuelo ────────────────────────────────────
--





--

-- ── progreso_unidad_alumno ────────────────────────────────────
--





--

-- ── recibo_pago ────────────────────────────────────
--


INSERT INTO public.recibo_pago (id, numero_correlativo, id_alumno, fecha, monto_usd, metodo, referencia, descripcion, pdf_path, registrado_por, anulado, motivo_anulacion) VALUES (1, 1, 1, '2025-07-07 00:00:00', 2771.67, 'TRANSFERENCIA', NULL, 'Pago teoría + 17.4 hrs vuelo IFR', NULL, NULL, false, NULL);
INSERT INTO public.recibo_pago (id, numero_correlativo, id_alumno, fecha, monto_usd, metodo, referencia, descripcion, pdf_path, registrado_por, anulado, motivo_anulacion) VALUES (2, 2, 1, '2025-08-09 00:00:00', 2771.67, 'CHEQUE', NULL, 'Pago 21.3 hrs Instrumentos', NULL, NULL, false, NULL);
INSERT INTO public.recibo_pago (id, numero_correlativo, id_alumno, fecha, monto_usd, metodo, referencia, descripcion, pdf_path, registrado_por, anulado, motivo_anulacion) VALUES (3, 3, 1, '2025-09-08 00:00:00', 2771.67, 'EFECTIVO', NULL, 'Pago 11.2 hrs IFR + 5h Maniobras', NULL, NULL, false, NULL);
INSERT INTO public.recibo_pago (id, numero_correlativo, id_alumno, fecha, monto_usd, metodo, referencia, descripcion, pdf_path, registrado_por, anulado, motivo_anulacion) VALUES (4, 4, 2, '2026-01-15 00:00:00', 5000.00, 'TRANSFERENCIA', NULL, 'Pago inicial curso Piloto Privado', NULL, NULL, false, NULL);
INSERT INTO public.recibo_pago (id, numero_correlativo, id_alumno, fecha, monto_usd, metodo, referencia, descripcion, pdf_path, registrado_por, anulado, motivo_anulacion) VALUES (5, 5, 2, '2026-03-05 00:00:00', 2500.00, 'EFECTIVO', NULL, 'Pago segunda cuota PP', NULL, NULL, false, NULL);
INSERT INTO public.recibo_pago (id, numero_correlativo, id_alumno, fecha, monto_usd, metodo, referencia, descripcion, pdf_path, registrado_por, anulado, motivo_anulacion) VALUES (6, 6, 3, '2025-12-10 00:00:00', 4000.00, 'TARJETA', NULL, 'Pago inicial CPL', NULL, NULL, false, NULL);



--

-- ── reporte_vuelo ────────────────────────────────────
--


INSERT INTO public.reporte_vuelo (id_reporte, id_vuelo, tipo_vuelo, tacometro_salida, tacometro_llegada, hobbs_salida, hobbs_llegada, combustible_salida, combustible_llegada, cantidad_combustible, firma_alumno, firma_instructor, estado, archivo_pdf, creado_en, actualizado_en) VALUES (1, 5, 'LOCAL', 123.00, 123.00, 123.00, 123.00, 123.00, 123.00, 123.00, 'data:image/png;base64,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', 'data:image/png;base64,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', 'COMPLETADO', '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2JzhiW2MmY/zAxV0q+CueNMYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+G3a9iOE4/Bv1KbL2p2FX+319V96WkUYHsR0cruXbhb5hZra9ng1s/dFUn4hu6b5Ow7jdOmqjb/2jvzu9x8FfghYx5K1ZJ0yjLYXPd/t3metai2BeTJNs+i9oEI5TZ8ez5pC73Z/5Jcn0z9/Wat0332ibylxu2MKnfqrARZIz68pNDyalKzNmkJ3w738Qh2JWTOFhgckv7Bds/I7awm8uGvADYlZG5bA358R390msFD6wDq3Zo7eAVPGuzsSaya2mamDwJTsQ7D8Qk194mI8T1cLQX7h4eSdG8sv1DR3Fby8DpDR6HTw1Cz6Zsz3e/snYQUpo3CX7uk6zi/AKmI8pkX4xwrDS29vruCA2kI4fb9m56JOjFc+P64/feIYKGo4A3hHEV5YXT8Qz70I2s118FD6C2av3pp1+P9Craa5fbQBWF0I567c3K8FAAAAAAAAAAAAAAAAAAAAAAAAANTxCQXY57UKZW5kc3RyZWFtCmVuZG9iagp4cmVmCjAgMjkKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDA1MzY0IDAwMDAwIG4gCjAwMDAwMDU0MjEgMDAwMDAgbiAKMDAwMDAwNTMwMiAwMDAwMCBuIAowMDAwMDA1MjgxIDAwMDAwIG4gCjAwMDAwMTk1MTMgMDAwMDAgbiAKMDAwMDAyMTE2NSAwMDAwMCBuIAowMDAwMDAwNDczIDAwMDAwIG4gCjAwMDAwMDAyNjYgMDAwMDAgbiAKMDAwMDAwMDE1NiAwMDAwMCBuIAowMDAwMDAwMDE1IDAwMDAwIG4gCjAwMDAwMDAwNjAgMDAwMDAgbiAKMDAwMDAwMzcxMyAwMDAwMCBuIAowMDAwMDAwMTExIDAwMDAwIG4gCjAwMDAwMDUxMzIgMDAwMDAgbiAKMDAwMDAwMjMzOSAwMDAwMCBuIAowMDAwMDAyMjUxIDAwMDAwIG4gCjAwMDAwMDIyNzcgMDAwMDAgbiAKMDAwMDAwMjMwMyAwMDAwMCBuIAowMDAwMDA1NDY4IDAwMDAwIG4gCjAwMDAwMDI0MTUgMDAwMDAgbiAKMDAwMDAwMjY4MiAwMDAwMCBuIAowMDAwMDAzMzI1IDAwMDAwIG4gCjAwMDAwMTIxMDMgMDAwMDAgbiAKMDAwMDAwMzg2MSAwMDAwMCBuIAowMDAwMDA0MTI5IDAwMDAwIG4gCjAwMDAwMDQ3NDMgMDAwMDAgbiAKMDAwMDAxODY5MCAwMDAwMCBuIAowMDAwMDIwNDY0IDAwMDAwIG4gCnRyYWlsZXIKPDwKL1NpemUgMjkKL1Jvb3QgMyAwIFIKL0luZm8gMTUgMCBSCi9JRCBbPDI0ODg2N2ViODIyYTliNDIzNWM0NjllNDRkYzM1NWI1PiA8MjQ4ODY3ZWI4MjJhOWI0MjM1YzQ2OWU0NGRjMzU1YjU+XQo+PgpzdGFydHhyZWYKMjIwMTYKJSVFT0YK', '2026-04-13 22:31:01.484333', '2026-04-13 22:32:09.135224');



--

-- ── vuelo_estado_tiempo ────────────────────────────────────
--


INSERT INTO public.vuelo_estado_tiempo (id_registro, id_vuelo, estado, registrado_por, registrado_en) VALUES (1, 12, 'SALIDA_HANGAR', 6, '2026-04-08 08:30:38.555965');
INSERT INTO public.vuelo_estado_tiempo (id_registro, id_vuelo, estado, registrado_por, registrado_en) VALUES (2, 12, 'EN_VUELO', 6, '2026-04-08 08:58:27.447717');
INSERT INTO public.vuelo_estado_tiempo (id_registro, id_vuelo, estado, registrado_por, registrado_en) VALUES (3, 12, 'REGRESO_HANGAR', 6, '2026-04-08 08:58:32.651788');
INSERT INTO public.vuelo_estado_tiempo (id_registro, id_vuelo, estado, registrado_por, registrado_en) VALUES (5, 13, 'SALIDA_HANGAR', 6, '2026-04-08 09:02:02.283191');
INSERT INTO public.vuelo_estado_tiempo (id_registro, id_vuelo, estado, registrado_por, registrado_en) VALUES (6, 14, 'SALIDA_HANGAR', 6, '2026-04-08 09:02:02.917617');
INSERT INTO public.vuelo_estado_tiempo (id_registro, id_vuelo, estado, registrado_por, registrado_en) VALUES (7, 12, 'FINALIZANDO', 6, '2026-04-08 09:02:47.05777');
INSERT INTO public.vuelo_estado_tiempo (id_registro, id_vuelo, estado, registrado_por, registrado_en) VALUES (8, 12, 'COMPLETADO', 6, '2026-04-08 09:05:30.190049');
INSERT INTO public.vuelo_estado_tiempo (id_registro, id_vuelo, estado, registrado_por, registrado_en) VALUES (9, 13, 'EN_VUELO', 6, '2026-04-08 09:07:14.96611');
INSERT INTO public.vuelo_estado_tiempo (id_registro, id_vuelo, estado, registrado_por, registrado_en) VALUES (10, 14, 'EN_VUELO', 6, '2026-04-08 09:09:49.415383');
INSERT INTO public.vuelo_estado_tiempo (id_registro, id_vuelo, estado, registrado_por, registrado_en) VALUES (11, 13, 'REGRESO_HANGAR', 6, '2026-04-08 09:59:34.703545');
INSERT INTO public.vuelo_estado_tiempo (id_registro, id_vuelo, estado, registrado_por, registrado_en) VALUES (12, 13, 'FINALIZANDO', 6, '2026-04-08 10:01:44.992961');
INSERT INTO public.vuelo_estado_tiempo (id_registro, id_vuelo, estado, registrado_por, registrado_en) VALUES (13, 13, 'COMPLETADO', 6, '2026-04-08 10:02:18.056504');
INSERT INTO public.vuelo_estado_tiempo (id_registro, id_vuelo, estado, registrado_por, registrado_en) VALUES (14, 14, 'REGRESO_HANGAR', 6, '2026-04-08 10:18:15.344622');
INSERT INTO public.vuelo_estado_tiempo (id_registro, id_vuelo, estado, registrado_por, registrado_en) VALUES (15, 14, 'FINALIZANDO', 6, '2026-04-08 10:19:35.72365');
INSERT INTO public.vuelo_estado_tiempo (id_registro, id_vuelo, estado, registrado_por, registrado_en) VALUES (16, 14, 'COMPLETADO', 6, '2026-04-08 10:25:34.523434');
INSERT INTO public.vuelo_estado_tiempo (id_registro, id_vuelo, estado, registrado_por, registrado_en) VALUES (17, 7, 'SALIDA_HANGAR', 6, '2026-04-13 21:56:46.730737');
INSERT INTO public.vuelo_estado_tiempo (id_registro, id_vuelo, estado, registrado_por, registrado_en) VALUES (18, 7, 'COMPLETADO', 6, '2026-04-13 22:20:31.168998');



--

-- ── weight_balance ────────────────────────────────────
--


INSERT INTO public.weight_balance (id_wb, id_vuelo, id_wb_plantilla, pesos_ingresados, galones_combustible, tow_calculado, lw_calculado, cg_calculado, dentro_envelope, estado, creado_en, actualizado_en) VALUES (1, 3, 1, '{"Pilot": 170, "Co-pilot": 150, "Fuel (30 gal MAX)": 30, "Baggage #1 (100 lb MAX)": 0}', NULL, 1628.00, NULL, 75.861, true, 'BORRADOR', '2026-04-06 17:00:54.352545', '2026-04-06 22:46:53.536102');
INSERT INTO public.weight_balance (id_wb, id_vuelo, id_wb_plantilla, pesos_ingresados, galones_combustible, tow_calculado, lw_calculado, cg_calculado, dentro_envelope, estado, creado_en, actualizado_en) VALUES (5, 7, 2, '{"Rear Seat L & R": 180, "Front Seat L & R": 180, "Fuel (48 gal useable)": 40}', NULL, 1924.00, NULL, 89.662, true, 'BORRADOR', '2026-04-06 19:17:17.118524', '2026-04-08 11:06:51.988891');



--
-- Name: aeronave_id_aeronave_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--


SELECT pg_catalog.setval('public.aeronave_id_aeronave_seq', 5, true);
SELECT pg_catalog.setval('public.aeronave_tarifa_id_seq', 10, true);
SELECT pg_catalog.setval('public.alumno_id_alumno_seq', 3, true);
SELECT pg_catalog.setval('public.auditoria_evento_id_auditoria_seq', 74, true);
SELECT pg_catalog.setval('public.bloque_horario_id_bloque_seq', 9, true);
SELECT pg_catalog.setval('public.checklist_postvuelo_id_checklist_seq', 1, true);
SELECT pg_catalog.setval('public.condiciones_cancelacion_id_condicion_seq', 4, true);
SELECT pg_catalog.setval('public.curso_componente_practico_id_seq', 12, true);
SELECT pg_catalog.setval('public.curso_id_seq', 5, true);
SELECT pg_catalog.setval('public.documento_alumno_id_seq', 1, false);
SELECT pg_catalog.setval('public.documento_requerido_catalogo_id_seq', 14, true);
SELECT pg_catalog.setval('public.egreso_id_seq', 1, false);
SELECT pg_catalog.setval('public.estado_operaciones_id_estado_seq', 1, true);
SELECT pg_catalog.setval('public.evaluacion_alumno_id_seq', 1, false);
SELECT pg_catalog.setval('public.evaluacion_id_seq', 1, false);
SELECT pg_catalog.setval('public.factura_correlativo_seq', 24, true);
SELECT pg_catalog.setval('public.factura_detalle_id_seq', 1, false);
SELECT pg_catalog.setval('public.factura_id_seq', 24, true);
SELECT pg_catalog.setval('public.horas_vuelo_aeronave_id_registro_seq', 12, true);
SELECT pg_catalog.setval('public.inscripcion_curso_avance_id_seq', 1, false);
SELECT pg_catalog.setval('public.inscripcion_curso_id_seq', 1, false);
SELECT pg_catalog.setval('public.instructor_id_instructor_seq', 2, true);
SELECT pg_catalog.setval('public.instructor_tarifa_id_seq', 1, false);
SELECT pg_catalog.setval('public.licencia_id_licencia_seq', 3, true);
SELECT pg_catalog.setval('public.loadsheet_id_loadsheet_seq', 9, true);
SELECT pg_catalog.setval('public.loadsheet_waypoint_id_waypoint_seq', 18, true);
SELECT pg_catalog.setval('public.mantenimiento_aeronave_id_mantenimiento_seq', 9, true);
SELECT pg_catalog.setval('public.medico_autorizado_id_seq', 11, true);
SELECT pg_catalog.setval('public.mensaje_turno_id_mensaje_seq', 1, false);
SELECT pg_catalog.setval('public.movimiento_cuenta_id_seq', 34, true);
SELECT pg_catalog.setval('public.nomina_detalle_id_seq', 1, false);
SELECT pg_catalog.setval('public.nomina_detalle_vuelo_id_seq', 1, false);
SELECT pg_catalog.setval('public.nomina_periodo_id_seq', 1, false);
SELECT pg_catalog.setval('public.notificacion_outbox_id_outbox_seq', 46, true);
SELECT pg_catalog.setval('public.plan_vuelo_id_plan_vuelo_seq', 1, false);
SELECT pg_catalog.setval('public.progreso_unidad_alumno_id_seq', 1, false);
SELECT pg_catalog.setval('public.recibo_correlativo_seq', 6, true);
SELECT pg_catalog.setval('public.recibo_pago_id_seq', 6, true);
SELECT pg_catalog.setval('public.reporte_vuelo_id_reporte_seq', 1, true);
SELECT pg_catalog.setval('public.semana_vuelo_id_semana_seq', 3, true);
SELECT pg_catalog.setval('public.solicitud_semana_id_solicitud_seq', 3, true);
SELECT pg_catalog.setval('public.solicitud_vuelo_id_detalle_seq', 9, true);
SELECT pg_catalog.setval('public.unidad_teorica_id_seq', 38, true);
SELECT pg_catalog.setval('public.usuario_id_usuario_seq', 11, true);
SELECT pg_catalog.setval('public.vuelo_estado_tiempo_id_registro_seq', 18, true);
SELECT pg_catalog.setval('public.vuelo_id_vuelo_seq', 14, true);
SELECT pg_catalog.setval('public.wb_plantilla_id_wb_plantilla_seq', 4, true);
SELECT pg_catalog.setval('public.webhook_endpoint_id_webhook_seq', 1, true);
SELECT pg_catalog.setval('public.weight_balance_id_wb_seq', 11, true);