-- =============================================================================
-- Migración 20260817000005 · Código y revisión de los formularios impresos
--
-- Los formatos de la OMA llevan al pie su código y su revisión controlada
-- (`CAAA-004-F Rev.00 10/Feb/2023`, `CAAA-006-F Rev.02 21/Jul/2025`). La AAC
-- puede publicar una revisión nueva en cualquier momento, y eso NO debe ser un
-- despliegue: por eso viven en una tabla y no incrustados en el generador.
--
-- Spec: docs/superpowers/specs/2026-08-17-solicitud-almacen-sobrantes-design.md
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS taller_formulario (
  clave           VARCHAR(40) PRIMARY KEY,   -- 'SOLICITUD' | 'REQUISICION' | 'ACEITES'
  nombre          VARCHAR(160) NOT NULL,     -- cómo se titula en el papel
  codigo          VARCHAR(40),               -- 'CAAA-004-F'
  revision        VARCHAR(60),               -- 'Rev.00 10/Feb/2023'
  actualizado_en  TIMESTAMP NOT NULL DEFAULT NOW(),
  actualizado_por INTEGER NULL REFERENCES usuario(id_usuario)
);

COMMENT ON TABLE taller_formulario IS
  'Pie de los formatos impresos del Taller. Editable desde la app para que una revisión nueva de la AAC no requiera desplegar.';

INSERT INTO taller_formulario (clave, nombre, codigo, revision) VALUES
  ('REQUISICION', 'REQUISICIONES',                                NULL,         NULL),
  ('SOLICITUD',   'SOLICITUD DE REPUESTOS Y MATERIALES AL ALMACEN','CAAA-004-F','Rev.00. 10/Feb/2023'),
  ('ACEITES',     'CONTROL DE ENTREGA DE ACEITES POR DIA',         NULL,         NULL)
ON CONFLICT (clave) DO NOTHING;

COMMIT;
