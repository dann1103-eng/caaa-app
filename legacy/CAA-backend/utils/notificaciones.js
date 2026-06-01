// Helpers de notificaciones in-app. Pueden recibir un client de transacción o
// usar el pool por defecto.
const db = require("../config/db");

/** Crea una notificación para un usuario específico. */
async function notificarUsuario(conn, id_usuario, { tipo = "INFO", mensaje, enlace = null }) {
  if (!id_usuario || !mensaje) return;
  await (conn || db).query(
    `INSERT INTO notificacion (id_usuario, tipo, mensaje, enlace) VALUES ($1, $2, $3, $4)`,
    [id_usuario, tipo, mensaje, enlace]
  );
}

/** Crea una notificación para todos los usuarios de uno o varios roles. */
async function notificarRoles(conn, roles, { tipo = "INFO", mensaje, enlace = null }) {
  if (!mensaje) return;
  const lista = Array.isArray(roles) ? roles : [roles];
  await (conn || db).query(
    `INSERT INTO notificacion (id_usuario, tipo, mensaje, enlace)
     SELECT id_usuario, $2, $3, $4 FROM usuario WHERE rol = ANY($1::text[])`,
    [lista, tipo, mensaje, enlace]
  );
}

module.exports = { notificarUsuario, notificarRoles };
