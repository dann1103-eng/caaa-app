const path = require("path");
const db = require("../../config/db");
const { subirArchivo, urlFirmada, borrarArchivo, storageDisponible, BUCKETS } = require("../../utils/storage");
const { notificarRoles, notificarUsuario } = require("../../utils/notificaciones");
const transporter = require("../../utils/mailer");
const { examenFinalEmail } = require("../../utils/emailTemplates");
const { resolverIdInstructor } = require("../../utils/instructorHelpers");
const { choqueSalon, choqueInstructor } = require("../../utils/aulaChoques");

// Destinatarios del correo de "examen final aprobado": MAIL_ADMIN_NOTIFY si está
// definido (p.ej. el correo de Mayra / Administración), si no los correos de los
// usuarios con rol ADMINISTRACION/ADMIN.
async function destinatariosAdminNotify(client) {
  const override = (process.env.MAIL_ADMIN_NOTIFY || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (override.length) return override;
  const r = await client.query(
    `SELECT correo FROM usuario WHERE rol IN ('ADMINISTRACION','ADMIN') AND correo IS NOT NULL AND correo <> ''`
  );
  return r.rows.map((x) => x.correo);
}

// ─────────────────────────────────────────────────────────────────────
// UNIDADES TEÓRICAS
// ─────────────────────────────────────────────────────────────────────

exports.listUnidades = async (req, res) => {
  try {
    const { id_curso } = req.query;
    const params = [];
    let where = "WHERE u.activo = TRUE";
    if (id_curso) { params.push(id_curso); where += ` AND u.id_curso = $${params.length}`; }
    const r = await db.query(`
      SELECT u.*, c.codigo AS curso_codigo, c.nombre AS curso_nombre
      FROM unidad_teorica u
      JOIN curso c ON c.id = u.id_curso
      ${where}
      ORDER BY c.codigo, u.orden, u.numero
    `, params);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.crearUnidad = async (req, res) => {
  try {
    const { id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url } = req.body;
    if (!id_curso || !nombre) return res.status(400).json({ ok: false, message: "id_curso y nombre requeridos" });
    const r = await db.query(`
      INSERT INTO unidad_teorica (id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
    `, [id_curso, numero || 0, nombre, descripcion || null, horas_estimadas || 0, orden || 0, recursos_url || null]);
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.actualizarUnidad = async (req, res) => {
  try {
    const { id } = req.params;
    const { numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo } = req.body;
    const r = await db.query(`
      UPDATE unidad_teorica SET
        numero          = COALESCE($2, numero),
        nombre          = COALESCE($3, nombre),
        descripcion     = COALESCE($4, descripcion),
        horas_estimadas = COALESCE($5, horas_estimadas),
        orden           = COALESCE($6, orden),
        recursos_url    = COALESCE($7, recursos_url),
        activo          = COALESCE($8, activo)
      WHERE id = $1 RETURNING *
    `, [id, numero, nombre, descripcion, horas_estimadas, orden, recursos_url, activo]);
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.eliminarUnidad = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(`UPDATE unidad_teorica SET activo = FALSE WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

// Cursos activos. Para un INSTRUCTOR se filtran a los que tiene asignados
// (instructor_curso); si no tiene ninguna asignación, ve todos (retrocompat).
// Admin/Administración siempre ven todos.
exports.listCursos = async (req, res) => {
  try {
    if (req.user?.rol === 'INSTRUCTOR') {
      const ins = await db.query(
        `SELECT id_instructor FROM instructor WHERE id_usuario = $1 LIMIT 1`, [req.user.id_usuario]
      );
      const idInst = ins.rows[0]?.id_instructor;
      if (idInst) {
        const asign = await db.query(`
          SELECT c.id, c.codigo, c.nombre
          FROM instructor_curso ic
          JOIN curso c ON c.id = ic.id_curso
          WHERE ic.id_instructor = $1 AND c.activo = TRUE
          ORDER BY c.id
        `, [idInst]);
        if (asign.rows.length > 0) return res.json({ ok: true, data: asign.rows });
        // Sin asignaciones → cae al listado completo (retrocompatibilidad).
      }
    }
    const r = await db.query(`SELECT id, codigo, nombre FROM curso WHERE activo = TRUE ORDER BY id`);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

// ─────────────────────────────────────────────────────────────────────
// ASISTENCIA A CLASES TEÓRICAS
// ─────────────────────────────────────────────────────────────────────

exports.listSesiones = async (req, res) => {
  try {
    const { id_curso, futuras, mias } = req.query;
    const params = [];
    const conds = [];
    if (id_curso) { params.push(id_curso); conds.push(`s.id_curso = $${params.length}`); }
    if (futuras === "1" || futuras === "true") conds.push(`s.fecha >= CURRENT_DATE`);
    // "mias": solo las sesiones del instructor autenticado (sus próximas clases).
    if ((mias === "1" || mias === "true") && req.user?.rol === "INSTRUCTOR") {
      const idIns = await resolverIdInstructor(req.user.id_usuario);
      params.push(idIns); conds.push(`s.id_instructor = $${params.length}`);
    }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const r = await db.query(`
      SELECT s.id, s.id_curso, s.id_unidad, s.fecha, s.hora_inicio, s.hora_fin, s.tema, s.id_instructor,
             s.id_bloque, s.id_bloque_fin, s.id_salon, s.examen, s.estado, s.iniciada_en, s.cerrada_en,
             c.codigo AS curso_codigo, u.numero AS unidad_numero, u.nombre AS unidad_nombre,
             sal.nombre AS salon_nombre,
             TRIM(ui.nombre || ' ' || COALESCE(ui.apellido,'')) AS instructor_nombre,
             (SELECT COUNT(*) FROM asistencia_alumno a WHERE a.id_sesion = s.id) AS total,
             (SELECT COUNT(*) FROM asistencia_alumno a WHERE a.id_sesion = s.id AND a.estado='PRESENTE') AS presentes
      FROM sesion_clase s
      JOIN curso c ON c.id = s.id_curso
      LEFT JOIN unidad_teorica u ON u.id = s.id_unidad
      LEFT JOIN salon sal ON sal.id = s.id_salon
      LEFT JOIN instructor i ON i.id_instructor = s.id_instructor
      LEFT JOIN usuario ui ON ui.id_usuario = i.id_usuario
      ${where}
      ORDER BY s.fecha DESC, s.hora_inicio DESC NULLS LAST, s.id DESC
    `, params);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.crearSesion = async (req, res) => {
  const client = await db.connect();
  try {
    const {
      id_curso, id_unidad, fecha, tema, id_bloque, id_bloque_fin, id_salon, examen, alumnos,
    } = req.body;
    let { id_instructor } = req.body;
    if (!id_curso) return res.status(400).json({ ok: false, message: "id_curso requerido" });
    if (!fecha || !id_bloque || !id_salon) {
      return res.status(400).json({ ok: false, message: "fecha, id_bloque y id_salon son requeridos" });
    }
    if (!Array.isArray(alumnos) || alumnos.length === 0) {
      return res.status(400).json({ ok: false, message: "Elegí al menos un alumno para la clase" });
    }

    // Un INSTRUCTOR solo puede crear sesiones a su propio nombre (no spoofear
    // id_instructor por el body). Admin/Administración/Turno sí pueden asignar.
    if (req.user?.rol === "INSTRUCTOR") {
      id_instructor = await resolverIdInstructor(req.user.id_usuario);
      // Debe ser un curso que tiene asignado (mismo criterio que listCursos).
      const asign = await db.query(
        `SELECT 1 FROM instructor_curso WHERE id_instructor = $1 AND id_curso = $2`,
        [id_instructor, id_curso]
      );
      if (asign.rows.length === 0) {
        return res.status(403).json({ ok: false, message: "No tenés asignado ese curso." });
      }
    } else if (!id_instructor) {
      return res.status(400).json({ ok: false, message: "id_instructor requerido" });
    }

    // Los alumnos elegidos deben pertenecer al roster activo del curso.
    const roster = await db.query(
      `SELECT id_alumno FROM inscripcion_curso WHERE id_curso = $1 AND estado = 'ACTIVO' AND id_alumno = ANY($2::int[])`,
      [id_curso, alumnos]
    );
    if (roster.rows.length !== alumnos.length) {
      return res.status(400).json({ ok: false, message: "Uno o más alumnos no están inscritos activos en ese curso." });
    }

    await client.query("BEGIN");
    await choqueSalon(client, { id_salon, fecha, id_bloque, id_bloque_fin });
    await choqueInstructor(client, { id_instructor, fecha, id_bloque, id_bloque_fin });

    const r = await client.query(`
      INSERT INTO sesion_clase (id_curso, id_unidad, fecha, hora_inicio, hora_fin, tema, id_instructor, creado_por,
                                 id_bloque, id_bloque_fin, id_salon, examen, estado)
      VALUES ($1, $2, $3, NULL, NULL, $4, $5, $6, $7, $8, $9, $10, 'PROGRAMADA') RETURNING *
    `, [id_curso, id_unidad || null, fecha, tema || null, id_instructor, req.user?.id_usuario || null,
        id_bloque, id_bloque_fin || null, id_salon, examen === true]);

    await client.query(`
      INSERT INTO asistencia_alumno (id_sesion, id_alumno, estado, registrado_por)
      SELECT $1, x, 'PRESENTE', $2 FROM UNNEST($3::int[]) AS x
    `, [r.rows[0].id, req.user?.id_usuario || null, alumnos]);

    await client.query("COMMIT");
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.code === "CHOQUE_SALON" || e.code === "CHOQUE_INSTRUCTOR") {
      return res.status(409).json({ ok: false, message: e.message });
    }
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};

exports.listAsistencia = async (req, res) => {
  try {
    const { id_sesion } = req.params;
    const r = await db.query(`
      SELECT a.id, a.id_alumno, a.estado, a.observacion,
             u.username AS alumno_username, al.numero_licencia
      FROM asistencia_alumno a
      LEFT JOIN alumno al ON al.id_alumno = a.id_alumno
      LEFT JOIN usuario u ON u.id_usuario = al.id_usuario
      WHERE a.id_sesion = $1
      ORDER BY u.username
    `, [id_sesion]);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

// Registra/actualiza la asistencia de un alumno en una sesión.
exports.registrarAsistencia = async (req, res) => {
  try {
    const { id_sesion } = req.params;
    const { id_alumno, estado, observacion } = req.body;
    if (!id_alumno || !['PRESENTE','AUSENTE','TARDE','JUSTIFICADO'].includes(estado)) {
      return res.status(400).json({ ok: false, message: "id_alumno y estado válidos requeridos" });
    }
    const r = await db.query(`
      INSERT INTO asistencia_alumno (id_sesion, id_alumno, estado, observacion, registrado_por)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id_sesion, id_alumno) DO UPDATE SET
        estado = EXCLUDED.estado, observacion = EXCLUDED.observacion,
        registrado_por = EXCLUDED.registrado_por, registrado_en = NOW()
      RETURNING *
    `, [id_sesion, id_alumno, estado, observacion || null, req.user?.id_usuario || null]);
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

// ─────────────────────────────────────────────────────────────────────
// MATERIAL DIDÁCTICO POR UNIDAD
// ─────────────────────────────────────────────────────────────────────

exports.listMaterial = async (req, res) => {
  try {
    const { id_unidad } = req.params;
    const r = await db.query(
      `SELECT id, id_unidad, nombre, archivo_path, content_type, creado_en
       FROM material_unidad WHERE id_unidad = $1 ORDER BY creado_en DESC`,
      [id_unidad]
    );
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.subirMaterial = async (req, res) => {
  try {
    const { id_unidad } = req.params;
    if (!req.file) return res.status(400).json({ ok: false, message: "Archivo requerido" });
    if (!storageDisponible()) return res.status(503).json({ ok: false, message: "Almacenamiento no configurado" });
    const ext = path.extname(req.file.originalname) || "";
    const ruta = `aula/unidad_${id_unidad}/${Date.now()}${ext}`;
    await subirArchivo(BUCKETS.ARCHIVOS, ruta, req.file.buffer, req.file.mimetype);
    const r = await db.query(
      `INSERT INTO material_unidad (id_unidad, nombre, archivo_path, content_type, subido_por)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id_unidad, req.body.nombre || req.file.originalname, ruta, req.file.mimetype, req.user?.id_usuario || null]
    );
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.materialUrl = async (req, res) => {
  try {
    const { id } = req.params;
    const r = await db.query(`SELECT archivo_path FROM material_unidad WHERE id = $1`, [id]);
    if (r.rows.length === 0) return res.status(404).json({ ok: false, message: "Material no encontrado" });
    const url = await urlFirmada(BUCKETS.ARCHIVOS, r.rows[0].archivo_path, 3600);
    res.json({ ok: true, url });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.eliminarMaterial = async (req, res) => {
  try {
    const { id } = req.params;
    const r = await db.query(`SELECT archivo_path FROM material_unidad WHERE id = $1`, [id]);
    if (r.rows.length > 0) await borrarArchivo(BUCKETS.ARCHIVOS, r.rows[0].archivo_path);
    await db.query(`DELETE FROM material_unidad WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

// ─────────────────────────────────────────────────────────────────────
// PROGRESO DEL ALUMNO POR UNIDAD
// ─────────────────────────────────────────────────────────────────────

exports.progresoAlumno = async (req, res) => {
  try {
    const { id_alumno } = req.params;
    const r = await db.query(`
      SELECT u.id AS id_unidad, u.numero, u.nombre, u.descripcion, u.horas_estimadas, u.orden,
             c.codigo AS curso_codigo, c.nombre AS curso_nombre, c.id AS id_curso,
             COALESCE(p.estado, 'NO_INICIADA') AS estado,
             p.id AS id_progreso,
             p.fecha_inicio, p.fecha_completada,
             p.horas_acumuladas, p.observaciones
      FROM inscripcion_curso ic
      JOIN unidad_teorica u  ON u.id_curso = ic.id_curso
      JOIN curso c ON c.id = ic.id_curso
      LEFT JOIN progreso_unidad_alumno p
             ON p.id_unidad = u.id AND p.id_alumno = ic.id_alumno
      WHERE ic.id_alumno = $1 AND ic.estado = 'ACTIVO' AND u.activo = TRUE
      ORDER BY c.codigo, u.orden, u.numero
    `, [id_alumno]);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.actualizarProgreso = async (req, res) => {
  const client = await db.connect();
  try {
    const { id_alumno, id_unidad, estado, horas_acumuladas, observaciones } = req.body;
    if (!['NO_INICIADA','EN_PROGRESO','COMPLETADA','REPROBADA'].includes(estado)) {
      return res.status(400).json({ ok: false, message: "Estado inválido" });
    }
    await client.query("BEGIN");
    // Obtener inscripción activa
    const ins = await client.query(`
      SELECT ic.id FROM inscripcion_curso ic
      JOIN unidad_teorica u ON u.id_curso = ic.id_curso
      WHERE ic.id_alumno = $1 AND u.id = $2 AND ic.estado = 'ACTIVO' LIMIT 1
    `, [id_alumno, id_unidad]);

    const id_inscripcion = ins.rows[0]?.id || null;

    const fechaInicio    = estado === 'EN_PROGRESO' ? new Date() : null;
    const fechaCompletada = estado === 'COMPLETADA' ? new Date() : null;

    const r = await client.query(`
      INSERT INTO progreso_unidad_alumno
        (id_alumno, id_unidad, id_inscripcion, estado, fecha_inicio, fecha_completada,
         horas_acumuladas, observaciones, actualizado_por, actualizado_en)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (id_alumno, id_unidad) DO UPDATE SET
        estado = EXCLUDED.estado,
        fecha_inicio = COALESCE(progreso_unidad_alumno.fecha_inicio, EXCLUDED.fecha_inicio),
        fecha_completada = EXCLUDED.fecha_completada,
        horas_acumuladas = COALESCE(EXCLUDED.horas_acumuladas, progreso_unidad_alumno.horas_acumuladas),
        observaciones = COALESCE(EXCLUDED.observaciones, progreso_unidad_alumno.observaciones),
        actualizado_por = EXCLUDED.actualizado_por,
        actualizado_en = NOW()
      RETURNING *
    `, [id_alumno, id_unidad, id_inscripcion, estado, fechaInicio, fechaCompletada,
        horas_acumuladas || 0, observaciones || null, req.user?.id_usuario || null]);

    await client.query("COMMIT");
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────
// EVALUACIONES
// ─────────────────────────────────────────────────────────────────────

exports.listEvaluaciones = async (req, res) => {
  try {
    const { id_curso, id_unidad } = req.query;
    const params = [];
    const where = ["e.activo = TRUE"];
    if (id_curso) { params.push(id_curso); where.push(`e.id_curso = $${params.length}`); }
    if (id_unidad){ params.push(id_unidad); where.push(`e.id_unidad = $${params.length}`); }

    const r = await db.query(`
      SELECT e.*, c.codigo AS curso_codigo, c.nombre AS curso_nombre,
             u.numero AS unidad_numero, u.nombre AS unidad_nombre,
             inst.username AS instructor_nombre,
             (SELECT COUNT(*) FROM evaluacion_alumno ea WHERE ea.id_evaluacion = e.id) AS total_inscritos,
             (SELECT COUNT(*) FROM evaluacion_alumno ea WHERE ea.id_evaluacion = e.id AND ea.estado = 'CALIFICADA') AS total_calificados
      FROM evaluacion e
      JOIN curso c ON c.id = e.id_curso
      LEFT JOIN unidad_teorica u ON u.id = e.id_unidad
      LEFT JOIN instructor i ON i.id_instructor = e.id_instructor
      LEFT JOIN usuario inst ON inst.id_usuario = i.id_usuario
      WHERE ${where.join(" AND ")}
      ORDER BY e.fecha_programada DESC NULLS LAST, e.id DESC
    `, params);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.crearEvaluacion = async (req, res) => {
  const client = await db.connect();
  try {
    const { id_curso, id_unidad, nombre, tipo, fecha_programada, puntos_max, nota_aprobacion, id_instructor, descripcion, inscribir_alumnos, origen } = req.body;
    if (!id_curso || !nombre) return res.status(400).json({ ok: false, message: "id_curso y nombre requeridos" });

    await client.query("BEGIN");
    const r = await client.query(`
      INSERT INTO evaluacion (id_curso, id_unidad, nombre, tipo, fecha_programada, puntos_max, nota_aprobacion, id_instructor, descripcion, origen)
      VALUES ($1, $2, $3, COALESCE($4,'EXAMEN'), $5, COALESCE($6,100), COALESCE($7,70), $8, $9, COALESCE($10,'INTERNO'))
      RETURNING *
    `, [id_curso, id_unidad || null, nombre, tipo, fecha_programada || null,
        puntos_max, nota_aprobacion, id_instructor || null, descripcion || null,
        origen === 'AAC' ? 'AAC' : 'INTERNO']);

    // Inscribir automáticamente a todos los alumnos activos del curso si se pidió
    if (inscribir_alumnos !== false) {
      await client.query(`
        INSERT INTO evaluacion_alumno (id_evaluacion, id_alumno, estado)
        SELECT $1, ic.id_alumno, 'PENDIENTE'
        FROM inscripcion_curso ic
        WHERE ic.id_curso = $2 AND ic.estado = 'ACTIVO'
        ON CONFLICT (id_evaluacion, id_alumno) DO NOTHING
      `, [r.rows[0].id, id_curso]);
    }

    await client.query("COMMIT");
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};

exports.listEvaluacionAlumnos = async (req, res) => {
  try {
    const { id_evaluacion } = req.params;
    const r = await db.query(`
      SELECT ea.*, u.username AS alumno_username, a.numero_licencia
      FROM evaluacion_alumno ea
      LEFT JOIN alumno a ON a.id_alumno = ea.id_alumno
      LEFT JOIN usuario u ON u.id_usuario = a.id_usuario
      WHERE ea.id_evaluacion = $1
      ORDER BY u.username
    `, [id_evaluacion]);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.registrarNota = async (req, res) => {
  const client = await db.connect();
  try {
    const { id } = req.params;
    const { nota, estado, fecha_presentacion, observaciones } = req.body;
    await client.query("BEGIN");
    const r = await client.query(`
      UPDATE evaluacion_alumno SET
        nota               = COALESCE($2, nota),
        estado             = COALESCE($3, estado),
        fecha_presentacion = COALESCE($4, fecha_presentacion),
        observaciones      = COALESCE($5, observaciones),
        calificado_por     = $6,
        calificado_en      = CASE WHEN $3 = 'CALIFICADA' THEN NOW() ELSE calificado_en END
      WHERE id = $1 RETURNING *
    `, [id, nota, estado, fecha_presentacion || null, observaciones || null, req.user?.id_usuario || null]);

    const ea = r.rows[0];
    let listoParaComite = false;
    if (ea) {
      // ¿Aprobó un examen FINAL interno? → habilitar comité con la AAC.
      const ev = await client.query(
        `SELECT id_curso, tipo, origen, nota_aprobacion, id_instructor FROM evaluacion WHERE id = $1`,
        [ea.id_evaluacion]
      );
      const e = ev.rows[0];
      if (e && e.tipo === 'FINAL' && e.origen === 'INTERNO' &&
          ea.estado === 'CALIFICADA' && ea.nota != null &&
          Number(ea.nota) >= Number(e.nota_aprobacion)) {
        const up = await client.query(`
          UPDATE inscripcion_curso
          SET listo_para_comite = TRUE, fecha_listo_comite = COALESCE(fecha_listo_comite, NOW())
          WHERE id_alumno = $1 AND id_curso = $2 AND estado = 'ACTIVO'
          RETURNING id
        `, [ea.id_alumno, e.id_curso]);
        listoParaComite = up.rows.length > 0;
        if (listoParaComite) {
          // Datos del alumno, su instructor y el pago de teoría del curso.
          const info = await client.query(`
            SELECT u.nombre || ' ' || u.apellido AS alumno, c.nombre AS curso,
                   c.pago_teoria_instructor_usd AS pago_teoria,
                   a.id_instructor AS alumno_instructor, iu.id_usuario AS instructor_uid
            FROM alumno a
            JOIN usuario u ON u.id_usuario = a.id_usuario
            LEFT JOIN instructor i ON i.id_instructor = a.id_instructor
            LEFT JOIN usuario iu ON iu.id_usuario = i.id_usuario
            CROSS JOIN (SELECT nombre, pago_teoria_instructor_usd FROM curso WHERE id = $2) c
            WHERE a.id_alumno = $1
          `, [ea.id_alumno, e.id_curso]);
          const d = info.rows[0] || {};
          const msg = `${d.alumno || 'Un alumno'} aprobó el examen final de ${d.curso || 'su curso'} y está listo para el comité con la AAC.`;
          await notificarRoles(client, ['ADMINISTRACION', 'ADMIN'], { tipo: 'EXAMEN_FINAL', mensaje: msg, enlace: `/administracion/alumnos/${ea.id_alumno}` });
          if (d.instructor_uid) {
            await notificarUsuario(client, d.instructor_uid, { tipo: 'EXAMEN_FINAL', mensaje: msg });
          }

          // Correo a Administración (Mayra). No bloquea la transacción si falla.
          try {
            const dest = await destinatariosAdminNotify(client);
            if (dest.length) {
              const { subject, html, text } = examenFinalEmail({
                alumno: d.alumno, curso: d.curso, enlace: `/administracion/alumnos/${ea.id_alumno}`,
              });
              transporter.sendMail({ to: dest, subject, html, text })
                .catch((err) => console.error("Error enviando correo de examen final:", err));
            }
          } catch (err) {
            console.error("Error preparando correo de examen final:", err.message);
          }

          // Pago de teoría: al instructor del examen final (o el titular del alumno).
          const id_instructor_pago = e.id_instructor || d.alumno_instructor || null;
          const montoTeoria = Number(d.pago_teoria || 0);
          if (id_instructor_pago && montoTeoria > 0) {
            await client.query(`
              INSERT INTO pago_teoria_pendiente (id_instructor, id_curso, id_alumno, monto_usd)
              VALUES ($1, $2, $3, $4)
              ON CONFLICT (id_curso, id_alumno) DO NOTHING
            `, [id_instructor_pago, e.id_curso, ea.id_alumno, montoTeoria]);
          }
        }
      }
    }

    await client.query("COMMIT");
    res.json({ ok: true, data: ea, listo_para_comite: listoParaComite });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};

// ─────────────────────────────────────────────────────────────────────
// VISTA DEL ALUMNO (resumen propio)
// ─────────────────────────────────────────────────────────────────────

exports.miAulaVirtual = async (req, res) => {
  try {
    // Resolver id_alumno desde req.user
    const al = await db.query(`SELECT id_alumno FROM alumno WHERE id_usuario = $1`, [req.user.id_usuario]);
    if (al.rows.length === 0) return res.status(404).json({ ok: false, message: "Alumno no encontrado" });
    const id_alumno = al.rows[0].id_alumno;

    // Cursos activos
    const cursos = await db.query(`
      SELECT ic.id AS id_inscripcion, c.id AS id_curso, c.codigo, c.nombre,
             ic.fecha_inicio, ic.estado AS estado_inscripcion,
             ic.listo_para_comite, ic.fecha_listo_comite
      FROM inscripcion_curso ic
      JOIN curso c ON c.id = ic.id_curso
      WHERE ic.id_alumno = $1 AND ic.estado = 'ACTIVO'
      ORDER BY ic.fecha_inicio DESC
    `, [id_alumno]);

    // Unidades y su progreso (mismo query que progresoAlumno)
    const unidades = await db.query(`
      SELECT u.id AS id_unidad, u.numero, u.nombre, u.descripcion, u.horas_estimadas, u.orden,
             c.codigo AS curso_codigo, c.id AS id_curso,
             COALESCE(p.estado, 'NO_INICIADA') AS estado,
             p.fecha_inicio, p.fecha_completada, p.horas_acumuladas, p.observaciones
      FROM inscripcion_curso ic
      JOIN unidad_teorica u ON u.id_curso = ic.id_curso
      JOIN curso c ON c.id = ic.id_curso
      LEFT JOIN progreso_unidad_alumno p ON p.id_unidad = u.id AND p.id_alumno = $1
      WHERE ic.id_alumno = $1 AND ic.estado = 'ACTIVO' AND u.activo = TRUE
      ORDER BY c.codigo, u.orden, u.numero
    `, [id_alumno]);

    // Evaluaciones del alumno
    const evals = await db.query(`
      SELECT ea.id, ea.estado, ea.nota, ea.fecha_presentacion, ea.observaciones, ea.calificado_en,
             e.id AS id_evaluacion, e.nombre, e.tipo, e.fecha_programada,
             e.puntos_max, e.nota_aprobacion, e.origen,
             c.codigo AS curso_codigo, u.numero AS unidad_numero, u.nombre AS unidad_nombre
      FROM evaluacion_alumno ea
      JOIN evaluacion e ON e.id = ea.id_evaluacion
      JOIN curso c ON c.id = e.id_curso
      LEFT JOIN unidad_teorica u ON u.id = e.id_unidad
      WHERE ea.id_alumno = $1 AND e.activo = TRUE
      ORDER BY e.fecha_programada DESC NULLS LAST, e.id DESC
    `, [id_alumno]);

    // Material de las unidades del curso activo del alumno
    const materiales = await db.query(`
      SELECT m.id, m.id_unidad, m.nombre, m.content_type
      FROM material_unidad m
      JOIN unidad_teorica u ON u.id = m.id_unidad
      JOIN inscripcion_curso ic ON ic.id_curso = u.id_curso
      WHERE ic.id_alumno = $1 AND ic.estado = 'ACTIVO' AND u.activo = TRUE
      ORDER BY m.creado_en DESC
    `, [id_alumno]);

    res.json({
      ok: true,
      data: {
        cursos: cursos.rows,
        unidades: unidades.rows,
        evaluaciones: evals.rows,
        materiales: materiales.rows
      }
    });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

// Solo se puede editar/cancelar mientras está PROGRAMADA (antes de iniciar).
// Mismo permiso que crear: instructor dueño + Admin/Administración/Turno.
async function assertPropiaOSStaff(req, sesion) {
  if (req.user?.rol === "INSTRUCTOR") {
    const idIns = await resolverIdInstructor(req.user.id_usuario);
    if (Number(sesion.id_instructor) !== Number(idIns)) {
      const e = new Error("No podés modificar la clase de otro instructor.");
      e.code = "FORBIDDEN";
      throw e;
    }
  }
}

exports.editarSesion = async (req, res) => {
  const client = await db.connect();
  try {
    const { id } = req.params;
    const { id_curso, id_unidad, fecha, tema, id_bloque, id_bloque_fin, id_salon, examen, alumnos } = req.body;

    const cur = await client.query(`SELECT * FROM sesion_clase WHERE id = $1 FOR UPDATE`, [id]);
    if (cur.rows.length === 0) return res.status(404).json({ ok: false, message: "Sesión no encontrada" });
    const sesion = cur.rows[0];
    if (sesion.estado !== "PROGRAMADA") {
      return res.status(400).json({ ok: false, message: "Solo se puede editar una clase que todavía no inició." });
    }
    await assertPropiaOSStaff(req, sesion);

    await client.query("BEGIN");
    await choqueSalon(client, { id_salon, fecha, id_bloque, id_bloque_fin, excluirIdSesion: Number(id) });
    await choqueInstructor(client, { id_instructor: sesion.id_instructor, fecha, id_bloque, id_bloque_fin, excluirIdSesion: Number(id) });

    const r = await client.query(`
      UPDATE sesion_clase SET id_curso=$1, id_unidad=$2, fecha=$3, tema=$4,
             id_bloque=$5, id_bloque_fin=$6, id_salon=$7, examen=$8
       WHERE id = $9 RETURNING *
    `, [id_curso, id_unidad || null, fecha, tema || null, id_bloque, id_bloque_fin || null, id_salon, examen === true, id]);

    if (Array.isArray(alumnos)) {
      await client.query(`DELETE FROM asistencia_alumno WHERE id_sesion = $1`, [id]);
      await client.query(`
        INSERT INTO asistencia_alumno (id_sesion, id_alumno, estado, registrado_por)
        SELECT $1, x, 'PRESENTE', $2 FROM UNNEST($3::int[]) AS x
      `, [id, req.user?.id_usuario || null, alumnos]);
    }

    await client.query("COMMIT");
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.code === "FORBIDDEN") return res.status(403).json({ ok: false, message: e.message });
    if (e.code === "CHOQUE_SALON" || e.code === "CHOQUE_INSTRUCTOR") {
      return res.status(409).json({ ok: false, message: e.message });
    }
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};

exports.cancelarSesion = async (req, res) => {
  try {
    const { id } = req.params;
    const cur = await db.query(`SELECT * FROM sesion_clase WHERE id = $1`, [id]);
    if (cur.rows.length === 0) return res.status(404).json({ ok: false, message: "Sesión no encontrada" });
    if (cur.rows[0].estado !== "PROGRAMADA") {
      return res.status(400).json({ ok: false, message: "Solo se puede cancelar una clase que todavía no inició." });
    }
    await assertPropiaOSStaff(req, cur.rows[0]);
    await db.query(`UPDATE sesion_clase SET estado = 'CANCELADA' WHERE id = $1`, [id]);
    res.json({ ok: true, message: "Clase cancelada" });
  } catch (e) {
    if (e.code === "FORBIDDEN") return res.status(403).json({ ok: false, message: e.message });
    res.status(500).json({ ok: false, message: e.message });
  }
};

const { notificarStaff } = require("../../utils/webpush");

exports.iniciarSesion = async (req, res) => {
  try {
    const { id } = req.params;
    const cur = await db.query(`
      SELECT sc.*, c.codigo AS curso_codigo, u.numero AS unidad_numero, u.nombre AS unidad_nombre,
             s.nombre AS salon_nombre, TRIM(ui.nombre || ' ' || COALESCE(ui.apellido,'')) AS instructor_nombre
        FROM sesion_clase sc
        JOIN curso c ON c.id = sc.id_curso
        LEFT JOIN unidad_teorica u ON u.id = sc.id_unidad
        LEFT JOIN salon s ON s.id = sc.id_salon
        LEFT JOIN instructor i ON i.id_instructor = sc.id_instructor
        LEFT JOIN usuario ui ON ui.id_usuario = i.id_usuario
       WHERE sc.id = $1
    `, [id]);
    if (cur.rows.length === 0) return res.status(404).json({ ok: false, message: "Sesión no encontrada" });
    const sesion = cur.rows[0];
    if (sesion.estado !== "PROGRAMADA") {
      return res.status(400).json({ ok: false, message: "La clase ya inició, cerró o fue cancelada." });
    }
    await assertPropiaOSStaff(req, sesion);

    await db.query(`UPDATE sesion_clase SET estado = 'EN_CURSO', iniciada_en = NOW() WHERE id = $1`, [id]);

    // Best-effort: nunca puede tumbar la acción si falla.
    notificarStaff({
      title: "Clase de teoría iniciada",
      body: `${sesion.salon_nombre} — ${sesion.instructor_nombre} inició ${sesion.curso_codigo}${sesion.unidad_nombre ? ` · ${sesion.unidad_nombre}` : ""}`,
    }, { excluirUid: req.user?.id_usuario, tipo: "CLASE_TEORIA" }).catch(() => {});

    res.json({ ok: true, message: "Clase iniciada" });
  } catch (e) {
    if (e.code === "FORBIDDEN") return res.status(403).json({ ok: false, message: e.message });
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.cerrarSesion = async (req, res) => {
  try {
    const { id } = req.params;
    const cur = await db.query(`SELECT * FROM sesion_clase WHERE id = $1`, [id]);
    if (cur.rows.length === 0) return res.status(404).json({ ok: false, message: "Sesión no encontrada" });
    if (cur.rows[0].estado !== "EN_CURSO") {
      return res.status(400).json({ ok: false, message: "Solo se puede cerrar una clase que está en curso." });
    }
    await assertPropiaOSStaff(req, cur.rows[0]);
    await db.query(`UPDATE sesion_clase SET estado = 'CERRADA', cerrada_en = NOW() WHERE id = $1`, [id]);
    res.json({ ok: true, message: "Clase cerrada — queda pendiente de firma para los alumnos presentes." });
  } catch (e) {
    if (e.code === "FORBIDDEN") return res.status(403).json({ ok: false, message: e.message });
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.reasignarSalon = async (req, res) => {
  const client = await db.connect();
  try {
    const { id } = req.params;
    const { id_salon } = req.body;
    if (!id_salon) return res.status(400).json({ ok: false, message: "id_salon requerido" });

    const cur = await client.query(`SELECT * FROM sesion_clase WHERE id = $1 FOR UPDATE`, [id]);
    if (cur.rows.length === 0) return res.status(404).json({ ok: false, message: "Sesión no encontrada" });
    const sesion = cur.rows[0];
    if (!["PROGRAMADA", "EN_CURSO"].includes(sesion.estado)) {
      return res.status(400).json({ ok: false, message: "Solo se puede reasignar salón mientras la clase está programada o en curso." });
    }

    await client.query("BEGIN");
    await choqueSalon(client, {
      id_salon, fecha: sesion.fecha, id_bloque: sesion.id_bloque, id_bloque_fin: sesion.id_bloque_fin,
      excluirIdSesion: Number(id),
    });
    const r = await client.query(`UPDATE sesion_clase SET id_salon = $1 WHERE id = $2 RETURNING *`, [id_salon, id]);
    await client.query("COMMIT");
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.code === "CHOQUE_SALON") return res.status(409).json({ ok: false, message: e.message });
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};

exports.listSalones = async (req, res) => {
  try {
    const r = await db.query(`SELECT id, nombre FROM salon WHERE activo = true ORDER BY id`);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

// Para el picker del formulario de agendar: libre/ocupado (y por quién) en un
// horario dado. Mismo patrón que getAeronavesDisponibles.
exports.disponibilidadSalones = async (req, res) => {
  try {
    const { fecha, id_bloque, id_bloque_fin } = req.query;
    if (!fecha || !id_bloque) return res.status(400).json({ ok: false, message: "fecha e id_bloque son requeridos" });
    const fin = Number(id_bloque_fin || id_bloque);

    const r = await db.query(`
      SELECT s.id, s.nombre,
             sc.id IS NOT NULL AS ocupado_clase, c.codigo AS curso_codigo,
             rs.id IS NOT NULL AS ocupado_reserva, rs.motivo
        FROM salon s
        LEFT JOIN sesion_clase sc ON sc.id_salon = s.id AND sc.fecha = $1 AND sc.estado <> 'CANCELADA'
          AND NOT ($3 < sc.id_bloque OR $2 > COALESCE(sc.id_bloque_fin, sc.id_bloque))
        LEFT JOIN curso c ON c.id = sc.id_curso
        LEFT JOIN reserva_salon rs ON rs.id_salon = s.id AND rs.fecha = $1
          AND NOT ($3 < rs.id_bloque OR $2 > COALESCE(rs.id_bloque_fin, rs.id_bloque))
       WHERE s.activo = true
       ORDER BY s.id
    `, [fecha, id_bloque, fin]);

    res.json({
      ok: true,
      data: r.rows.map((row) => ({
        id: row.id, nombre: row.nombre,
        libre: !row.ocupado_clase && !row.ocupado_reserva,
        motivo: row.ocupado_clase ? `Clase de ${row.curso_codigo}` : row.ocupado_reserva ? `Reservado (${row.motivo})` : null,
      })),
    });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

// Roster de alumnos activos de un curso, para el multi-select del formulario de agendar.
exports.rosterCurso = async (req, res) => {
  try {
    const { id_curso } = req.params;
    const r = await db.query(`
      SELECT ic.id_alumno, TRIM(u.nombre || ' ' || COALESCE(u.apellido, '')) AS nombre
        FROM inscripcion_curso ic
        JOIN alumno a ON a.id_alumno = ic.id_alumno
        JOIN usuario u ON u.id_usuario = a.id_usuario
       WHERE ic.id_curso = $1 AND ic.estado = 'ACTIVO'
       ORDER BY u.nombre
    `, [id_curso]);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

// Para el selector de Turno al agendar una clase "a nombre de": instructores de
// TEORÍA activos. OJO: `adminVueloController.getInstructoresActivos` (ya usado
// para vuelos) filtra `es_instructor_vuelo=true` — un instructor solo-teoría
// nunca aparecería ahí, por eso este es un endpoint nuevo y separado.
exports.listInstructoresTeoria = async (req, res) => {
  try {
    const r = await db.query(`
      SELECT i.id_instructor, TRIM(u.nombre || ' ' || COALESCE(u.apellido, '')) AS nombre
        FROM instructor i
        JOIN usuario u ON u.id_usuario = i.id_usuario
       WHERE i.activo = true AND i.es_instructor_teoria = true
       ORDER BY u.nombre
    `);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

// ─────────────────────────────────────────────────────────────────────
// RESERVA DE SALÓN (uso especial, sin sesión de clase)
// ─────────────────────────────────────────────────────────────────────

const MOTIVOS_SALON = ["REUNION", "EVENTO", "ADMINISTRATIVO", "OTRO"];

exports.listReservasSalon = async (req, res) => {
  try {
    const { fecha } = req.query;
    const params = [];
    let where = "";
    if (fecha) { params.push(fecha); where = "WHERE rs.fecha = $1"; }
    const r = await db.query(`
      SELECT rs.id, rs.id_salon, s.nombre AS salon_nombre, rs.fecha, rs.id_bloque, rs.id_bloque_fin,
             rs.motivo, rs.descripcion
        FROM reserva_salon rs
        JOIN salon s ON s.id = rs.id_salon
        ${where}
       ORDER BY rs.fecha, rs.id_bloque
    `, params);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.crearReservaSalon = async (req, res) => {
  try {
    const { id_salon, fecha, id_bloque, id_bloque_fin, motivo, descripcion } = req.body;
    if (!id_salon || !fecha || !id_bloque) {
      return res.status(400).json({ ok: false, message: "id_salon, fecha e id_bloque son requeridos" });
    }
    const motivoFinal = MOTIVOS_SALON.includes(motivo) ? motivo : "OTRO";
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await choqueSalon(client, { id_salon, fecha, id_bloque, id_bloque_fin });
      const ins = await client.query(`
        INSERT INTO reserva_salon (id_salon, fecha, id_bloque, id_bloque_fin, motivo, descripcion, creado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id
      `, [id_salon, fecha, id_bloque, id_bloque_fin || null, motivoFinal, descripcion || null, req.user?.id_usuario || null]);
      await client.query("COMMIT");
      res.json({ ok: true, id: ins.rows[0].id });
    } catch (e) {
      await client.query("ROLLBACK");
      if (e.code === "CHOQUE_SALON") return res.status(409).json({ ok: false, message: e.message });
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.eliminarReservaSalon = async (req, res) => {
  try {
    const { id } = req.params;
    const r = await db.query(`DELETE FROM reserva_salon WHERE id = $1 RETURNING id`, [id]);
    if (r.rows.length === 0) return res.status(404).json({ ok: false, message: "Reserva no encontrada" });
    res.json({ ok: true, message: "Reserva eliminada" });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};
