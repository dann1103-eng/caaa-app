const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const { puedeAccederVuelo } = require("../../utils/ownership");

exports.getReporteVuelo = catchAsync(async (req, res) => {
  const { id } = req.params;
  if (!(await puedeAccederVuelo(req, res, id))) return;
  const result = await db.query(`
    SELECT
      v.*, b.hora_inicio, a.codigo AS aeronave_codigo, a.modelo AS aeronave_modelo, a.tipo AS aeronave_tipo,
      rv.id_reporte, rv.tipo_vuelo, rv.tacometro_salida, rv.tacometro_llegada,
      rv.hobbs_salida, rv.hobbs_llegada, rv.combustible_salida, rv.combustible_llegada,
      rv.cantidad_combustible, rv.horas_cobradas, rv.firma_alumno, rv.firma_instructor,
      rv.estado AS reporte_estado, rv.archivo_pdf, rv.es_inasistencia, rv.motivo_inasistencia
    FROM vuelo v
    JOIN aeronave a ON a.id_aeronave = v.id_aeronave
    JOIN bloque_horario b ON b.id_bloque = v.id_bloque
    LEFT JOIN reporte_vuelo rv ON rv.id_vuelo = v.id_vuelo
    WHERE v.id_vuelo = $1
  `, [id]);

  if (result.rows.length === 0) {
    return res.status(404).json({ message: 'Vuelo no encontrado' });
  }

  const row = result.rows[0];
  const vuelo = { ...row };
  const reporte = row.id_reporte ? {
    id_reporte: row.id_reporte,
    tipo_vuelo: row.tipo_vuelo,
    tacometro_salida: row.tacometro_salida,
    tacometro_llegada: row.tacometro_llegada,
    hobbs_salida: row.hobbs_salida,
    hobbs_llegada: row.hobbs_llegada,
    combustible_salida: row.combustible_salida,
    combustible_llegada: row.combustible_llegada,
    cantidad_combustible: row.cantidad_combustible,
    horas_cobradas: row.horas_cobradas,
    firma_alumno: row.firma_alumno,
    firma_instructor: row.firma_instructor,
    estado: row.reporte_estado,
    archivo_pdf: row.archivo_pdf,
    es_inasistencia: row.es_inasistencia ?? false,
    motivo_inasistencia: row.motivo_inasistencia
  } : null;

  res.json({ vuelo, reporte });
});


exports.guardarReporteVuelo = catchAsync(async (req, res) => {
  const { id } = req.params;
  if (!(await puedeAccederVuelo(req, res, id))) return;
  const data = req.body;
  await db.query(`
    INSERT INTO reporte_vuelo (id_vuelo, tipo_vuelo, tacometro_salida, tacometro_llegada, estado)
    VALUES ($1, $2, $3, $4, 'BORRADOR')
    ON CONFLICT (id_vuelo) DO UPDATE SET actualizado_en = NOW()
  `, [id, data.tipo_vuelo, data.tacometro_salida, data.tacometro_llegada]);
  res.json({ message: "Borrador guardado" });
});

exports.enviarReporteVuelo = catchAsync(async (req, res) => {
  const { id } = req.params;
  if (!(await puedeAccederVuelo(req, res, id))) return;
  const { firma_alumno } = req.body;
  await db.query(`UPDATE reporte_vuelo SET firma_alumno = $1, estado = 'PENDIENTE_INSTRUCTOR', actualizado_en = NOW() WHERE id_vuelo = $2`, [firma_alumno, id]);
  res.json({ message: "Reporte enviado al instructor" });
});

exports.getReportesCompletadosAlumno = catchAsync(async (req, res) => {
  const result = await db.query(`
    SELECT rv.*, v.fecha_vuelo FROM reporte_vuelo rv JOIN vuelo v ON v.id_vuelo = rv.id_vuelo
    WHERE rv.estado = 'COMPLETADO' AND v.id_alumno = (SELECT id_alumno FROM alumno WHERE id_usuario = $1)
    ORDER BY v.fecha_vuelo DESC
  `, [req.user.id_usuario]);
  res.json(result.rows);
});

exports.firmarReporteVueloAlumno = catchAsync(async (req, res) => {
  const { id } = req.params;
  if (!(await puedeAccederVuelo(req, res, id))) return;
  const { firma_alumno } = req.body;
  await db.query(`UPDATE reporte_vuelo SET firma_alumno = $1, estado = 'COMPLETADO', actualizado_en = NOW() WHERE id_vuelo = $2 AND estado = 'PENDIENTE_ALUMNO'`, [firma_alumno, id]);
  res.json({ message: "Reporte firmado y completado" });
});


exports.getReportesPendientesAlumno = catchAsync(async (req, res) => {
  const result = await db.query(`
    SELECT rv.*, v.fecha_vuelo, a.codigo AS aeronave_codigo
    FROM reporte_vuelo rv
    JOIN vuelo v ON v.id_vuelo = rv.id_vuelo
    JOIN aeronave a ON a.id_aeronave = v.id_aeronave
    WHERE rv.estado = 'PENDIENTE_ALUMNO' AND v.id_alumno = (SELECT id_alumno FROM alumno WHERE id_usuario = $1)
    ORDER BY v.fecha_vuelo DESC
  `, [req.user.id_usuario]);
  res.json(result.rows);
});
