-- =============================================================================
-- Alta de dos aeronaves nuevas: YS-155-PE (Piper Cherokee 140) y
-- YS-259-PE (Cessna 310, bimotor).
--
-- CONTEXTO (sesión 2026-07-14): la escuela necesita AGENDAR vuelos con estos dos
-- aviones YA, pero todavía no tiene los datos de pesada (empty weight / CG) para
-- armarles la plantilla de peso y balance. Por eso se dan de alta con
-- id_wb_plantilla = NULL: el avión queda agendable, volable y reportable, y el
-- loadsheet digital simplemente avisa que aún no está disponible (se llena a mano
-- por ahora). Es el mismo patrón que ya usa SIM-1, que vive con wb NULL.
-- Cuando Daniel consiga los datos se crea la wb_plantilla y se linkea; el
-- loadsheet se activa solo, sin tocar nada más.
--
-- DECISIONES DE DANIEL (sesión 2026-07-14):
--   * YS-155-PE (Cherokee 140) → licencias Instrumentos(3), Comercial(2) e
--     Instructor(6). NO Privado(1): los alumnos de Privado no lo pueden agendar.
--   * YS-259-PE (Cessna 310)   → SOLO Bimotor(5). A propósito NO se le da a
--     Instructor(6), aunque hoy Instructor tenga todas las demás aeronaves:
--     no necesariamente tienen habilitación multimotor.
--     ⚠️ OJO: si alguna vez se vuelve a correr
--     20260711000002_licencia_instructor_todas_aeronaves.sql, ese script hace
--     `INSERT ... SELECT 6, id_aeronave FROM aeronave` y le daría el bimotor a
--     Instructor por error. Es un script de migración de datos de una sola vez.
--   * Tarifa del 310 = $600/hr (la que la escuela ya tenía cargada como
--     'Bimotor'). Se crea vinculada por id_aeronave, que es el match que prioriza
--     cargarVueloACuentaDentroTx (el match por texto de modelo no serviría,
--     porque el modelo de la aeronave es 'CESSNA-310' y no 'Bimotor').
--   * Tarifa del Cherokee 140: PENDIENTE, Daniel la configura desde
--     Contabilidad → Tarifas. Hasta entonces, al cerrar un vuelo de este avión el
--     cargo automático falla y se traga el error (ver instructorReporteController
--     ~línea 323): el reporte cierra bien pero NO se debita el saldo, y agregar la
--     tarifa después NO cobra los vuelos ya cerrados (habría que cargarlos a mano).
--
-- NOTAS DE DATOS:
--   * horas_proxima_revision = 50 / tipo_proxima_revision = '50HR': la pantalla
--     /mantenimiento hace parseFloat(horas_proxima_revision).toFixed(1) SIN guarda,
--     así que dejarlo en NULL mostraría "NaN" en la tabla. 50/50HR es la misma
--     convención que el resto de la flota. El módulo Taller lo re-sincroniza
--     (syncProximaRevisionAeronave) cuando se le carguen inspecciones reales.
--   * horas_acumuladas = 0: Daniel puede ajustarlas con "horas manuales" en
--     /mantenimiento cuando tenga las horas reales de célula.
--   * color = NULL: no se inventa el esquema de pintura (se usa en el código de
--     color de la Proyección). SIM-1 ya vive con color NULL sin problema.
-- =============================================================================

BEGIN;

-- 0) Alinear la secuencia: los seeds originales insertaron ids explícitos (1..5),
--    así que el sequence puede haber quedado atrás y un INSERT con id por DEFAULT
--    chocaría con una fila existente.
SELECT setval(
  'aeronave_id_aeronave_seq',
  (SELECT COALESCE(MAX(id_aeronave), 1) FROM aeronave),
  true
);

-- 1) Las aeronaves (sin plantilla de peso y balance todavía).
INSERT INTO aeronave (
  codigo, modelo, tipo, activa, color, id_wb_plantilla,
  frecuencias_default, horas_acumuladas,
  horas_proxima_revision, tipo_proxima_revision, estado
) VALUES
  ('YS-155-PE', 'CHEROKEE-140', 'AVION', true, NULL, NULL,
   '[{"frecuencia": "121.900", "descripcion": "Torre MSSS"}, {"frecuencia": "118.300", "descripcion": "Torre"}, {"frecuencia": "129.225", "descripcion": "Aprox"}, {"frecuencia": "129.200", "descripcion": "Escuela"}]'::jsonb,
   0.00, 50.00, '50HR', 'ACTIVO'),
  ('YS-259-PE', 'CESSNA-310', 'AVION', true, NULL, NULL,
   '[{"frecuencia": "121.900", "descripcion": "Torre MSSS"}, {"frecuencia": "118.300", "descripcion": "Torre"}, {"frecuencia": "129.225", "descripcion": "Aprox"}, {"frecuencia": "129.200", "descripcion": "Escuela"}]'::jsonb,
   0.00, 50.00, '50HR', 'ACTIVO')
ON CONFLICT (codigo) DO NOTHING;

-- 2) Qué licencia puede volar qué (esto es lo que valida agendarController y el
--    modal Agendar del calendario; sin estas filas el avión no se puede elegir).

-- YS-155-PE → Instrumentos(3), Comercial(2), Instructor(6).
INSERT INTO licencia_aeronave (id_licencia, id_aeronave)
SELECT lic, a.id_aeronave
FROM aeronave a
CROSS JOIN unnest(ARRAY[3, 2, 6]) AS lic
WHERE a.codigo = 'YS-155-PE'
ON CONFLICT (id_licencia, id_aeronave) DO NOTHING;

-- YS-259-PE → SOLO Bimotor(5). (Ver nota de arriba sobre Instructor.)
INSERT INTO licencia_aeronave (id_licencia, id_aeronave)
SELECT 5, a.id_aeronave
FROM aeronave a
WHERE a.codigo = 'YS-259-PE'
ON CONFLICT (id_licencia, id_aeronave) DO NOTHING;

-- 3) Tarifa del bimotor: $600/hr, vinculada por id_aeronave.
--    aeronave_tarifa no tiene constraint único por id_aeronave, así que la
--    idempotencia se hace con NOT EXISTS en vez de ON CONFLICT.
INSERT INTO aeronave_tarifa (id_aeronave, modelo_aeronave, tarifa_hora_usd, vigente_desde)
SELECT a.id_aeronave, 'Cessna 310', 600.00, '2026-01-01'
FROM aeronave a
WHERE a.codigo = 'YS-259-PE'
  AND NOT EXISTS (
    SELECT 1 FROM aeronave_tarifa t WHERE t.id_aeronave = a.id_aeronave
  );

COMMIT;

-- =============================================================================
-- Verificación
-- =============================================================================

-- Las dos aeronaves nuevas, sin plantilla de P&B (id_wb_plantilla debe ir NULL).
SELECT id_aeronave, codigo, modelo, tipo, activa, estado,
       id_wb_plantilla, horas_acumuladas, horas_proxima_revision, tipo_proxima_revision
FROM aeronave
WHERE codigo IN ('YS-155-PE', 'YS-259-PE')
ORDER BY codigo;

-- Licencias: 155-PE debe dar 3 filas (Comercial/Instrumentos/Instructor)
-- y 259-PE exactamente 1 (Bimotor).
SELECT a.codigo, l.id_licencia, l.nombre AS licencia
FROM licencia_aeronave la
JOIN aeronave a ON a.id_aeronave = la.id_aeronave
JOIN licencia l ON l.id_licencia = la.id_licencia
WHERE a.codigo IN ('YS-155-PE', 'YS-259-PE')
ORDER BY a.codigo, l.id_licencia;

-- Tarifa: solo el 259-PE debe traer una ($600). El 155-PE va sin tarifa a propósito.
SELECT a.codigo, t.modelo_aeronave, t.tarifa_hora_usd, t.vigente_desde
FROM aeronave_tarifa t
JOIN aeronave a ON a.id_aeronave = t.id_aeronave
WHERE a.codigo IN ('YS-155-PE', 'YS-259-PE')
ORDER BY a.codigo;
