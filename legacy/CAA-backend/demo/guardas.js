/**
 * Candados del entorno de demo.
 *
 * 🚨 Esto habilita un endpoint que BORRA la base entera. Es lo más peligroso que
 * tiene el sistema, así que va con tres candados independientes: cualquiera de
 * los tres, por sí solo, alcanza para que no pase nada.
 *
 *   1. DEMO_MODE === "true" en el entorno.  Sin eso la ruta ni se registra:
 *      responde 404, no 403. Una ruta que no existe no se puede forzar.
 *   2. El CENTINELA en la base (ver abajo).
 *   3. Rol ADMIN + escribir una frase exacta en el body.
 *
 * ⚠️ Por qué un centinela y no el nombre de la base, que era la idea original:
 * **toda** instalación de Supabase llama `postgres` a su base. La de CAAA y la
 * del demo se llaman igual, así que comprobar el nombre no protege de nada. El
 * centinela, en cambio, es una fila que alguien tuvo que crear a propósito.
 */
const db = require("../config/db");

const FRASE = "ESTA BASE ES DESECHABLE";

/** ¿El despliegue está marcado como demo? Se lee una vez, al arrancar. */
const esDemo = () => String(process.env.DEMO_MODE || "").trim().toLowerCase() === "true";

/**
 * ¿La BASE está marcada como desechable? Se consulta cada vez, no se cachea:
 * el caso que importa es apuntar por error un backend de demo a la base de
 * producción, y ahí el valor cacheado al arrancar sería el equivocado.
 */
async function baseEsDesechable() {
  try {
    const r = await db.query(
      `SELECT confirmacion FROM demo_sentinela LIMIT 1`
    );
    return r.rows.length > 0 && r.rows[0].confirmacion === FRASE;
  } catch {
    // La tabla no existe: no es una base de demo. Es el caso normal en CAAA.
    return false;
  }
}

/**
 * Middleware para las rutas destructivas. Devuelve 403 con un motivo legible,
 * porque acá el 404 ya lo dio el router al no registrarse.
 */
async function exigirBaseDesechable(req, res, next) {
  if (!(await baseEsDesechable())) {
    return res.status(403).json({
      ok: false,
      message:
        "Esta base no está marcada como desechable. El reinicio solo corre contra la base del demo, " +
        `que lleva la tabla demo_sentinela con la frase "${FRASE}". Ver docs/demo/RUNBOOK.md.`,
    });
  }
  next();
}

module.exports = { FRASE, esDemo, baseEsDesechable, exigirBaseDesechable };
