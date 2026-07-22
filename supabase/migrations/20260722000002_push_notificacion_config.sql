-- ---------------------------------------------------------------------------
-- Configuración de push por (tipo de evento, rol): qué perfiles reciben qué
-- notificaciones push del navegador. Antes notificarStaff() mandaba TODO a
-- TODOS los roles no-ALUMNO sin distinción (Taller y Dueño recibían avisos de
-- hangar/ticker que no les correspondían). Ahora es una matriz editable desde
-- Administración (solo ADMIN).
--
-- Sembrada con habilitado=TRUE para toda combinación tipo×rol: el
-- comportamiento por defecto es IDÉNTICO al de antes (todo-a-todos) hasta que
-- un ADMIN apague explícitamente alguna combinación. Aditiva.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS push_notificacion_config (
  tipo       TEXT NOT NULL,
  rol        TEXT NOT NULL,
  habilitado BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (tipo, rol)
);

INSERT INTO push_notificacion_config (tipo, rol, habilitado)
SELECT t.tipo, r.rol, TRUE
FROM (VALUES ('CICLO_TURNO'), ('VUELO_ESTADO'), ('TICKER'), ('OPERACIONES'), ('TRIPULACION'), ('MANTENIMIENTO')) AS t(tipo)
CROSS JOIN (VALUES ('ADMIN'), ('ADMINISTRACION'), ('PROGRAMACION'), ('TURNO'), ('INSTRUCTOR'), ('TALLER'), ('DUENO')) AS r(rol)
ON CONFLICT (tipo, rol) DO NOTHING;
