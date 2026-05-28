const db = require("../../config/db");

/** Obtiene el id_alumno a partir del id_usuario del request. */
async function resolveIdAlumno(id_usuario) {
  const r = await db.query(`SELECT id_alumno FROM alumno WHERE id_usuario = $1`, [id_usuario]);
  return r.rows[0]?.id_alumno ?? null;
}

exports.miCuenta = async (req, res) => {
  try {
    const id_alumno = await resolveIdAlumno(req.user.id_usuario);
    if (!id_alumno) return res.status(404).json({ ok: false, message: "Alumno no encontrado" });
    const r = await db.query(`
      SELECT COALESCE(c.saldo_actual_usd, 0) AS saldo_actual_usd,
             c.ultimo_movimiento_en
      FROM alumno a
      LEFT JOIN cuenta_corriente_alumno c ON c.id_alumno = a.id_alumno
      WHERE a.id_alumno = $1
    `, [id_alumno]);
    res.json({ ok: true, data: { id_alumno, ...r.rows[0] } });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.miExtracto = async (req, res) => {
  try {
    const id_alumno = await resolveIdAlumno(req.user.id_usuario);
    if (!id_alumno) return res.json({ ok: true, data: [] });
    const r = await db.query(`
      SELECT m.*, f.numero_correlativo AS factura_correlativo,
             r.numero_correlativo AS recibo_correlativo
      FROM movimiento_cuenta m
      LEFT JOIN factura f ON f.id = m.id_factura
      LEFT JOIN recibo_pago r ON r.id = m.id_recibo
      WHERE m.id_alumno = $1
      ORDER BY m.fecha DESC
      LIMIT 200
    `, [id_alumno]);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.miAvanceCurso = async (req, res) => {
  try {
    const id_alumno = await resolveIdAlumno(req.user.id_usuario);
    if (!id_alumno) return res.json({ ok: true, data: [] });
    const r = await db.query(`
      SELECT ic.id AS id_inscripcion, ic.estado, c.codigo AS curso_codigo, c.nombre AS curso_nombre,
             c.total_usd_estimado,
             COALESCE((SELECT json_agg(json_build_object(
               'tipo_aeronave', av.tipo_aeronave,
               'horas_requeridas', av.horas_requeridas,
               'horas_acumuladas', av.horas_acumuladas
             )) FROM inscripcion_curso_avance av WHERE av.id_inscripcion = ic.id), '[]'::json) AS avance
      FROM inscripcion_curso ic
      JOIN curso c ON c.id = ic.id_curso
      WHERE ic.id_alumno = $1
      ORDER BY ic.fecha_inicio DESC
    `, [id_alumno]);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.misDocumentos = async (req, res) => {
  try {
    const id_alumno = await resolveIdAlumno(req.user.id_usuario);
    if (!id_alumno) return res.json({ ok: true, data: [] });
    const r = await db.query(`
      SELECT d.*, c.codigo, c.nombre, c.autoridad, c.aplica_a_menores, c.aplica_a_extranjeros,
             c.frecuencia_renovacion_meses
      FROM documento_requerido_catalogo c
      LEFT JOIN documento_alumno d ON d.id_documento_requerido = c.id AND d.id_alumno = $1
      WHERE c.activo = TRUE
      ORDER BY c.autoridad, c.nombre
    `, [id_alumno]);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};
