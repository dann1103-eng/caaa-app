const db = require("../config/db");

// Gate de ruta para el "lado estudiante" de un vuelo (plan de vuelo, W&B,
// loadsheet, reporte). Permite:
//   - rol ALUMNO (flujo normal), o
//   - cualquier usuario autenticado que sea el ALUMNO-DE-REGISTRO del vuelo,
//     aunque su rol sea INSTRUCTOR (el practicante operando su vuelo de práctica,
//     cuya ficha espejo cuelga de su mismo usuario).
// La autorización fina por vuelo la sigue haciendo puedeAccederVuelo dentro de
// cada controller; este gate solo evita el rechazo temprano por rol.
module.exports = async (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: "No autenticado" });
  if (req.user.rol === "ALUMNO") return next();

  const idVuelo = Number(req.params.id_vuelo ?? req.params.id);
  if (!Number.isInteger(idVuelo)) {
    return res.status(400).json({ message: "Identificador de vuelo inválido" });
  }
  try {
    const r = await db.query(
      `SELECT 1 FROM vuelo v
         JOIN alumno al ON al.id_alumno = v.id_alumno
        WHERE v.id_vuelo = $1 AND al.id_usuario = $2
        LIMIT 1`,
      [idVuelo, req.user.id_usuario]
    );
    if (r.rows.length) return next();
    return res.status(403).json({ message: "No tenés acceso a este vuelo" });
  } catch (e) {
    console.error("accesoEstudianteVuelo:", e);
    return res.status(500).json({ message: "Error de autorización" });
  }
};
