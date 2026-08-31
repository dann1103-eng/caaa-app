-- El cronómetro del trabajo arrancaba en ±6 horas de forma intermitente.
--
-- `orden_trabajo.creado_en` es `timestamp` SIN zona y su DEFAULT era `now()`,
-- que se resuelve con la zona de la SESIÓN. La conexión de la app fija
-- America/El_Salvador (config/db.js), pero lo hace sin esperar la respuesta y el
-- pooler de Supabase puede reiniciar ese estado; además cualquier script que
-- escriba sin fijarla (migraciones, seeds) guarda en UTC. Resultado: filas con
-- dos bases distintas, y una resta contra NOW() que salía ±6h según con qué
-- zona se hubiera escrito la fila y con cuál se leyera.
--
-- Fijar la zona en el DEFAULT hace que el valor guardado sea SIEMPRE hora de
-- El Salvador, escriba quien escriba. La lectura va fijada igual en el
-- controller. No convierte filas viejas: solo quita la fuente de la deriva.
ALTER TABLE orden_trabajo
  ALTER COLUMN creado_en SET DEFAULT (now() AT TIME ZONE 'America/El_Salvador');

-- Misma familia: la bodega guarda con el mismo patrón y hoy nadie le calcula
-- duraciones, pero dejar el DEFAULT dependiente de la sesión es sembrar el
-- mismo error para la próxima pantalla que sí las calcule.
ALTER TABLE taller_documento_inventario
  ALTER COLUMN creado_en SET DEFAULT (now() AT TIME ZONE 'America/El_Salvador');
