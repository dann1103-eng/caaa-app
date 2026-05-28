const jwt = require("jsonwebtoken");

/**
 * Middleware que permite el acceso si:
 * 1. Hay un token JWT válido (usuario logueado)
 * 2. O si se provee la PROYECCION_KEY correcta en los headers o query params.
 */
module.exports = (req, res, next) => {
  const proyeccionKey = process.env.PROYECCION_KEY;
  const clientKey = req.headers["x-proyeccion-key"] || req.query.key;

  // 1. Validar por Llave Secreta
  if (proyeccionKey && clientKey === proyeccionKey) {
    req.user = { id_usuario: 0, username: 'proyeccion', rol: 'PROYECCION' };
    return next();
  }

  // 2. Validar por JWT (sesión normal)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      return next();
    } catch (err) {
      // Si el token falló pero no había llave, seguimos al error
    }
  }

  return res.status(401).json({ 
    message: "No autorizado. Se requiere sesión activa o llave de proyección válida." 
  });
};
