-- Semilla de VUELOS AGENDADOS para pruebas end-to-end.
-- Semana actual: Lun 2026-05-25 a Dom 2026-05-31.  Hoy: Jue 2026-05-28 (dia 4).
-- Instructor 1 (Ricardo, usuario u6) tiene a los 3 alumnos (u4/u5/u7).
-- Idempotente (ON CONFLICT DO NOTHING). Reejecutable.

-- 1) Semana actual (publicada)
INSERT INTO public.semana_vuelo (id_semana, fecha_inicio, fecha_fin, publicada, fecha_publicacion)
VALUES (4, DATE '2026-05-25', DATE '2026-05-31', true, NOW())
ON CONFLICT (id_semana) DO NOTHING;

-- 2) Solicitudes de semana por alumno (publicadas)
INSERT INTO public.solicitud_semana
  (id_solicitud, id_semana, id_alumno, estado, limite_vuelos, limite_vuelos_avion, limite_vuelos_simulador)
VALUES
  (4, 4, 1, 'PUBLICADO', 3, 3, 3),
  (5, 4, 2, 'PUBLICADO', 3, 3, 3),
  (6, 4, 3, 'PUBLICADO', 3, 3, 3)
ON CONFLICT (id_solicitud) DO NOTHING;

-- 3) Detalle de solicitud (uno por vuelo)
INSERT INTO public.solicitud_vuelo
  (id_detalle, id_solicitud, id_aeronave, dia_semana, id_bloque, id_semana)
VALUES
  (10, 4, 1, 4, 2, 4),  -- Carlos, hoy, YS-334-PE, bloque 2
  (11, 5, 2, 4, 3, 4),  -- Daniel, hoy, YS-333-PE, bloque 3
  (12, 6, 5, 4, 4, 4),  -- Sofia, hoy, SIM-1, bloque 4
  (13, 4, 3, 5, 2, 4),  -- Carlos, viernes, YS-270-P, bloque 2
  (14, 5, 1, 6, 3, 4),  -- Daniel, sabado, YS-334-PE, bloque 3
  (15, 6, 2, 3, 2, 4)   -- Sofia, miercoles (pasado), YS-333-PE, bloque 2
ON CONFLICT (id_detalle) DO NOTHING;

-- 4) Vuelos
INSERT INTO public.vuelo
  (id_vuelo, id_semana, id_alumno, id_instructor, id_aeronave, dia_semana, id_bloque,
   estado, creado_por, id_detalle, fecha_vuelo, tipo_vuelo, tiempo_vuelo_min)
VALUES
  (15, 4, 1, 1, 1, 4, 2, 'PUBLICADO',  'PROGRAMACION', 10, DATE '2026-05-28', 'LOCAL', NULL),
  (16, 4, 2, 1, 2, 4, 3, 'PUBLICADO',  'PROGRAMACION', 11, DATE '2026-05-28', 'LOCAL', NULL),
  (17, 4, 3, 1, 5, 4, 4, 'PUBLICADO',  'PROGRAMACION', 12, DATE '2026-05-28', 'LOCAL', NULL),
  (18, 4, 1, 1, 3, 5, 2, 'PUBLICADO',  'PROGRAMACION', 13, DATE '2026-05-29', 'LOCAL', NULL),
  (19, 4, 2, 1, 1, 6, 3, 'PUBLICADO',  'PROGRAMACION', 14, DATE '2026-05-30', 'LOCAL', NULL),
  (20, 4, 3, 1, 2, 3, 2, 'COMPLETADO', 'PROGRAMACION', 15, DATE '2026-05-27', 'LOCAL', 90)
ON CONFLICT (id_vuelo) DO NOTHING;

-- 5) Avanzar las secuencias para que la app no genere IDs que choquen
SELECT setval('semana_vuelo_id_semana_seq',       (SELECT MAX(id_semana)    FROM semana_vuelo));
SELECT setval('solicitud_semana_id_solicitud_seq',(SELECT MAX(id_solicitud) FROM solicitud_semana));
SELECT setval('solicitud_vuelo_id_detalle_seq',   (SELECT MAX(id_detalle)   FROM solicitud_vuelo));
SELECT setval('vuelo_id_vuelo_seq',               (SELECT MAX(id_vuelo)     FROM vuelo));
