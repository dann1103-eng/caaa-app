const path = require("path");
const db = require("../../config/db");
const { subirArchivo, urlFirmada, borrarArchivo, storageDisponible, BUCKETS } = require("../../utils/storage");

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
        `SELECT id_curso, tipo, origen, nota_aprobacion FROM evaluacion WHERE id = $1`,
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
        // (Fase 3D) Aquí se emitirá la notificación a admin/instructores.
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
