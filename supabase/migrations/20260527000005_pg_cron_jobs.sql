-- ============================================================================
-- CAAA · Migración 05: pg_cron — reemplazo de los setInterval del server.js
--
-- En Supabase Pro pg_cron viene preinstalado. Esta migración activa la
-- extensión y crea las 3 funciones + sus jobs equivalentes a los crons
-- que corrían cada 60 segundos en el backend Node:
--
--   1. emit_bloque_iniciado()
--      Equivalente al setInterval que emitía io.emit("bloque_iniciado")
--      cuando arrancaba un bloque horario. Ahora INSERT en notificacion_outbox
--      y la Edge Function de Realtime hace el broadcast.
--
--   2. auto_avance_salida_hangar()
--      Avanza automáticamente vuelos en estado SALIDA_HANGAR a EN_PROGRESO
--      tras 15 minutos. Inserta vuelo_estado_tiempo + notifica.
--
--   3. auto_reanudar_operaciones()
--      Si estado_operaciones es INACTIVO y el reloj pasó el max(hora_fin)
--      del último bloque suspendido, restablece a ACTIVO.
-- ============================================================================

BEGIN;

-- ─── Extensión pg_cron ─────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- pg_cron vive en schema cron; los jobs llamean funciones del schema public.

-- ───────────────────────────────────────────────────────────────────────
-- 1. Bloque iniciado: cada minuto compara hora actual SV vs bloque_horario.hora_inicio
-- ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cron_emit_bloque_iniciado()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now_sv TIMESTAMPTZ := NOW() AT TIME ZONE 'America/El_Salvador';
  v_hora    TIME       := to_char(v_now_sv, 'HH24:MI:00')::time;
  v_row RECORD;
BEGIN
  FOR v_row IN
    SELECT id_bloque, hora_inicio
    FROM public.bloque_horario
    WHERE hora_inicio = v_hora
  LOOP
    INSERT INTO public.notificacion_outbox (canal, evento, payload, creado_en)
    VALUES (
      'turno',
      'bloque_iniciado',
      jsonb_build_object('id_bloque', v_row.id_bloque, 'hora_inicio', v_row.hora_inicio),
      NOW()
    );
  END LOOP;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────
-- 2. Auto-avance SALIDA_HANGAR → EN_PROGRESO tras 15 min
-- ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cron_auto_avance_salida_hangar()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now_sv DATE := (NOW() AT TIME ZONE 'America/El_Salvador')::date;
  v_dow    INT  := EXTRACT(ISODOW FROM (NOW() AT TIME ZONE 'America/El_Salvador'))::int;
  v_row RECORD;
  v_ts  TIMESTAMP;
BEGIN
  FOR v_row IN
    SELECT v.id_vuelo
    FROM public.vuelo v
    JOIN LATERAL (
      SELECT registrado_en
      FROM public.vuelo_estado_tiempo
      WHERE id_vuelo = v.id_vuelo AND estado = 'SALIDA_HANGAR'
      ORDER BY registrado_en DESC LIMIT 1
    ) vet ON true
    WHERE v.estado = 'SALIDA_HANGAR'
      AND vet.registrado_en <= NOW() - INTERVAL '15 minutes'
      AND v.dia_semana = v_dow
      AND EXISTS (
        SELECT 1 FROM public.semana_vuelo sw
        WHERE sw.id_semana = v.id_semana
          AND v_now_sv BETWEEN sw.fecha_inicio AND sw.fecha_fin
          AND sw.publicada = TRUE
      )
  LOOP
    UPDATE public.vuelo SET estado = 'EN_PROGRESO'
      WHERE id_vuelo = v_row.id_vuelo AND estado = 'SALIDA_HANGAR';

    INSERT INTO public.vuelo_estado_tiempo (id_vuelo, estado, registrado_por)
    VALUES (v_row.id_vuelo, 'EN_PROGRESO', NULL)
    RETURNING registrado_en INTO v_ts;

    INSERT INTO public.notificacion_outbox (canal, evento, payload, creado_en)
    VALUES (
      'turno',
      'vuelo_estado_changed',
      jsonb_build_object(
        'id_vuelo', v_row.id_vuelo,
        'estado', 'EN_PROGRESO',
        'registrado_en', v_ts,
        'auto', TRUE
      ),
      NOW()
    );
  END LOOP;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────
-- 3. Auto-reanudación de operaciones cuando se pasa la hora del último bloque
-- ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cron_auto_reanudar_operaciones()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_estado RECORD;
  v_ids    INT[];
  v_max_fin TIME;
  v_now_time TIME := to_char(NOW() AT TIME ZONE 'America/El_Salvador', 'HH24:MI:SS')::time;
BEGIN
  SELECT estado_general, bloques_suspendidos INTO v_estado
  FROM public.estado_operaciones
  WHERE estado_general = 'INACTIVO'
  LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;
  IF v_estado.bloques_suspendidos IS NULL THEN RETURN; END IF;

  -- bloques_suspendidos puede ser JSON o array de int
  BEGIN
    v_ids := ARRAY(SELECT jsonb_array_elements_text(v_estado.bloques_suspendidos::jsonb)::int);
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;

  IF array_length(v_ids, 1) IS NULL THEN RETURN; END IF;

  SELECT MAX(hora_fin) INTO v_max_fin
  FROM public.bloque_horario
  WHERE id_bloque = ANY(v_ids);

  IF v_max_fin IS NULL OR v_now_time <= v_max_fin THEN RETURN; END IF;

  -- Reanudar
  UPDATE public.estado_operaciones
    SET estado_general = 'ACTIVO',
        motivo_inactivo = NULL,
        bloques_suspendidos = '[]',
        temperatura = NULL,
        explicacion_detallada = NULL;

  UPDATE public.mensaje_turno
    SET activo = FALSE
    WHERE tipo = 'TURNO' AND contenido LIKE 'OPERACIONES SUSPENDIDAS%';

  INSERT INTO public.auditoria_evento
    (accion, entidad, descripcion, actor_id_usuario, actor_rol, origen)
  VALUES
    ('OTRO', 'operaciones',
     'REANUDACIÓN AUTOMÁTICA: las operaciones se han reanudado al finalizar el bloque programado (' || v_max_fin || ').',
     NULL, 'SYSTEM', 'PG_CRON');

  INSERT INTO public.notificacion_outbox (canal, evento, payload, creado_en)
  VALUES
    ('operaciones', 'estado_operaciones_changed',
     jsonb_build_object('estado_general','ACTIVO','bloques_suspendidos','[]'),
     NOW()),
    ('operaciones', 'nuevo_ticker',
     jsonb_build_object('action','clear_all'),
     NOW());
END;
$$;

-- Permitir EXECUTE
GRANT EXECUTE ON FUNCTION public.cron_emit_bloque_iniciado() TO postgres;
GRANT EXECUTE ON FUNCTION public.cron_auto_avance_salida_hangar() TO postgres;
GRANT EXECUTE ON FUNCTION public.cron_auto_reanudar_operaciones() TO postgres;

-- ───────────────────────────────────────────────────────────────────────
-- Agendar los 3 jobs (cada minuto)
-- ───────────────────────────────────────────────────────────────────────
SELECT cron.schedule(
  'caaa-bloque-iniciado',
  '* * * * *',
  $$SELECT public.cron_emit_bloque_iniciado();$$
);

SELECT cron.schedule(
  'caaa-auto-avance-salida-hangar',
  '* * * * *',
  $$SELECT public.cron_auto_avance_salida_hangar();$$
);

SELECT cron.schedule(
  'caaa-auto-reanudar-operaciones',
  '* * * * *',
  $$SELECT public.cron_auto_reanudar_operaciones();$$
);

-- ───────────────────────────────────────────────────────────────────────
-- Tabla de outbox: las Edge Functions de Realtime drenan de aquí
--   y publican como broadcast. Alternativamente, NOTIFY/LISTEN.
-- ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notificacion_outbox (
  id          BIGSERIAL PRIMARY KEY,
  canal       VARCHAR(60) NOT NULL,
  evento      VARCHAR(80) NOT NULL,
  payload     JSONB NOT NULL,
  creado_en   TIMESTAMP NOT NULL DEFAULT NOW(),
  procesado_en TIMESTAMP NULL
);
CREATE INDEX IF NOT EXISTS ix_outbox_pendientes
  ON public.notificacion_outbox(creado_en)
  WHERE procesado_en IS NULL;

COMMIT;
