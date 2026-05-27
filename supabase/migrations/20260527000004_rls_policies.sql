-- ============================================================================
-- CAAA · Migración 04: Row Level Security
--
-- ESTRATEGIA
-- ----------
-- Tu app NO usa Supabase Auth. Mantenemos login custom (tabla `usuario` +
-- bcrypt + JWT propio). Pero queremos RLS encima por tres razones:
--   1. Defensa en profundidad: si alguien expone la API REST de Supabase
--      directamente (sin pasar por tu backend Node), las políticas siguen
--      protegiendo los datos.
--   2. Aislamiento por rol: el rol del usuario en el JWT controla qué ve.
--   3. Cumple buenas prácticas de Supabase (tablas en `public` sin RLS
--      generan warnings en el dashboard).
--
-- CÓMO FUNCIONA
-- -------------
-- El backend Node sigue firmando JWTs con `process.env.JWT_SECRET`.
-- En el proyecto Supabase, configurá ese mismo secret como JWT Secret
-- (Settings → API → JWT Settings → JWT Secret).
-- Una vez configurado, Supabase verifica firma y expone los claims vía
-- `auth.jwt()`. Nuestras políticas leen `id_usuario` y `rol` de allí.
--
-- Si más adelante migrás a Supabase Auth, solo cambia el helper
-- `current_id_usuario()` y `current_rol()` y todo lo demás sigue funcionando.
-- ============================================================================

BEGIN;

-- ─── Helpers ────────────────────────────────────────────────────────────────

-- Lee el id_usuario del JWT custom firmado por el backend.
CREATE OR REPLACE FUNCTION public.current_id_usuario()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'id_usuario', '')::INTEGER;
$$;

-- Lee el rol del JWT custom (ADMIN, PROGRAMACION, TURNO, ALUMNO, INSTRUCTOR, ADMINISTRACION).
CREATE OR REPLACE FUNCTION public.current_rol()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT current_setting('request.jwt.claims', true)::jsonb ->> 'rol';
$$;

-- Conveniencia: ¿es uno de los roles indicados?
CREATE OR REPLACE FUNCTION public.has_role(VARIADIC roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT public.current_rol() = ANY(roles);
$$;

-- ¿El usuario actual es dueño de este id_alumno (vía tabla alumno)?
CREATE OR REPLACE FUNCTION public.is_my_alumno(target_id_alumno INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.alumno
    WHERE id_alumno = target_id_alumno
      AND id_usuario = public.current_id_usuario()
  );
$$;

-- ¿El usuario actual es este instructor?
CREATE OR REPLACE FUNCTION public.is_my_instructor(target_id_instructor INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.instructor
    WHERE id_instructor = target_id_instructor
      AND id_usuario = public.current_id_usuario()
  );
$$;

-- Permitir EXECUTE de helpers a cualquier rol autenticado (anon + authenticated en Supabase)
GRANT EXECUTE ON FUNCTION public.current_id_usuario() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_rol() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(VARIADIC TEXT[]) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_my_alumno(INTEGER) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_my_instructor(INTEGER) TO PUBLIC;

-- ─── Constantes de conveniencia (roles "admin completo") ───────────────────
-- Sirven en políticas para abrir lectura total a perfiles administrativos.
-- Roles que ven todo (lectura general):                ADMIN, ADMINISTRACION, PROGRAMACION, TURNO
-- Roles con escritura completa de catálogos:           ADMIN, ADMINISTRACION
-- Roles con escritura del módulo financiero:           ADMINISTRACION
-- Roles con escritura del módulo aula virtual:         ADMINISTRACION, ADMIN, INSTRUCTOR
-- Roles con escritura del módulo operación de vuelos:  ADMIN, PROGRAMACION, TURNO

-- ============================================================================
-- HABILITAR RLS EN TODAS LAS TABLAS PÚBLICAS
-- ============================================================================

ALTER TABLE public.usuario                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alumno                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instructor                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aeronave                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aeronave_tarifa               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instructor_tarifa             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curso                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curso_componente_practico     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inscripcion_curso             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inscripcion_curso_avance      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuenta_corriente_alumno       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimiento_cuenta             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recibo_pago                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factura                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factura_detalle               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.egreso                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nomina_periodo                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nomina_detalle                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nomina_detalle_vuelo          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documento_requerido_catalogo  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documento_alumno              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medico_autorizado             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unidad_teorica                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progreso_unidad_alumno        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluacion                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluacion_alumno             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vuelo                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vuelo_estado_tiempo           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitud_vuelo               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitud_semana              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semana_vuelo                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bloque_horario                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bloque_bloqueado_dia          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reporte_vuelo                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_postvuelo           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_vuelo                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loadsheet                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loadsheet_waypoint            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weight_balance                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wb_plantilla                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mantenimiento_aeronave        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horas_vuelo_aeronave          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licencia                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licencia_aeronave             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condiciones_cancelacion       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estado_operaciones            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensaje_turno                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_evento              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacion_outbox           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_endpoint              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_evento                ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- POLÍTICAS POR DOMINIO
--
-- Patrón: SELECT lo más abierto razonable, INSERT/UPDATE/DELETE restringido.
-- El backend Node firma el JWT con el claim `rol`. Service role bypasea RLS
-- (lo que usás cuando el backend habla con Supabase como dueño del schema).
-- ============================================================================

-- ─── Catálogos públicos (lectura abierta a todo usuario autenticado) ───────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'curso','curso_componente_practico','aeronave','aeronave_tarifa',
    'bloque_horario','condiciones_cancelacion','wb_plantilla',
    'licencia','licencia_aeronave','documento_requerido_catalogo',
    'medico_autorizado','unidad_teorica','estado_operaciones'
  ] LOOP
    EXECUTE format('CREATE POLICY %I_select_all ON public.%I FOR SELECT USING (public.current_id_usuario() IS NOT NULL);', t, t);
    EXECUTE format('CREATE POLICY %I_write_admin ON public.%I FOR ALL USING (public.has_role(''ADMIN'',''ADMINISTRACION'')) WITH CHECK (public.has_role(''ADMIN'',''ADMINISTRACION''));', t, t);
  END LOOP;
END $$;

-- ─── Usuarios: cada quien ve el propio, ADMIN/ADMINISTRACION ven todos ─────
CREATE POLICY usuario_select_own
  ON public.usuario FOR SELECT
  USING (
    id_usuario = public.current_id_usuario()
    OR public.has_role('ADMIN','ADMINISTRACION','PROGRAMACION','TURNO')
  );
CREATE POLICY usuario_update_own
  ON public.usuario FOR UPDATE
  USING (
    id_usuario = public.current_id_usuario()
    OR public.has_role('ADMIN','ADMINISTRACION')
  );
CREATE POLICY usuario_insert_admin
  ON public.usuario FOR INSERT
  WITH CHECK (public.has_role('ADMIN','ADMINISTRACION'));
CREATE POLICY usuario_delete_admin
  ON public.usuario FOR DELETE
  USING (public.has_role('ADMIN','ADMINISTRACION'));

-- ─── Alumno / Instructor: dueño + admins ───────────────────────────────────
CREATE POLICY alumno_select
  ON public.alumno FOR SELECT
  USING (
    id_usuario = public.current_id_usuario()
    OR public.has_role('ADMIN','ADMINISTRACION','PROGRAMACION','TURNO','INSTRUCTOR')
  );
CREATE POLICY alumno_write_admin
  ON public.alumno FOR ALL
  USING (public.has_role('ADMIN','ADMINISTRACION'))
  WITH CHECK (public.has_role('ADMIN','ADMINISTRACION'));

CREATE POLICY instructor_select
  ON public.instructor FOR SELECT
  USING (
    id_usuario = public.current_id_usuario()
    OR public.has_role('ADMIN','ADMINISTRACION','PROGRAMACION','TURNO')
  );
CREATE POLICY instructor_write_admin
  ON public.instructor FOR ALL
  USING (public.has_role('ADMIN','ADMINISTRACION'))
  WITH CHECK (public.has_role('ADMIN','ADMINISTRACION'));

-- ─── Cuenta corriente (financiero): alumno ve la propia, ADMIN solo lectura ─
CREATE POLICY cca_select
  ON public.cuenta_corriente_alumno FOR SELECT
  USING (
    public.is_my_alumno(id_alumno)
    OR public.has_role('ADMIN','ADMINISTRACION')
  );
CREATE POLICY cca_write_administracion
  ON public.cuenta_corriente_alumno FOR ALL
  USING (public.has_role('ADMINISTRACION'))
  WITH CHECK (public.has_role('ADMINISTRACION'));

CREATE POLICY mov_select
  ON public.movimiento_cuenta FOR SELECT
  USING (
    public.is_my_alumno(id_alumno)
    OR public.has_role('ADMIN','ADMINISTRACION')
  );
CREATE POLICY mov_write_administracion
  ON public.movimiento_cuenta FOR ALL
  USING (public.has_role('ADMINISTRACION'))
  WITH CHECK (public.has_role('ADMINISTRACION'));

CREATE POLICY recibo_select
  ON public.recibo_pago FOR SELECT
  USING (
    public.is_my_alumno(id_alumno)
    OR public.has_role('ADMIN','ADMINISTRACION')
  );
CREATE POLICY recibo_write_administracion
  ON public.recibo_pago FOR ALL
  USING (public.has_role('ADMINISTRACION'))
  WITH CHECK (public.has_role('ADMINISTRACION'));

CREATE POLICY factura_select
  ON public.factura FOR SELECT
  USING (
    public.is_my_alumno(id_alumno)
    OR public.has_role('ADMIN','ADMINISTRACION')
  );
CREATE POLICY factura_write_administracion
  ON public.factura FOR ALL
  USING (public.has_role('ADMINISTRACION'))
  WITH CHECK (public.has_role('ADMINISTRACION'));

CREATE POLICY factura_detalle_select
  ON public.factura_detalle FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.factura f
      WHERE f.id = factura_detalle.id_factura
        AND (public.is_my_alumno(f.id_alumno) OR public.has_role('ADMIN','ADMINISTRACION'))
    )
  );
CREATE POLICY factura_detalle_write_administracion
  ON public.factura_detalle FOR ALL
  USING (public.has_role('ADMINISTRACION'))
  WITH CHECK (public.has_role('ADMINISTRACION'));

-- ─── Egresos y nómina (solo ADMIN/ADMINISTRACION) ──────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'egreso','nomina_periodo','nomina_detalle','nomina_detalle_vuelo',
    'instructor_tarifa'
  ] LOOP
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT USING (public.has_role(''ADMIN'',''ADMINISTRACION''));', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL USING (public.has_role(''ADMINISTRACION'')) WITH CHECK (public.has_role(''ADMINISTRACION''));', t, t);
  END LOOP;
END $$;

-- ─── Inscripciones a cursos / avance ───────────────────────────────────────
CREATE POLICY inscripcion_select
  ON public.inscripcion_curso FOR SELECT
  USING (
    public.is_my_alumno(id_alumno)
    OR public.has_role('ADMIN','ADMINISTRACION','INSTRUCTOR','PROGRAMACION')
  );
CREATE POLICY inscripcion_write_admin
  ON public.inscripcion_curso FOR ALL
  USING (public.has_role('ADMIN','ADMINISTRACION'))
  WITH CHECK (public.has_role('ADMIN','ADMINISTRACION'));

CREATE POLICY inscripcion_avance_select
  ON public.inscripcion_curso_avance FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.inscripcion_curso ic
      WHERE ic.id = inscripcion_curso_avance.id_inscripcion
        AND (public.is_my_alumno(ic.id_alumno) OR public.has_role('ADMIN','ADMINISTRACION','INSTRUCTOR'))
    )
  );
CREATE POLICY inscripcion_avance_write_admin
  ON public.inscripcion_curso_avance FOR ALL
  USING (public.has_role('ADMIN','ADMINISTRACION','INSTRUCTOR'))
  WITH CHECK (public.has_role('ADMIN','ADMINISTRACION','INSTRUCTOR'));

-- ─── Aula virtual: progreso y evaluaciones ─────────────────────────────────
CREATE POLICY prog_unidad_select
  ON public.progreso_unidad_alumno FOR SELECT
  USING (
    public.is_my_alumno(id_alumno)
    OR public.has_role('ADMIN','ADMINISTRACION','INSTRUCTOR')
  );
CREATE POLICY prog_unidad_write_admin
  ON public.progreso_unidad_alumno FOR ALL
  USING (public.has_role('ADMIN','ADMINISTRACION','INSTRUCTOR'))
  WITH CHECK (public.has_role('ADMIN','ADMINISTRACION','INSTRUCTOR'));

CREATE POLICY evaluacion_select
  ON public.evaluacion FOR SELECT
  USING (public.current_id_usuario() IS NOT NULL);
CREATE POLICY evaluacion_write_admin
  ON public.evaluacion FOR ALL
  USING (public.has_role('ADMIN','ADMINISTRACION','INSTRUCTOR'))
  WITH CHECK (public.has_role('ADMIN','ADMINISTRACION','INSTRUCTOR'));

CREATE POLICY evaluacion_alumno_select
  ON public.evaluacion_alumno FOR SELECT
  USING (
    public.is_my_alumno(id_alumno)
    OR public.has_role('ADMIN','ADMINISTRACION','INSTRUCTOR')
  );
CREATE POLICY evaluacion_alumno_write_admin
  ON public.evaluacion_alumno FOR ALL
  USING (public.has_role('ADMIN','ADMINISTRACION','INSTRUCTOR'))
  WITH CHECK (public.has_role('ADMIN','ADMINISTRACION','INSTRUCTOR'));

-- ─── Vuelos y agendamiento ─────────────────────────────────────────────────
CREATE POLICY vuelo_select
  ON public.vuelo FOR SELECT
  USING (
    public.is_my_alumno(id_alumno)
    OR public.is_my_instructor(id_instructor)
    OR public.has_role('ADMIN','ADMINISTRACION','PROGRAMACION','TURNO')
  );
CREATE POLICY vuelo_write_admin
  ON public.vuelo FOR ALL
  USING (public.has_role('ADMIN','PROGRAMACION','TURNO'))
  WITH CHECK (public.has_role('ADMIN','PROGRAMACION','TURNO'));

CREATE POLICY vuelo_estado_select
  ON public.vuelo_estado_tiempo FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vuelo v
      WHERE v.id_vuelo = vuelo_estado_tiempo.id_vuelo
        AND (public.is_my_alumno(v.id_alumno) OR public.is_my_instructor(v.id_instructor)
             OR public.has_role('ADMIN','ADMINISTRACION','PROGRAMACION','TURNO'))
    )
  );
CREATE POLICY vuelo_estado_write
  ON public.vuelo_estado_tiempo FOR ALL
  USING (public.has_role('ADMIN','PROGRAMACION','TURNO','INSTRUCTOR'))
  WITH CHECK (public.has_role('ADMIN','PROGRAMACION','TURNO','INSTRUCTOR'));

CREATE POLICY solicitud_vuelo_select
  ON public.solicitud_vuelo FOR SELECT
  USING (
    public.is_my_alumno(id_alumno)
    OR public.has_role('ADMIN','ADMINISTRACION','PROGRAMACION','TURNO')
  );
CREATE POLICY solicitud_vuelo_write_owner
  ON public.solicitud_vuelo FOR ALL
  USING (
    public.is_my_alumno(id_alumno)
    OR public.has_role('ADMIN','PROGRAMACION','TURNO')
  )
  WITH CHECK (
    public.is_my_alumno(id_alumno)
    OR public.has_role('ADMIN','PROGRAMACION','TURNO')
  );

CREATE POLICY solicitud_semana_select
  ON public.solicitud_semana FOR SELECT
  USING (
    public.is_my_alumno(id_alumno)
    OR public.has_role('ADMIN','ADMINISTRACION','PROGRAMACION','TURNO')
  );
CREATE POLICY solicitud_semana_write_owner
  ON public.solicitud_semana FOR ALL
  USING (
    public.is_my_alumno(id_alumno)
    OR public.has_role('ADMIN','PROGRAMACION','TURNO')
  )
  WITH CHECK (
    public.is_my_alumno(id_alumno)
    OR public.has_role('ADMIN','PROGRAMACION','TURNO')
  );

-- ─── Documentación / formularios pre-vuelo ─────────────────────────────────
CREATE POLICY plan_vuelo_select
  ON public.plan_vuelo FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vuelo v
      WHERE v.id_vuelo = plan_vuelo.id_vuelo
        AND (public.is_my_alumno(v.id_alumno) OR public.is_my_instructor(v.id_instructor)
             OR public.has_role('ADMIN','PROGRAMACION','TURNO','ADMINISTRACION'))
    )
  );
CREATE POLICY plan_vuelo_write
  ON public.plan_vuelo FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.vuelo v
      WHERE v.id_vuelo = plan_vuelo.id_vuelo
        AND (public.is_my_alumno(v.id_alumno) OR public.has_role('ADMIN','PROGRAMACION','TURNO','INSTRUCTOR'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vuelo v
      WHERE v.id_vuelo = plan_vuelo.id_vuelo
        AND (public.is_my_alumno(v.id_alumno) OR public.has_role('ADMIN','PROGRAMACION','TURNO','INSTRUCTOR'))
    )
  );

CREATE POLICY reporte_vuelo_select
  ON public.reporte_vuelo FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vuelo v
      WHERE v.id_vuelo = reporte_vuelo.id_vuelo
        AND (public.is_my_alumno(v.id_alumno) OR public.is_my_instructor(v.id_instructor)
             OR public.has_role('ADMIN','ADMINISTRACION','PROGRAMACION','TURNO'))
    )
  );
CREATE POLICY reporte_vuelo_write
  ON public.reporte_vuelo FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.vuelo v
      WHERE v.id_vuelo = reporte_vuelo.id_vuelo
        AND (public.is_my_alumno(v.id_alumno) OR public.is_my_instructor(v.id_instructor)
             OR public.has_role('ADMIN','PROGRAMACION','TURNO'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vuelo v
      WHERE v.id_vuelo = reporte_vuelo.id_vuelo
        AND (public.is_my_alumno(v.id_alumno) OR public.is_my_instructor(v.id_instructor)
             OR public.has_role('ADMIN','PROGRAMACION','TURNO'))
    )
  );

CREATE POLICY checklist_postvuelo_select
  ON public.checklist_postvuelo FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vuelo v
      WHERE v.id_vuelo = checklist_postvuelo.id_vuelo
        AND (public.is_my_alumno(v.id_alumno) OR public.is_my_instructor(v.id_instructor)
             OR public.has_role('ADMIN','PROGRAMACION','TURNO'))
    )
  );
CREATE POLICY checklist_postvuelo_write
  ON public.checklist_postvuelo FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.vuelo v
      WHERE v.id_vuelo = checklist_postvuelo.id_vuelo
        AND (public.is_my_alumno(v.id_alumno) OR public.is_my_instructor(v.id_instructor)
             OR public.has_role('ADMIN','PROGRAMACION','TURNO'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vuelo v
      WHERE v.id_vuelo = checklist_postvuelo.id_vuelo
        AND (public.is_my_alumno(v.id_alumno) OR public.is_my_instructor(v.id_instructor)
             OR public.has_role('ADMIN','PROGRAMACION','TURNO'))
    )
  );

-- Loadsheet, waypoints, weight_balance — mismas reglas que plan_vuelo
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['loadsheet','weight_balance'] LOOP
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.vuelo v WHERE v.id_vuelo = %I.id_vuelo
        AND (public.is_my_alumno(v.id_alumno) OR public.is_my_instructor(v.id_instructor)
             OR public.has_role(''ADMIN'',''PROGRAMACION'',''TURNO'',''ADMINISTRACION''))));', t, t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL USING (
      EXISTS (SELECT 1 FROM public.vuelo v WHERE v.id_vuelo = %I.id_vuelo
        AND (public.is_my_alumno(v.id_alumno) OR public.has_role(''ADMIN'',''PROGRAMACION'',''TURNO'',''INSTRUCTOR''))))
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.vuelo v WHERE v.id_vuelo = %I.id_vuelo
          AND (public.is_my_alumno(v.id_alumno) OR public.has_role(''ADMIN'',''PROGRAMACION'',''TURNO'',''INSTRUCTOR''))));', t, t, t, t);
  END LOOP;
END $$;

CREATE POLICY loadsheet_waypoint_select
  ON public.loadsheet_waypoint FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.loadsheet ls
      JOIN public.vuelo v ON v.id_vuelo = ls.id_vuelo
      WHERE ls.id = loadsheet_waypoint.id_loadsheet
        AND (public.is_my_alumno(v.id_alumno) OR public.is_my_instructor(v.id_instructor)
             OR public.has_role('ADMIN','PROGRAMACION','TURNO','ADMINISTRACION'))
    )
  );
CREATE POLICY loadsheet_waypoint_write
  ON public.loadsheet_waypoint FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.loadsheet ls
      JOIN public.vuelo v ON v.id_vuelo = ls.id_vuelo
      WHERE ls.id = loadsheet_waypoint.id_loadsheet
        AND (public.is_my_alumno(v.id_alumno) OR public.has_role('ADMIN','PROGRAMACION','TURNO','INSTRUCTOR'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.loadsheet ls
      JOIN public.vuelo v ON v.id_vuelo = ls.id_vuelo
      WHERE ls.id = loadsheet_waypoint.id_loadsheet
        AND (public.is_my_alumno(v.id_alumno) OR public.has_role('ADMIN','PROGRAMACION','TURNO','INSTRUCTOR'))
    )
  );

-- ─── Documentos del alumno ─────────────────────────────────────────────────
CREATE POLICY doc_alumno_select
  ON public.documento_alumno FOR SELECT
  USING (
    public.is_my_alumno(id_alumno)
    OR public.has_role('ADMIN','ADMINISTRACION')
  );
CREATE POLICY doc_alumno_write
  ON public.documento_alumno FOR ALL
  USING (
    public.is_my_alumno(id_alumno)
    OR public.has_role('ADMIN','ADMINISTRACION')
  )
  WITH CHECK (
    public.is_my_alumno(id_alumno)
    OR public.has_role('ADMIN','ADMINISTRACION')
  );

-- ─── Mantenimiento y horas aeronave ────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['mantenimiento_aeronave','horas_vuelo_aeronave'] LOOP
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT USING (public.current_id_usuario() IS NOT NULL);', t, t);
    EXECUTE format('CREATE POLICY %I_write_admin ON public.%I FOR ALL USING (public.has_role(''ADMIN'',''ADMINISTRACION'',''PROGRAMACION'')) WITH CHECK (public.has_role(''ADMIN'',''ADMINISTRACION'',''PROGRAMACION''));', t, t);
  END LOOP;
END $$;

-- ─── Semanas y bloques bloqueados ──────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['semana_vuelo','bloque_bloqueado_dia'] LOOP
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT USING (public.current_id_usuario() IS NOT NULL);', t, t);
    EXECUTE format('CREATE POLICY %I_write_prog ON public.%I FOR ALL USING (public.has_role(''ADMIN'',''PROGRAMACION'',''TURNO'')) WITH CHECK (public.has_role(''ADMIN'',''PROGRAMACION'',''TURNO''));', t, t);
  END LOOP;
END $$;

-- ─── Turno: mensajes ───────────────────────────────────────────────────────
CREATE POLICY mensaje_turno_select
  ON public.mensaje_turno FOR SELECT
  USING (public.current_id_usuario() IS NOT NULL);
CREATE POLICY mensaje_turno_write
  ON public.mensaje_turno FOR ALL
  USING (public.has_role('ADMIN','TURNO','PROGRAMACION'))
  WITH CHECK (public.has_role('ADMIN','TURNO','PROGRAMACION'));

-- ─── Auditoría: lectura admin, escritura desde backend (service role) ──────
CREATE POLICY auditoria_select_admin
  ON public.auditoria_evento FOR SELECT
  USING (public.has_role('ADMIN','ADMINISTRACION'));
-- NO se crea política de INSERT/UPDATE/DELETE — solo service_role escribe.

-- ─── Outbox / Webhooks: solo service_role ──────────────────────────────────
-- (Sin políticas: tablas RLS-enabled sin policies = nadie excepto service_role accede.)

COMMIT;
