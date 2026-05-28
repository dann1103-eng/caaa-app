/**
 * Middleware para restringir acceso por rol.
 * Debe usarse después de authMiddleware.
 *
 * Roles válidos:
 *   ADMIN, PROGRAMACION, TURNO, ALUMNO, INSTRUCTOR, ADMINISTRACION
 *
 * ADMINISTRACION gestiona el módulo Contabilidad/Finanzas.
 * ADMIN puede coexistir como rol de operaciones; en endpoints de lectura
 * financiera se pasan ambos: roleMiddleware(["ADMIN","ADMINISTRACION"]).
 */
const VALID_ROLES = ['ADMIN','PROGRAMACION','TURNO','ALUMNO','INSTRUCTOR','ADMINISTRACION'];

module.exports = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "No autenticado" });
    }

    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    if (!allowedRoles.includes(req.user.rol)) {
      return res.status(403).json({ message: "Acceso denegado" });
    }

    next();
  };
};

module.exports.VALID_ROLES = VALID_ROLES;
