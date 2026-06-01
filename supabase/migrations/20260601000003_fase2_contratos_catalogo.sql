-- Fase 2 — Contratos por licencia en el catálogo de documentos
--
-- Los alumnos firman un contrato por cada licencia que estudian. Se modelan como
-- entradas del catálogo de documentos (autoridad CAAA), reutilizando el flujo de
-- documento_alumno (subida de PDF, estados, vencimientos). Idempotente.

INSERT INTO documento_requerido_catalogo (codigo, nombre, autoridad, descripcion, activo)
SELECT v.codigo, v.nombre, 'CAAA', v.descripcion, TRUE
FROM (VALUES
  ('CONTRATO_PP',    'Contrato de servicios — Piloto Privado (PP)',        'Contrato firmado al iniciar el curso de Piloto Privado'),
  ('CONTRATO_IFR',   'Contrato de servicios — Habilitación IFR',           'Contrato firmado al iniciar la habilitación por instrumentos'),
  ('CONTRATO_CPL',   'Contrato de servicios — Piloto Comercial (CPL)',     'Contrato firmado al iniciar el curso de Piloto Comercial'),
  ('CONTRATO_MULTI', 'Contrato de servicios — Piloto Bimotor (MULTI)',     'Contrato firmado al iniciar la habilitación multimotor'),
  ('CONTRATO_INST',  'Contrato de servicios — Piloto Instructor (INST)',   'Contrato firmado al iniciar el curso de instructor')
) AS v(codigo, nombre, descripcion)
WHERE NOT EXISTS (
  SELECT 1 FROM documento_requerido_catalogo c WHERE c.codigo = v.codigo
);

-- Verificación
SELECT codigo, nombre, autoridad FROM documento_requerido_catalogo
WHERE codigo LIKE 'CONTRATO_%' ORDER BY codigo;
