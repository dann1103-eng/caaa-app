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

/**
 * Garantiza que exista una fila `instructor` para el usuario dado (necesaria para
 * asignarle alumnos, sesiones de clase, exámenes, etc.). Devuelve su id_instructor.
 */
async function asegurarInstructorTx(client, id_usuario) {
  const ex = await client.query(`SELECT id_instructor FROM instructor WHERE id_usuario = $1 LIMIT 1`, [id_usuario]);
  if (ex.rows.length) return ex.rows[0].id_instructor;
  const r = await client.query(
    `INSERT INTO instructor (id_usuario, activo) VALUES ($1, TRUE) RETURNING id_instructor`, [id_usuario]
  );
  return r.rows[0].id_instructor;
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
// Lista TODO el staff interno (usuario con rol de personal). El empleado (datos de
// nómina) es una extensión opcional; los instructores sembrados no lo tienen pero
// igual deben aparecer aquí para gestionarlos y ver sus alumnos.
exports.listPersonal = async (req, res) => {
  try {
    const r = await db.query(`
      SELECT u.id_usuario, u.username, u.rol, u.nombre, u.apellido, u.correo, u.activo,
             e.id AS id_empleado, e.cargo, e.sueldo_base, e.es_servicios_profesionales,
             e.dui, e.nit, e.isss_num, e.afp_num,
             ins.id_instructor,
             (SELECT COUNT(*) FROM alumno a WHERE a.id_instructor = ins.id_instructor) AS num_alumnos
      FROM usuario u
      LEFT JOIN empleado e     ON e.id_usuario   = u.id_usuario
      LEFT JOIN instructor ins ON ins.id_usuario = u.id_usuario
      WHERE u.rol IN ('ADMIN','PROGRAMACION','TURNO','INSTRUCTOR','ADMINISTRACION')
      ORDER BY u.nombre, u.apellido
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

    // Si el rol es INSTRUCTOR, crear su ficha de instructor (para asignarle alumnos).
    if (rolFinal === 'INSTRUCTOR') {
      await asegurarInstructorTx(client, id_usuario);
    }

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

// ── Editar personal (usuario + empleado opcional) ─────────────────────
// Se opera por id_usuario (todo staff interno tiene uno). Los datos de nómina
// (empleado) se actualizan solo si ese empleado ya existe.
exports.editarPersonal = async (req, res) => {
  const client = await db.connect();
  try {
    const { id_usuario } = req.params;
    const {
      nombre, apellido, correo, cargo, dui, nit, isss_num, afp_num,
      sueldo_base, es_servicios_profesionales, rol, activo
    } = req.body;

    await client.query("BEGIN");
    const uRes = await client.query(`SELECT id_usuario FROM usuario WHERE id_usuario = $1 FOR UPDATE`, [id_usuario]);
    if (!uRes.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ ok: false, message: "Usuario no encontrado" });
    }

    const rolFinal = rol ? rol.toUpperCase() : null;
    if (rolFinal && !ROLES_PERSONAL.includes(rolFinal)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, message: "Rol inválido para personal" });
    }

    await client.query(`
      UPDATE usuario SET
        rol      = COALESCE($2, rol),
        activo   = COALESCE($3, activo),
        correo   = COALESCE($4, correo),
        nombre   = COALESCE($5, nombre),
        apellido = COALESCE($6, apellido)
      WHERE id_usuario = $1
    `, [id_usuario, rolFinal, activo, correo || null, nombre || null, apellido || null]);

    // Datos de nómina: solo si ya tiene ficha de empleado (no se crea aquí; los
    // instructores configuran su pago en Tarifas → Instructores).
    const emp = await client.query(`SELECT id FROM empleado WHERE id_usuario = $1`, [id_usuario]);
    if (emp.rows.length) {
      const nombreCompleto = (nombre != null || apellido != null)
        ? `${nombre ?? ''} ${apellido ?? ''}`.trim()
        : null;
      await client.query(`
        UPDATE empleado SET
          nombre                      = COALESCE($2, nombre),
          cargo                       = COALESCE($3, cargo),
          dui                         = COALESCE($4, dui),
          nit                         = COALESCE($5, nit),
          isss_num                    = COALESCE($6, isss_num),
          afp_num                     = COALESCE($7, afp_num),
          sueldo_base                 = COALESCE($8, sueldo_base),
          es_servicios_profesionales  = COALESCE($9, es_servicios_profesionales)
        WHERE id_usuario = $1
      `, [id_usuario, nombreCompleto || null, cargo, dui, nit, isss_num, afp_num,
          sueldo_base != null ? Number(sueldo_base) : null, es_servicios_profesionales]);
    }

    if (rolFinal === 'INSTRUCTOR') {
      await asegurarInstructorTx(client, id_usuario);
    }

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};

// ── Resetear contraseña del personal ──────────────────────────────────
exports.resetPasswordPersonal = async (req, res) => {
  try {
    const { id_usuario } = req.params;
    const { password } = req.body;
    if (!password) return res.status(400).json({ ok: false, message: "Contraseña requerida" });
    const hash = await bcrypt.hash(String(password), 10);
    const r = await db.query(
      `UPDATE usuario SET password_hash = $2, must_change_password = TRUE WHERE id_usuario = $1 RETURNING id_usuario`,
      [id_usuario, hash]
    );
    if (!r.rows.length) return res.status(404).json({ ok: false, message: "Usuario no encontrado" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

// ── Reasignar alumno a otro instructor ────────────────────────────────
exports.reasignarAlumno = async (req, res) => {
  try {
    const { id_alumno } = req.params;
    const { id_instructor } = req.body;
    if (!id_instructor) return res.status(400).json({ ok: false, message: "id_instructor requerido" });
    const r = await db.query(
      `UPDATE alumno SET id_instructor = $2 WHERE id_alumno = $1 RETURNING id_alumno`,
      [id_alumno, id_instructor]
    );
    if (!r.rows.length) return res.status(404).json({ ok: false, message: "Alumno no encontrado" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

// ── Cursos del aula que imparte un instructor ─────────────────────────
exports.getInstructorCursos = async (req, res) => {
  try {
    const { id_instructor } = req.params;
    const r = await db.query(`
      SELECT c.id, c.codigo, c.nombre,
             (ic.id_curso IS NOT NULL) AS asignado
      FROM curso c
      LEFT JOIN instructor_curso ic ON ic.id_curso = c.id AND ic.id_instructor = $1
      WHERE c.activo = TRUE
      ORDER BY c.id
    `, [id_instructor]);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.setInstructorCursos = async (req, res) => {
  const client = await db.connect();
  try {
    const { id_instructor } = req.params;
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
    await client.query("BEGIN");
    await client.query(`DELETE FROM instructor_curso WHERE id_instructor = $1`, [id_instructor]);
    for (const cid of ids) {
      await client.query(
        `INSERT INTO instructor_curso (id_instructor, id_curso) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [id_instructor, cid]
      );
    }
    await client.query("COMMIT");
    res.json({ ok: true, data: { count: ids.length } });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};

// ── Historial del instructor ──────────────────────────────────────────
exports.historialInstructor = async (req, res) => {
  try {
    const { id_instructor } = req.params;

    const planillas = await db.query(`
      SELECT p.id AS id_periodo, p.periodo_inicio, p.periodo_fin, p.tipo_planilla, p.estado, p.fecha_pago,
             d.bruto, d.isr, d.isss, d.afp, d.retencion, d.total AS neto
      FROM nomina_detalle d
      JOIN nomina_periodo p ON p.id = d.id_periodo
      WHERE d.id_instructor = $1
      ORDER BY p.periodo_inicio DESC
    `, [id_instructor]);

    const horas = await db.query(`
      SELECT COALESCE(SUM(rv.tacometro_llegada - rv.tacometro_salida), 0) AS horas_total,
             COUNT(*) AS vuelos
      FROM vuelo v
      JOIN reporte_vuelo rv ON rv.id_vuelo = v.id_vuelo
      WHERE v.id_instructor = $1 AND v.estado = 'COMPLETADO'
        AND COALESCE(rv.es_inasistencia, false) = false
    `, [id_instructor]);

    const clases = await db.query(`
      SELECT s.id, s.fecha, s.tema, c.codigo AS curso_codigo, c.nombre AS curso_nombre
      FROM sesion_clase s
      LEFT JOIN curso c ON c.id = s.id_curso
      WHERE s.id_instructor = $1
      ORDER BY s.fecha DESC
    `, [id_instructor]);

    const examenes = await db.query(
      `SELECT COUNT(*) AS total FROM evaluacion WHERE id_instructor = $1`, [id_instructor]
    );

    const teoria = await db.query(`
      SELECT COALESCE(SUM(monto_usd) FILTER (WHERE estado = 'PAGADO'), 0)    AS pagado,
             COALESCE(SUM(monto_usd) FILTER (WHERE estado = 'PENDIENTE'), 0) AS pendiente
      FROM pago_teoria_pendiente WHERE id_instructor = $1
    `, [id_instructor]);

    res.json({ ok: true, data: {
      planillas: planillas.rows,
      horas: horas.rows[0],
      clases: clases.rows,
      examenes_total: Number(examenes.rows[0].total),
      teoria: teoria.rows[0],
    }});
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

// ── Historial del alumno ──────────────────────────────────────────────
exports.historialAlumno = async (req, res) => {
  try {
    const { id_alumno } = req.params;

    const vuelos = await db.query(`
      SELECT v.id_vuelo, v.fecha_vuelo,
             a.codigo AS aeronave_codigo, a.modelo AS aeronave_modelo,
             COALESCE(rv.tacometro_llegada - rv.tacometro_salida, 0) AS horas,
             iu.username AS instructor_username,
             COALESCE(rv.es_inasistencia, false) AS inasistencia
      FROM vuelo v
      LEFT JOIN reporte_vuelo rv ON rv.id_vuelo = v.id_vuelo
      LEFT JOIN aeronave a ON a.id_aeronave = v.id_aeronave
      LEFT JOIN instructor i ON i.id_instructor = v.id_instructor
      LEFT JOIN usuario iu ON iu.id_usuario = i.id_usuario
      WHERE v.id_alumno = $1 AND v.estado = 'COMPLETADO'
      ORDER BY v.fecha_vuelo DESC
    `, [id_alumno]);

    const facturas = await db.query(`
      SELECT id, numero_correlativo, fecha_emision, total_usd, estado, concepto
      FROM factura WHERE id_alumno = $1 ORDER BY fecha_emision DESC
    `, [id_alumno]);

    const recibos = await db.query(`
      SELECT id, numero_correlativo, fecha, monto_usd, metodo, descripcion, anulado
      FROM recibo_pago WHERE id_alumno = $1 ORDER BY fecha DESC
    `, [id_alumno]);

    const inscripciones = await db.query(`
      SELECT ic.id, ic.estado, ic.fecha_inicio, ic.fecha_finalizacion,
             c.codigo, c.nombre
      FROM inscripcion_curso ic
      JOIN curso c ON c.id = ic.id_curso
      WHERE ic.id_alumno = $1 ORDER BY ic.fecha_inicio DESC
    `, [id_alumno]);

    const notas = await db.query(`
      SELECT ea.id, e.nombre AS examen, e.tipo, e.origen,
             ea.nota, e.nota_aprobacion, ea.estado, ea.calificado_en
      FROM evaluacion_alumno ea
      JOIN evaluacion e ON e.id = ea.id_evaluacion
      WHERE ea.id_alumno = $1
      ORDER BY ea.calificado_en DESC NULLS LAST, ea.id DESC
    `, [id_alumno]);

    res.json({ ok: true, data: {
      vuelos: vuelos.rows,
      facturas: facturas.rows,
      recibos: recibos.rows,
      inscripciones: inscripciones.rows,
      notas: notas.rows,
    }});
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};
