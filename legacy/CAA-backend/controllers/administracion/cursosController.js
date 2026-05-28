const db = require("../../config/db");

exports.list = async (req, res) => {
  try {
    const r = await db.query(`
      SELECT c.*,
             COALESCE((SELECT json_agg(json_build_object(
                'id', cp.id,
                'tipo_aeronave', cp.tipo_aeronave,
                'horas_requeridas', cp.horas_requeridas,
                'tarifa_hora_usd_referencia', cp.tarifa_hora_usd_referencia
             )) FROM curso_componente_practico cp WHERE cp.id_curso = c.id), '[]'::json) AS componentes
      FROM curso c
      WHERE c.activo = TRUE
      ORDER BY c.id
    `);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.create = async (req, res) => {
  const client = await db.connect();
  try {
    const { codigo, nombre, descripcion, gastos_administrativos_usd, costo_teorico_usd, horas_teoricas, total_usd_estimado, componentes } = req.body;
    await client.query("BEGIN");
    const c = await client.query(`
      INSERT INTO curso (codigo, nombre, descripcion, gastos_administrativos_usd,
                         costo_teorico_usd, horas_teoricas, total_usd_estimado)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [codigo, nombre, descripcion || null, gastos_administrativos_usd || 0,
        costo_teorico_usd || 0, horas_teoricas || 0, total_usd_estimado || 0]);
    if (Array.isArray(componentes)) {
      for (const cp of componentes) {
        await client.query(`
          INSERT INTO curso_componente_practico (id_curso, tipo_aeronave, horas_requeridas, tarifa_hora_usd_referencia)
          VALUES ($1,$2,$3,$4)
        `, [c.rows[0].id, cp.tipo_aeronave, cp.horas_requeridas, cp.tarifa_hora_usd_referencia || 0]);
      }
    }
    await client.query("COMMIT");
    res.json({ ok: true, data: c.rows[0] });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};

exports.update = async (req, res) => {
  const client = await db.connect();
  try {
    const { id } = req.params;
    const {
      nombre, descripcion,
      gastos_administrativos_usd, costo_teorico_usd, horas_teoricas,
      total_usd_estimado, activo,
      componentes // si viene, reemplaza completamente la lista
    } = req.body;

    await client.query("BEGIN");

    const r = await client.query(`
      UPDATE curso SET
        nombre = COALESCE($2, nombre),
        descripcion = COALESCE($3, descripcion),
        gastos_administrativos_usd = COALESCE($4, gastos_administrativos_usd),
        costo_teorico_usd = COALESCE($5, costo_teorico_usd),
        horas_teoricas = COALESCE($6, horas_teoricas),
        total_usd_estimado = COALESCE($7, total_usd_estimado),
        activo = COALESCE($8, activo)
      WHERE id = $1 RETURNING *
    `, [id, nombre, descripcion, gastos_administrativos_usd, costo_teorico_usd, horas_teoricas, total_usd_estimado, activo]);

    if (Array.isArray(componentes)) {
      await client.query(`DELETE FROM curso_componente_practico WHERE id_curso = $1`, [id]);
      for (const cp of componentes) {
        if (!cp.tipo_aeronave) continue;
        await client.query(`
          INSERT INTO curso_componente_practico
            (id_curso, tipo_aeronave, horas_requeridas, tarifa_hora_usd_referencia)
          VALUES ($1, $2, $3, $4)
        `, [id, cp.tipo_aeronave, Number(cp.horas_requeridas || 0), Number(cp.tarifa_hora_usd_referencia || 0)]);
      }
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

exports.listInscripciones = async (req, res) => {
  try {
    const { id_alumno, estado } = req.query;
    const where = [];
    const params = [];
    if (id_alumno) { params.push(id_alumno); where.push(`ic.id_alumno = $${params.length}`); }
    if (estado)   { params.push(estado);     where.push(`ic.estado = $${params.length}`); }
    const r = await db.query(`
      SELECT ic.*, c.codigo, c.nombre AS curso_nombre, c.total_usd_estimado,
             u.username AS alumno_username
      FROM inscripcion_curso ic
      JOIN curso c ON c.id = ic.id_curso
      LEFT JOIN alumno a ON a.id_alumno = ic.id_alumno
      LEFT JOIN usuario u ON u.id_usuario = a.id_usuario
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY ic.fecha_inicio DESC
    `, params);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.crearInscripcion = async (req, res) => {
  const client = await db.connect();
  try {
    const { id_alumno, id_curso, fecha_inicio, observaciones } = req.body;
    await client.query("BEGIN");
    const ins = await client.query(`
      INSERT INTO inscripcion_curso (id_alumno, id_curso, fecha_inicio, observaciones)
      VALUES ($1, $2, COALESCE($3, CURRENT_DATE), $4) RETURNING *
    `, [id_alumno, id_curso, fecha_inicio || null, observaciones || null]);
    // Crear filas de avance basadas en componentes del curso
    await client.query(`
      INSERT INTO inscripcion_curso_avance (id_inscripcion, tipo_aeronave, horas_requeridas, horas_acumuladas)
      SELECT $1, cp.tipo_aeronave, cp.horas_requeridas, 0
      FROM curso_componente_practico cp
      WHERE cp.id_curso = $2
    `, [ins.rows[0].id, id_curso]);
    await client.query("COMMIT");
    res.json({ ok: true, data: ins.rows[0] });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};

exports.finalizarInscripcion = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(`
      UPDATE inscripcion_curso
      SET estado = 'COMPLETADO', fecha_finalizacion = CURRENT_DATE
      WHERE id = $1
    `, [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};
