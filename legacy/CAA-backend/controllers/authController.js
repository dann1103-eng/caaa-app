const db = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 3;

exports.login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: "Datos incompletos" });
  }

  const u = String(username).trim().toLowerCase();

  // ── En que esquema vive esta cuenta ──────────────────────────────────────
  // El login corre ANTES de saber quien es el usuario, asi que no puede
  // rutearse solo: hay que preguntar primero. public.demo_cuenta es la unica
  // pieza compartida entre los dos esquemas y dice que usuarios son de
  // demostracion. Se consulta contra poolPublic EXPLICITAMENTE, nunca ruteado.
  let esquema = "public";
  try {
    const d = await db.poolPublic.query(
      `SELECT 1 FROM demo_cuenta WHERE LOWER(username) = $1`, [u]
    );
    if (d.rows.length) esquema = "demo";
  } catch (e) {
    // La tabla no existe (instalacion sin demo): todo el mundo va a public.
  }

  return db.enEsquema(esquema, () => loginEn(req, res, u, password, esquema));
};

async function loginEn(req, res, u, password, esquema) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
      SELECT
        u.id_usuario,
        u.username,
        u.nombre,
        u.apellido,
        u.correo,
        u.rol,
        u.password_hash,
        u.must_change_password,
        u.must_set_email,
        u.datos_confirmados,
        u.failed_login_count,
        u.locked_until,
        a.numero_licencia,
        a.certificado_medico,
        a.seguro_vida,
        a.seguro_vida_numero,
        a.certificado_medico_numero,
        -- Si el programa del alumno se vuela. El panel enciende o apaga los
        -- bloques de vuelo con esto; el front NO lo deduce de otra cosa.
        -- COALESCE true: quien no tiene ficha de alumno (staff) no cambia en nada.
        COALESCE(lic.vuela, true) AS vuela,
        ins.id_instructor,
        ins.es_instructor_vuelo,
        ins.es_instructor_teoria,
        ins.puede_programar,
        ins.puede_operaciones
      FROM usuario u
      LEFT JOIN alumno a ON a.id_usuario = u.id_usuario
      LEFT JOIN licencia lic ON lic.id_licencia = a.id_licencia
      LEFT JOIN instructor ins ON ins.id_usuario = u.id_usuario
      WHERE LOWER(u.username) = LOWER($1)
        AND u.activo = true
      FOR UPDATE OF u
      `,
      [u]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(401).json({ message: "Usuario o contraseña incorrectos" });
    }

    const user = result.rows[0];

    // ... (skipped code for brevity in instruction, but keeping it in replacement)
    
    // Robapantallas de primer login: alumnos e instructores deben confirmar sus
    // datos generales (contacto + fiscales) antes de entrar al home.
    const mustConfirmData = (user.rol === 'ALUMNO' || user.rol === 'INSTRUCTOR') && !user.datos_confirmados;
    const mustCompleteProfile = user.must_change_password || user.must_set_email || mustConfirmData;

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        message: "Cuenta bloqueada por intentos fallidos. Intentá de nuevo en unos minutos.",
        locked_until: user.locked_until,
      });
    }

    let ok = false;
    let isPlaintext = false;

    if (user.password_hash && user.password_hash.startsWith("$2")) {
      const hash = user.password_hash.replace("$2y$", "$2b$");
      ok = await bcrypt.compare(password, hash);
    } else {
      ok = user.password_hash === password;
      isPlaintext = true;
    }

    // Si el login fue exitoso y era texto plano, hashear ahora mismo
    if (ok && isPlaintext) {
      const newHash = await bcrypt.hash(password, 10);
      await client.query(
        "UPDATE usuario SET password_hash = $1 WHERE id_usuario = $2",
        [newHash, user.id_usuario]
      );
    }

    if (!ok) {
      const nextCount = (user.failed_login_count || 0) + 1;

      if (nextCount >= MAX_ATTEMPTS) {
        await client.query(
          `
          UPDATE usuario
          SET failed_login_count = 0,
              locked_until = now() + ($1 || ' minutes')::interval
          WHERE id_usuario = $2
          `,
          [LOCK_MINUTES, user.id_usuario]
        );

        await client.query("COMMIT");
        return res.status(403).json({
          message: `Demasiados intentos. Cuenta bloqueada por ${LOCK_MINUTES} minutos.`,
        });
      }

      await client.query(
        `
        UPDATE usuario
        SET failed_login_count = $1,
            locked_until = NULL
        WHERE id_usuario = $2
        `,
        [nextCount, user.id_usuario]
      );

      await client.query("COMMIT");
      return res.status(401).json({
        message: "Usuario o contraseña incorrectos",
        intentos_restantes: MAX_ATTEMPTS - nextCount,
      });
    }

    const crypto = require("crypto");
    const currentSessionId = crypto.randomUUID();

    await client.query(
      `
      UPDATE usuario
      SET failed_login_count = 0,
          locked_until = NULL,
          current_session_id = $1
      WHERE id_usuario = $2
      `,
      [currentSessionId, user.id_usuario]
    );

    await client.query("COMMIT");

    // Capacidades del instructor (tipos + programación). En el token/response
    // son solo para UX del frontend; los gates del backend consultan la BD
    // (utils/capacidades) para que un toggle aplique sin re-login.
    const capacidades = {
      id_instructor: user.id_instructor ?? null,
      es_instructor_vuelo: user.es_instructor_vuelo ?? null,
      es_instructor_teoria: user.es_instructor_teoria ?? null,
      puede_programar: user.puede_programar ?? null,
      puede_operaciones: user.puede_operaciones ?? null,
    };

    const payload = {
      id_usuario: user.id_usuario,
      username: user.username,
      nombre: user.nombre,
      apellido: user.apellido,
      rol: user.rol,
      ...capacidades,
      must_change_password: user.must_change_password,
      must_set_email: user.must_set_email,
      must_confirm_data: mustConfirmData,
      must_complete_profile: mustCompleteProfile,
      // Firmado: nadie puede pasarse a demo -- ni salirse -- tocando la peticion.
      esquema,
      session_id: currentSessionId,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN,
    });

    return res.json({
      token,
      user: {
        id_usuario: user.id_usuario,
        username: user.username,
        nombre: user.nombre,
        apellido: user.apellido,
        correo: user.correo,
        rol: user.rol,
        ...capacidades,
        // Si el programa del alumno se vuela. Va en LOS DOS literales (login y
        // refresh): agregarlo solo al SELECT no alcanza -- la respuesta se arma
        // campo por campo y el dato nunca llegaria.
        vuela: user.vuela !== false,
        es_demo: esquema === "demo",
        must_change_password: user.must_change_password,
        must_set_email: user.must_set_email,
        must_confirm_data: mustConfirmData,
        must_complete_profile: mustCompleteProfile,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error login:", error);
    return res.status(500).json({ message: "Error en el servidor" });
  } finally {
    client.release();
  }
}

exports.refresh = async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ message: "No autorizado" });
  const oldToken = header.split(" ")[1];

  try {
    const decoded = jwt.verify(oldToken, process.env.JWT_SECRET);
    // El esquema se ARRASTRA del token viejo. Sin esto, un usuario de demo
    // saltaria a los datos de produccion con solo renovar la sesion -- el mismo
    // agujero que tuvo `vuela` antes de unir alumno en esta misma consulta.
    if (decoded.esquema === "demo") {
      return db.enEsquema("demo", () => refrescarEn(req, res, decoded, "demo"));
    }
    return refrescarEn(req, res, decoded, "public");
  } catch (err) {
    return res.status(401).json({ message: "Token invalido o expirado" });
  }
};

async function refrescarEn(req, res, decoded, esquema) {
  try {
    
    // Obtener datos frescos de la DB para recalcular el estado del perfil
    const result = await db.query(`
      SELECT
        u.id_usuario, u.username, u.nombre, u.apellido, u.rol,
        u.must_change_password, u.must_set_email, u.datos_confirmados,
        ins.id_instructor, ins.es_instructor_vuelo, ins.es_instructor_teoria, ins.puede_programar, ins.puede_operaciones,
        -- Sin esta union el campo llegaria undefined y el literal de abajo lo
        -- resolveria como true: un alumno de un programa de tierra recuperaria
        -- los bloques de vuelo con solo renovar el token.
        -- (Nada de comillas invertidas en estos comentarios: cortan el template
        --  literal de JS que los envuelve.)
        COALESCE(lic.vuela, true) AS vuela
      FROM usuario u
      LEFT JOIN instructor ins ON ins.id_usuario = u.id_usuario
      LEFT JOIN alumno a ON a.id_usuario = u.id_usuario
      LEFT JOIN licencia lic ON lic.id_licencia = a.id_licencia
      WHERE u.id_usuario = $1
    `, [decoded.id_usuario]);

    if (result.rows.length === 0) return res.status(401).json({ message: "Usuario no encontrado" });
    const user = result.rows[0];

    const mustConfirmData = (user.rol === 'ALUMNO' || user.rol === 'INSTRUCTOR') && !user.datos_confirmados;
    const mustCompleteProfile = user.must_change_password || user.must_set_email || mustConfirmData;

    const capacidades = {
      id_instructor: user.id_instructor ?? null,
      es_instructor_vuelo: user.es_instructor_vuelo ?? null,
      es_instructor_teoria: user.es_instructor_teoria ?? null,
      puede_programar: user.puede_programar ?? null,
      puede_operaciones: user.puede_operaciones ?? null,
    };

    const payload = {
      id_usuario: user.id_usuario,
      username: user.username,
      nombre: user.nombre,
      apellido: user.apellido,
      rol: user.rol,
      ...capacidades,
      must_change_password: user.must_change_password,
      must_set_email: user.must_set_email,
      must_confirm_data: mustConfirmData,
      must_complete_profile: mustCompleteProfile,
      // Sin esto el token renovado sale SIN esquema y la siguiente petición
      // del usuario de demo caería sobre los datos de producción.
      esquema,
      session_id: decoded.session_id,
    };

    const newToken = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN,
    });

    res.json({
      token: newToken,
      user: {
        id_usuario: user.id_usuario,
        username: user.username,
        nombre: user.nombre,
        apellido: user.apellido,
        rol: user.rol,
        ...capacidades,
        // Si el programa del alumno se vuela. Va en LOS DOS literales (login y
        // refresh): agregarlo solo al SELECT no alcanza -- la respuesta se arma
        // campo por campo y el dato nunca llegaria.
        vuela: user.vuela !== false,
        must_change_password: user.must_change_password,
        must_set_email: user.must_set_email,
        must_confirm_data: mustConfirmData,
        must_complete_profile: mustCompleteProfile,
        es_demo: esquema === "demo",
      }
    });
  } catch (err) {
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
};
