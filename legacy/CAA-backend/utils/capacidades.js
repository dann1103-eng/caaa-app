const db = require("../config/db");

/**
 * Capacidades por usuario (tipos de instructor + toggle de programación).
 *
 * Fuente de verdad: la BD (tabla `instructor`), NO el token — así los toggles
 * aplican sin re-login y un token viejo (emitido antes del despliegue de los
 * flags) nunca concede ni niega de más. Los flags que viajan en el JWT son
 * solo para UX del frontend (mostrar/ocultar navegación).
 *
 * Capacidades de un INSTRUCTOR:
 *   PROGRAMAR   → puede_programar      (todo lo que hace el rol PROGRAMACION)
 *   VUELO       → es_instructor_vuelo  (gestión de vuelos/solicitudes de alumnos)
 *   AULA        → es_instructor_teoria (Aula Virtual: sesiones, notas, material)
 *   OPERACIONES → puede_operaciones    (todo lo que hace el rol TURNO)
 */

// Roles que programan sin depender de flags de instructor.
const ROLES_PROGRAMACION = ["ADMIN", "PROGRAMACION"];

/**
 * Fila de `instructor` del usuario autenticado (o null si no tiene ficha).
 * Memoizada en req._capacidades para no repetir la consulta en un request.
 */
async function getCapacidadesInstructor(req) {
  if (req._capacidades !== undefined) return req._capacidades;
  let cap = null;
  if (req.user?.rol === "INSTRUCTOR") {
    const r = await db.query(
      `SELECT id_instructor, activo, es_instructor_vuelo, es_instructor_teoria, puede_programar, puede_operaciones
         FROM instructor
        WHERE id_usuario = $1`,
      [req.user.id_usuario]
    );
    cap = r.rows[0] || null;
  }
  req._capacidades = cap;
  return cap;
}

/** true si el usuario puede operar programación (rol o toggle). */
async function puedeProgramar(req) {
  const rol = req.user?.rol;
  if (ROLES_PROGRAMACION.includes(rol)) return true;
  if (rol !== "INSTRUCTOR") return false;
  const cap = await getCapacidadesInstructor(req);
  return !!(cap && cap.activo && cap.puede_programar);
}

/**
 * Middleware: pasa si el rol está en `roles`, o si es un INSTRUCTOR activo con
 * la capacidad indicada ('PROGRAMAR' | 'VUELO' | 'AULA' | 'OPERACIONES'). Reemplaza
 * a roleMiddleware en rutas donde un instructor con toggle debe entrar.
 */
function requireCapacidad(roles, capacidad) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ message: "No autenticado" });
      if (allowed.includes(req.user.rol)) return next();
      if (req.user.rol === "INSTRUCTOR") {
        const cap = await getCapacidadesInstructor(req);
        if (cap && cap.activo) {
          if (capacidad === "PROGRAMAR" && cap.puede_programar) return next();
          if (capacidad === "VUELO" && cap.es_instructor_vuelo) return next();
          if (capacidad === "AULA" && cap.es_instructor_teoria) return next();
          if (capacidad === "OPERACIONES" && cap.puede_operaciones) return next();
        }
      }
      return res.status(403).json({ message: "Acceso denegado" });
    } catch (e) {
      next(e);
    }
  };
}

/**
 * Gate para el Aula Virtual: los roles no-INSTRUCTOR pasan (ya los filtra
 * roleMiddleware); un INSTRUCTOR requiere es_instructor_teoria. Así un instructor
 * solo-de-vuelo no ve/gestiona el aula.
 */
async function aulaInstructorGate(req, res, next) {
  try {
    if (req.user?.rol !== "INSTRUCTOR") return next();
    const cap = await getCapacidadesInstructor(req);
    if (cap && cap.activo && cap.es_instructor_teoria) return next();
    return res.status(403).json({ ok: false, message: "No tenés habilitado el módulo de teoría (Aula Virtual)." });
  } catch (e) {
    next(e);
  }
}

module.exports = { getCapacidadesInstructor, puedeProgramar, requireCapacidad, aulaInstructorGate, ROLES_PROGRAMACION };
