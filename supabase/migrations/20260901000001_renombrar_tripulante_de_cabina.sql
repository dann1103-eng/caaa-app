-- Renombrar "Sobrecargo" a "Tripulante de Cabina" en todo lo que se MUESTRA.
--
-- Decisión de Daniel (2026-09-01): "tripulante de cabina" es como se llama hoy
-- el puesto en la industria y es lo que espera ver una escuela que ofrece el
-- programa. "Sobrecargo" queda como el término coloquial, no como la etiqueta
-- del sistema.
--
-- Es un cambio de NOMBRE, no de modelo: la licencia sigue siendo la id 7 con
-- `vuela = false`, y ningún código compara contra el texto — se verificó antes
-- de correr esto. CAAA no tiene ningún alumno con esa licencia todavía, así que
-- el renombre no afecta a nadie en producción.

UPDATE licencia
   SET nombre = 'Tripulante de Cabina'
 WHERE nombre = 'Sobrecargo';

-- El curso del escenario de demostración lo llevaba entre paréntesis.
UPDATE curso
   SET nombre = 'Tripulante de Cabina'
 WHERE nombre = 'Tripulante de Cabina (Sobrecargo)';
