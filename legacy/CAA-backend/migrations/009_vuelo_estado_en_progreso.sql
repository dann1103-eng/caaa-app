-- Fix de deriva de esquema: el código avanza el estado del vuelo a 'EN_PROGRESO'
-- (instructorVueloController NEXT_ESTADO_INSTRUCTOR: SALIDA_HANGAR -> EN_PROGRESO),
-- pero el CHECK constraint viejo solo permitía 'EN_VUELO'. Resultado: el UPDATE
-- fallaba con "violates check constraint" y el instructor no podía avanzar el vuelo
-- más allá de SALIDA_HANGAR (la barra de progreso quedaba clavada).
--
-- Se amplía el constraint para incluir TODOS los estados que el código usa
-- (se conserva EN_VUELO por compatibilidad y se agrega EN_PROGRESO + PROGRAMADO).
-- Cambio no destructivo: el nuevo conjunto es supersét del anterior.

ALTER TABLE vuelo DROP CONSTRAINT IF EXISTS vuelo_estado_check;

ALTER TABLE vuelo ADD CONSTRAINT vuelo_estado_check CHECK (
  (estado)::text = ANY (ARRAY[
    'SOLICITADO',
    'AJUSTADO',
    'PUBLICADO',
    'PROGRAMADO',
    'SALIDA_HANGAR',
    'EN_VUELO',
    'EN_PROGRESO',
    'REGRESO_HANGAR',
    'FINALIZANDO',
    'COMPLETADO',
    'CANCELADO'
  ]::text[])
);
