-- Habilita el usuario de ADMINISTRACION para pruebas:
-- pone contraseña en texto plano 'demo123' (el login la acepta y la convierte a
-- bcrypt en el primer ingreso), limpia los flags que bloquean el acceso y
-- resetea el bloqueo por intentos fallidos.
UPDATE usuario
SET password_hash = 'demo123',
    must_change_password = false,
    must_set_email = false,
    failed_login_count = 0,
    locked_until = NULL
WHERE username = 'u_admin_fin';

-- Verificación
SELECT id_usuario, username, rol, must_change_password, must_set_email,
       failed_login_count, locked_until
FROM usuario WHERE username = 'u_admin_fin';
