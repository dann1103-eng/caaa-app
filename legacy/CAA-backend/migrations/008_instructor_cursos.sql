-- =============================================================================
-- Migración 008: Asignación de cursos del aula a instructores
--
-- Relaciona instructor ↔ curso para que el Aula Virtual del instructor muestre
-- solo SUS cursos asignados. Si un instructor no tiene ninguna asignación, el
-- aula sigue mostrándole todos los cursos (retrocompatibilidad).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS instructor_curso (
  id_instructor INTEGER NOT NULL REFERENCES instructor(id_instructor) ON DELETE CASCADE,
  id_curso      INTEGER NOT NULL REFERENCES curso(id) ON DELETE CASCADE,
  creado_en     TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id_instructor, id_curso)
);

COMMIT;
