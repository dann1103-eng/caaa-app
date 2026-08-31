const jwt = require("jsonwebtoken");
const db = require("../config/db");

module.exports = async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No autorizado" });
  }

  try {
    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // ── Ruteo de esquema ─────────────────────────────────────────────────
    // El esquema viaja FIRMADO dentro del token, así que nadie puede pasarse a
    // demo -- ni salirse de demo -- manipulando la petición. Se resuelve acá,
    // apenas se verifica el token y ANTES de la primera consulta, para que todo
    // lo que siga (incluida la validación de sesión única de abajo) golpee el
    // esquema correcto.
    if (decoded.esquema === "demo") {
      return db.enEsquema("demo", () => continuar(req, res, next, decoded));
    }
    return continuar(req, res, next, decoded);
  } catch (err) {
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
};

async function continuar(req, res, next, decoded) {
  try {

    // ── Control de Sesión Única (Concurrente) ────────────────────────────────
    // Si el token tiene session_id, validamos contra la DB: si el current_session_id
    // de la BD cambió (login en otro lado), se echa la sesión vieja.
    //
    // EXCEPCIÓN 1: cuentas de uso compartido/multi-dispositivo (u1 = admin del
    // sistema) se eximen — se usan desde varias máquinas/pestañas a la vez y la
    // sesión única las deslogueaba "de la nada" cada vez que alguien más entraba
    // con la misma cuenta. El resto conserva sesión única (evita que un alumno
    // comparta su cuenta con otros).
    //
    // EXCEPCIÓN 2: TODA sesión de demostración. Son dos motivos distintos y cada
    // uno alcanza por sí solo:
    //   · Una demostración se da con la laptop y el proyector a la vez, y puede
    //     haber dos andando para prospectos distintos.
    //   · El reinicio vacía demo.usuario y la vuelve a sembrar con un
    //     current_session_id nuevo. Sin esta excepción, apretar "Reiniciar demo"
    //     delante de un prospecto te escupe a la pantalla de login.
    // No se pierde nada: la sesión única protege datos de personas, y en `demo`
    // no hay ninguno — son datos inventados hechos para mostrarse. El esquema
    // viaja FIRMADO en el token, así que esto no se puede activar desde afuera.
    const SESION_MULTIPLE = new Set(["u1"]);
    const sesionCompartida =
      SESION_MULTIPLE.has(decoded.username) || decoded.esquema === "demo";
    if (decoded.session_id && !sesionCompartida) {
      const result = await db.query(
        "SELECT current_session_id FROM usuario WHERE id_usuario = $1",
        [decoded.id_usuario]
      );

      const dbSessionId = result.rows[0]?.current_session_id;
      if (dbSessionId && dbSessionId !== decoded.session_id) {
        return res.status(401).json({
          message: "Sesión cerrada: se ha iniciado sesión en otro dispositivo.",
          session_conflict: true
        });
      }
    }

    // ── Política de Cambio Obligatorio ──────────────────────────────────────
    // Si el usuario debe cambiar contraseña o correo, bloqueamos todo
    // EXCEPTO las rutas de perfil y cambio de credenciales.
    const mustCompleteProfile = decoded.must_complete_profile;
    
    if (mustCompleteProfile) {
      const allowedPaths = [
        "/api/usuario/perfil",
        "/api/usuario/cambiar-password",
        "/api/usuario/cambiar-correo",
        "/api/usuario/update-info",
        "/api/usuario/update-perfil-alumno",
        "/api/usuario/confirmar-datos",
        "/api/auth/refresh",
        "/api/auth/logout"
      ];
      
      // req.baseUrl + req.path nos da la ruta completa
      const fullPath = (req.baseUrl + req.path).replace(/\/$/, "");
      
      if (!allowedPaths.includes(fullPath)) {
        return res.status(403).json({ 
          message: "Debe completar la actualización de su perfil (correo/contraseña) antes de continuar.",
          must_complete_profile: true 
        });
      }
    }

    next();
  } catch (err) {
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
}
