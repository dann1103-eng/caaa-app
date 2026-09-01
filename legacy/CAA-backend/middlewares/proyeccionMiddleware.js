const jwt = require("jsonwebtoken");
const db = require("../config/db");

/**
 * Puerta de las pantallas pasivas (Proyección, METAR, estado de la flota, ticker
 * y ciclo del día). Deja pasar de dos maneras:
 *
 *   1. Con una SESIÓN normal (token JWT), que es como entra cualquier persona
 *      de la escuela desde la app.
 *   2. Con la PROYECCION_KEY, que es como entra el televisor del hangar: una
 *      pantalla colgada en la pared, sin nadie logueado.
 *
 * ── 🚨 EL ORDEN NO ES ARBITRARIO ────────────────────────────────────────────
 * La sesión se evalúa PRIMERO. Antes era al revés y eso tenía dos consecuencias
 * malas: quien abría la Proyección con `?key=` en la URL perdía su identidad y
 * pasaba a ser el usuario anónimo 'PROYECCION', y —peor— la cuenta de
 * demostraciones veía los datos REALES de la escuela.
 *
 * ── 🚨 Y ESTE MIDDLEWARE TIENE QUE ENTRAR AL ESQUEMA ────────────────────────
 * Es la otra puerta de entrada del sistema además de authMiddleware. Leía el
 * token pero nunca llamaba a db.enEsquema, así que sus diez rutas consultaban
 * `public` aunque la sesión fuera de demostración: un prospecto abría el tablero
 * de Proyección y veía los alumnos, instructores y matrículas de verdad.
 *
 * La lección para lo que venga: **el aislamiento no vive en las consultas, vive
 * en las puertas**. Al agregar una forma nueva de autenticar, hay que rutear el
 * esquema ahí mismo, o todo lo que cuelgue de ella lee producción en silencio.
 *
 * La llave, en cambio, siempre cae en `public`: es la llave del televisor de la
 * escuela y no representa a ninguna sesión de demostración.
 */
module.exports = (req, res, next) => {
  // 1. Sesión real. Manda sobre la llave.
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      // El esquema viaja FIRMADO en el token: no se puede falsear desde afuera.
      if (decoded.esquema === "demo") {
        return db.enEsquema("demo", () => next());
      }
      return next();
    } catch (err) {
      // Token vencido o inválido: no se corta acá, todavía puede entrar con la
      // llave. Es el caso del televisor que quedó con una sesión vieja guardada.
    }
  }

  // 2. Llave de proyección (el televisor del hangar). Siempre sobre `public`.
  const proyeccionKey = process.env.PROYECCION_KEY;
  const clientKey = req.headers["x-proyeccion-key"] || req.query.key;
  if (proyeccionKey && clientKey === proyeccionKey) {
    req.user = { id_usuario: 0, username: "proyeccion", rol: "PROYECCION" };
    return next();
  }

  return res.status(401).json({
    message: "No autorizado. Se requiere sesión activa o llave de proyección válida.",
  });
};
