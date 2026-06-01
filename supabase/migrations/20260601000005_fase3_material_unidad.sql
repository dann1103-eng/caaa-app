-- Fase 3 (incremento 2) — Material didáctico por unidad
--
-- Cada unidad teórica puede tener varios archivos adjuntos (PDF, slides, etc.)
-- que el alumno y el instructor pueden ver/descargar. Los archivos viven en
-- Supabase Storage (bucket caaa-archivos); aquí solo se guarda la metadata.

CREATE TABLE IF NOT EXISTS material_unidad (
  id            BIGSERIAL PRIMARY KEY,
  id_unidad     INTEGER NOT NULL REFERENCES unidad_teorica(id) ON DELETE CASCADE,
  nombre        VARCHAR(200) NOT NULL,
  archivo_path  VARCHAR(300) NOT NULL,
  content_type  VARCHAR(120),
  subido_por    INTEGER,
  creado_en     TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_material_unidad ON material_unidad(id_unidad);

-- Verificación
SELECT COUNT(*) AS material_unidad_existe
FROM information_schema.tables WHERE table_name = 'material_unidad';
