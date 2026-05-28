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
        u.failed_login_count,
        u.locked_until,
        a.numero_licencia,
        a.certificado_medico,
        a.seguro_vida,
        a.seguro_vida_numero,
        a.certificado_medico_numero
      FROM usuario u
      LEFT JOIN alumno a ON a.id_usuario = u.id_usuario
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
    
    // Calculate if profile is incomplete (for Alumnos)
    const docsIncompletos = user.rol === 'ALUMNO' && (
      !user.numero_licencia || user.numero_licencia.trim() === '' ||
      !user.certificado_medico ||
      !user.certificado_medico_numero || user.certificado_medico_numero.trim() === '' ||
      !user.seguro_vida_numero || user.seguro_vida_numero.trim() === ''
    );

    const mustCompleteProfile = user.must_change_password || user.must_set_email || docsIncompletos;

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

    const payload = {
      id_usuario: user.id_usuario,
      username: user.username,
      nombre: user.nombre,
      apellido: user.apellido,
      rol: user.rol,
      must_change_password: user.must_change_password,
      must_set_email: user.must_set_email,
      must_complete_profile: mustCompleteProfile,
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
        must_change_password: user.must_change_password,
        must_set_email: user.must_set_email,
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
};

exports.refresh = async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ message: "No autorizado" });
  const oldToken = header.split(" ")[1];

  try {
    const decoded = jwt.verify(oldToken, process.env.JWT_SECRET);
    
    // Obtener datos frescos de la DB para recalcular el estado del perfil
    const result = await db.query(`
      SELECT 
        u.id_usuario, u.username, u.nombre, u.apellido, u.rol, 
        u.must_change_password, u.must_set_email,
        a.numero_licencia, a.certificado_medico, a.seguro_vida, a.seguro_vida_numero, a.certificado_medico_numero
      FROM usuario u
      LEFT JOIN alumno a ON a.id_usuario = u.id_usuario
      WHERE u.id_usuario = $1
    `, [decoded.id_usuario]);

    if (result.rows.length === 0) return res.status(401).json({ message: "Usuario no encontrado" });
    const user = result.rows[0];

    const docsIncompletos = user.rol === 'ALUMNO' && (
      !user.numero_licencia || user.numero_licencia.trim() === '' ||
      !user.certificado_medico ||
      !user.certificado_medico_numero || user.certificado_medico_numero.trim() === '' ||
      !user.seguro_vida_numero || user.seguro_vida_numero.trim() === ''
    );
    const mustCompleteProfile = user.must_change_password || user.must_set_email || docsIncompletos;

    const payload = {
      id_usuario: user.id_usuario,
      username: user.username,
      nombre: user.nombre,
      apellido: user.apellido,
      rol: user.rol,
      must_change_password: user.must_change_password,
      must_set_email: user.must_set_email,
      must_complete_profile: mustCompleteProfile,
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
        must_change_password: user.must_change_password,
        must_set_email: user.must_set_email,
        must_complete_profile: mustCompleteProfile,
      }
    });
  } catch (err) {
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
};
