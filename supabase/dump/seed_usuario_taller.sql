-- Usuario de prueba del módulo Taller (rol TALLER, mecánico).
-- Convención de los demás demo (u1..u9): password en texto plano 'demo123',
-- que authController convierte a bcrypt en el primer login. Sin bloqueos.
-- Idempotente.
INSERT INTO usuario
  (username, password_hash, rol, nombre, apellido, correo,
   activo, must_change_password, must_set_email)
VALUES
  ('u_taller', 'demo123', 'TALLER', 'Taller', 'Prueba', NULL,
   TRUE, FALSE, FALSE)
ON CONFLICT (username) DO UPDATE
  SET rol = 'TALLER',
      password_hash = 'demo123',
      activo = TRUE,
      must_change_password = FALSE,
      must_set_email = FALSE;
