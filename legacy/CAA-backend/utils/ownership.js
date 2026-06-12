const db = require("../config/db");

// Roles de staff que pueden operar sobre cualquier vuelo (no están atados a un
// alumno o instructor específico). PROYECCION sólo llega por proyeccionMiddleware
// en rutas de lectura pública, pero lo incluimos por seguridad.
const STAFF_ROLES = ["ADMIN", "PROGRAMACION", "TURNO", "ADMINISTRACION", "TALLER", "PROYECCION"];

/**
 * Verifica que el usuario autenticado tenga derecho a operar sobre un vuelo.
 *
 *  - ALUMNO      → el vuelo debe ser suyo (vuelo.id_alumno).
 *  - INSTRUCTOR  → el vuelo debe ser suyo (vuelo.id_instructor).
 *  - Staff       → permitido (gestionan todos los vuelos).
 *
 * Previene IDOR (Insecure Direct Object Reference): que un alumno/instructor
 * acceda o modifique datos de un vuelo ajeno cambiando el id en la URL.
 *
 * Si está autorizado devuelve `true`. Si no, responde 403/404 sobre `res` y
 * devuelve `false` — el controller debe hacer `if (!(await ...)) return;`.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {number|string} idVuelo
 * @returns {Promise<boolean>}
 */
async function puedeAccederVuelo(req, res, idVuelo) {
  const rol = req.user?.rol;

  if (STAFF_ROLES.includes(rol)) return true;

  const idNum = Number(idVuelo);
  if (!Number.isInteger(idNum)) {
    res.status(400).json({ message: "Identificador de vuelo inválido" });
    return false;
  }

  const r = await db.query(
    `SELECT al.id_usuario AS alumno_uid,
            i.id_usuario  AS instructor_uid
       FROM vuelo v
       LEFT JOIN alumno al    ON al.id_alumno     = v.id_alumno
       LEFT JOIN instructor i ON i.id_instructor  = v.id_instructor
      WHERE v.id_vuelo = $1`,
    [idNum]
  );

  if (r.rows.length === 0) {
    res.status(404).json({ message: "Vuelo no encontrado" });
    return false;
  }

  const { alumno_uid, instructor_uid } = r.rows[0];
  const uid = req.user?.id_usuario;

  if (rol === "ALUMNO" && alumno_uid === uid) return true;
  if (rol === "INSTRUCTOR" && instructor_uid === uid) return true;

  res.status(403).json({ message: "No tenés acceso a este vuelo" });
  return false;
}

module.exports = { puedeAccederVuelo, STAFF_ROLES };
