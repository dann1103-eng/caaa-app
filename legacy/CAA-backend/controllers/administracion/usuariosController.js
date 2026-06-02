const db = require("../../config/db");
const bcrypt = require("bcrypt");

// Roles válidos para personal interno (NO incluye ALUMNO; ese se crea como alumno).
const ROLES_PERSONAL = ['ADMIN', 'PROGRAMACION', 'TURNO', 'INSTRUCTOR', 'ADMINISTRACION'];

/**
 * Crea la fila `usuario` (login) y devuelve su id. Hashea la contraseña con
 * bcrypt; el usuario debe cambiarla en el primer login.
 */
async function crearUsuarioTx(client, { username, password, nombre, apellido, correo, rol }) {
  const hash = await bcrypt.hash(String(password), 10);
  const r = await client.query(`
    INSERT INTO usuario
      (username, password_hash, rol, nombre, apellido, correo,
       activo, must_change_password, must_set_email)
    VALUES ($1, $2, $3, $4, $5, $6, TRUE, TRUE, $7)
    RETURNING id_usuario
  `, [username, hash, rol, nombre, apellido, correo || null, correo ? false : true]);
  return r.rows[0].id_usuario;
}

// ── Alumnos ───────────────────────────────────────────────────────────
exports.listAlumnos = async (req, res) => {
  try {
    const r = await db.query(`
      SELECT a.id_alumno, a.id_usuario, u.username, u.nombre, u.apellido, u.correo, u.activo,
             a.numero_licencia, a.telefono,
             a.id_instructor, iu.username AS instructor_username,
             a.id_licencia, l.nombre AS licencia_nombre
      FROM alumno a
      JOIN usuario u ON u.id_usuario = a.id_usuario
      LEFT JOIN instructor i ON i.id_instructor = a.id_instructor
      LEFT JOIN usuario iu ON iu.id_usuario = i.id_usuario
      LEFT JOIN licencia l ON l.id_licencia = a.id_licencia
      ORDER BY u.nombre, u.apellido
    `);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.crearAlumno = async (req, res) => {
  const client = await db.connect();
  try {
    const {
      username, password, nombre, apellido, correo,
      id_instructor, id_licencia, numero_licencia, telefono
    } = req.body;

    if (!username || !password || !nombre || !apellido) {
      return res.status(400).json({ ok: false, message: "Usuario, contraseña, nombre y apellido son obligatorios" });
    }
    if (!id_instructor || !id_licencia) {
      return res.status(400).json({ ok: false, message: "Instructor y licencia son obligatorios para un alumno" });
    }

    await client.query("BEGIN");
    const id_usuario = await crearUsuarioTx(client, {
      username, password, nombre, apellido, correo, rol: 'ALUMNO'
    });

    const a = await client.query(`
      INSERT INTO alumno (id_usuario, id_instructor, id_licencia, numero_licencia, telefono, activo)
      VALUES ($1, $2, $3, $4, $5, TRUE)
      RETURNING id_alumno
    `, [id_usuario, id_instructor, id_licencia, numero_licencia || null, telefono || null]);

    // Cuenta corriente en cero (lista para depósitos / cargos).
    await client.query(`
      INSERT INTO cuenta_corriente_alumno (id_alumno, saldo_actual_usd)
      VALUES ($1, 0) ON CONFLICT (id_alumno) DO NOTHING
    `, [a.rows[0].id_alumno]);

    await client.query("COMMIT");
    res.json({ ok: true, data: { id_alumno: a.rows[0].id_alumno, id_usuario } });
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.code === '23505') {
      return res.status(409).json({ ok: false, message: "Ese nombre de usuario ya existe" });
    }
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};

// ── Personal (empleado + login) ───────────────────────────────────────
exports.listPersonal = async (req, res) => {
  try {
    const r = await db.query(`
      SELECT e.*, u.username, u.rol, u.correo AS usuario_correo, u.activo AS usuario_activo
      FROM empleado e
      LEFT JOIN usuario u ON u.id_usuario = e.id_usuario
      ORDER BY e.nombre
    `);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.crearPersonal = async (req, res) => {
  const client = await db.connect();
  try {
    const {
      username, password, nombre, apellido, correo, rol,
      cargo, dui, nit, isss_num, afp_num,
      sueldo_base, es_servicios_profesionales
    } = req.body;

    if (!username || !password || !nombre || !apellido) {
      return res.status(400).json({ ok: false, message: "Usuario, contraseña, nombre y apellido son obligatorios" });
    }
    const rolFinal = (rol || 'ADMINISTRACION').toUpperCase();
    if (!ROLES_PERSONAL.includes(rolFinal)) {
      return res.status(400).json({ ok: false, message: "Rol inválido para personal" });
    }

    await client.query("BEGIN");
    const id_usuario = await crearUsuarioTx(client, {
      username, password, nombre, apellido, correo, rol: rolFinal
    });

    const nombreCompleto = `${nombre} ${apellido}`.trim();
    const emp = await client.query(`
      INSERT INTO empleado
        (nombre, cargo, dui, nit, isss_num, afp_num, sueldo_base,
         es_servicios_profesionales, id_usuario)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      nombreCompleto, cargo || null, dui || null, nit || null,
      isss_num || null, afp_num || null, Number(sueldo_base) || 0,
      !!es_servicios_profesionales, id_usuario
    ]);

    await client.query("COMMIT");
    res.json({ ok: true, data: { ...emp.rows[0], id_usuario, username, rol: rolFinal } });
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.code === '23505') {
      return res.status(409).json({ ok: false, message: "Ese nombre de usuario ya existe" });
    }
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};
