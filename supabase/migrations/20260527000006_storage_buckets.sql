-- ============================================================================
-- CAAA · Migración 06: Buckets de Supabase Storage + policies
--
-- 5 buckets privados (no public URL): planes-vuelo, loadsheets, documentos-alumno,
-- recibos-pdf, facturas-pdf. Policies basadas en el JWT custom para que cada rol
-- pueda acceder solo a lo que le corresponde.
--
-- Las policies de storage usan storage.objects (managed por Supabase).
-- ============================================================================

BEGIN;

-- ─── Crear buckets ──────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('planes-vuelo',       'planes-vuelo',       FALSE, 20971520, ARRAY['application/pdf']),
  ('loadsheets',         'loadsheets',         FALSE, 20971520, ARRAY['application/pdf']),
  ('documentos-alumno',  'documentos-alumno',  FALSE, 20971520, ARRAY['application/pdf','image/jpeg','image/png']),
  ('recibos-pdf',        'recibos-pdf',        FALSE, 5242880,  ARRAY['application/pdf']),
  ('facturas-pdf',       'facturas-pdf',       FALSE, 5242880,  ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- ─── Policies ───────────────────────────────────────────────────────────

-- planes-vuelo:
--   SELECT: alumno dueño del vuelo, instructor asignado, ADMIN/PROGRAMACION/TURNO
--   INSERT/UPDATE/DELETE: mismo set + ADMINISTRACION lectura

-- Convención de naming: <id_vuelo>/plan_<timestamp>.pdf
CREATE POLICY "planes_vuelo_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'planes-vuelo'
    AND (
      public.has_role('ADMIN','PROGRAMACION','TURNO','ADMINISTRACION','INSTRUCTOR')
      OR EXISTS (
        SELECT 1 FROM public.vuelo v
        WHERE v.id_vuelo::text = split_part(storage.objects.name, '/', 1)
          AND (public.is_my_alumno(v.id_alumno) OR public.is_my_instructor(v.id_instructor))
      )
    )
  );

CREATE POLICY "planes_vuelo_write"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'planes-vuelo'
    AND (
      public.has_role('ADMIN','PROGRAMACION','TURNO','INSTRUCTOR')
      OR EXISTS (
        SELECT 1 FROM public.vuelo v
        WHERE v.id_vuelo::text = split_part(storage.objects.name, '/', 1)
          AND public.is_my_alumno(v.id_alumno)
      )
    )
  )
  WITH CHECK (
    bucket_id = 'planes-vuelo'
    AND (
      public.has_role('ADMIN','PROGRAMACION','TURNO','INSTRUCTOR')
      OR EXISTS (
        SELECT 1 FROM public.vuelo v
        WHERE v.id_vuelo::text = split_part(storage.objects.name, '/', 1)
          AND public.is_my_alumno(v.id_alumno)
      )
    )
  );

-- loadsheets — misma regla
CREATE POLICY "loadsheets_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'loadsheets'
    AND (
      public.has_role('ADMIN','PROGRAMACION','TURNO','ADMINISTRACION','INSTRUCTOR')
      OR EXISTS (
        SELECT 1 FROM public.vuelo v
        WHERE v.id_vuelo::text = split_part(storage.objects.name, '/', 1)
          AND (public.is_my_alumno(v.id_alumno) OR public.is_my_instructor(v.id_instructor))
      )
    )
  );
CREATE POLICY "loadsheets_write"
  ON storage.objects FOR ALL
  USING (bucket_id = 'loadsheets' AND public.has_role('ADMIN','PROGRAMACION','TURNO','INSTRUCTOR'))
  WITH CHECK (bucket_id = 'loadsheets' AND public.has_role('ADMIN','PROGRAMACION','TURNO','INSTRUCTOR'));

-- documentos-alumno: cada alumno gestiona los suyos. Convención: <id_alumno>/<codigo>_<ts>.pdf
CREATE POLICY "doc_alumno_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documentos-alumno'
    AND (
      public.has_role('ADMIN','ADMINISTRACION')
      OR public.is_my_alumno(split_part(storage.objects.name, '/', 1)::int)
    )
  );
CREATE POLICY "doc_alumno_write"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'documentos-alumno'
    AND (
      public.has_role('ADMIN','ADMINISTRACION')
      OR public.is_my_alumno(split_part(storage.objects.name, '/', 1)::int)
    )
  )
  WITH CHECK (
    bucket_id = 'documentos-alumno'
    AND (
      public.has_role('ADMIN','ADMINISTRACION')
      OR public.is_my_alumno(split_part(storage.objects.name, '/', 1)::int)
    )
  );

-- recibos-pdf y facturas-pdf: emisión por ADMINISTRACION, lectura por dueño + admins
-- Convención: <id_alumno>/recibo_<correlativo>.pdf  /  <id_alumno>/factura_<correlativo>.pdf
CREATE POLICY "recibos_pdf_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'recibos-pdf'
    AND (
      public.has_role('ADMIN','ADMINISTRACION')
      OR public.is_my_alumno(split_part(storage.objects.name, '/', 1)::int)
    )
  );
CREATE POLICY "recibos_pdf_write"
  ON storage.objects FOR ALL
  USING (bucket_id = 'recibos-pdf' AND public.has_role('ADMINISTRACION'))
  WITH CHECK (bucket_id = 'recibos-pdf' AND public.has_role('ADMINISTRACION'));

CREATE POLICY "facturas_pdf_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'facturas-pdf'
    AND (
      public.has_role('ADMIN','ADMINISTRACION')
      OR public.is_my_alumno(split_part(storage.objects.name, '/', 1)::int)
    )
  );
CREATE POLICY "facturas_pdf_write"
  ON storage.objects FOR ALL
  USING (bucket_id = 'facturas-pdf' AND public.has_role('ADMINISTRACION'))
  WITH CHECK (bucket_id = 'facturas-pdf' AND public.has_role('ADMINISTRACION'));

COMMIT;
