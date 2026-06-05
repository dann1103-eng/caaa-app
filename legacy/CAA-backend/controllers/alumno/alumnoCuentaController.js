const db = require("../../config/db");
const { urlFirmada, BUCKETS } = require("../../utils/storage");

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

/** URL temporal del archivo de un documento PROPIO del alumno (solo lectura). */
exports.miDocumentoArchivoUrl = async (req, res) => {
  try {
    const id_alumno = await resolveIdAlumno(req.user.id_usuario);
    if (!id_alumno) return res.status(404).json({ ok: false, message: "Alumno no encontrado" });
    const { id } = req.params;
    const r = await db.query(
      "SELECT archivo_path FROM documento_alumno WHERE id = $1 AND id_alumno = $2",
      [id, id_alumno]
    );
    if (r.rows.length === 0 || !r.rows[0].archivo_path) {
      return res.status(404).json({ ok: false, message: "Documento sin archivo" });
    }
    const ruta = r.rows[0].archivo_path;
    if (ruta.startsWith("/uploads/")) {
      return res.json({ ok: true, url: ruta, legacy: true });
    }
    const url = await urlFirmada(BUCKETS.DOCUMENTOS, ruta, 3600);
    res.json({ ok: true, url });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

/** Historial propio del alumno (solo lectura): vuelos, cursos, notas, facturas, recibos. */
exports.miHistorial = async (req, res) => {
  try {
    const id_alumno = await resolveIdAlumno(req.user.id_usuario);
    if (!id_alumno) return res.json({ ok: true, data: { vuelos: [], facturas: [], recibos: [], inscripciones: [], notas: [] } });

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
