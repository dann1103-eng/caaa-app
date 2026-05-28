const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");

exports.getMiHorario = catchAsync(async (req, res) => {
  const { week = "current" } = req.query;
  const alumnoRes = await db.query("SELECT id_alumno, limite_vuelos_avion, limite_vuelos_simulador FROM alumno WHERE id_usuario = $1", [req.user.id_usuario]);
  if (alumnoRes.rows.length === 0) return res.status(404).json({ message: "Alumno no encontrado" });
  const { id_alumno: idAlumno, limite_vuelos_avion: defLimAvion, limite_vuelos_simulador: defLimSim } = alumnoRes.rows[0];

  const semanaQuery = week === "next" 
    ? `SELECT * FROM semana_vuelo WHERE fecha_inicio > CURRENT_DATE ORDER BY fecha_inicio LIMIT 1`
    : `SELECT * FROM semana_vuelo WHERE CURRENT_DATE BETWEEN fecha_inicio AND fecha_fin LIMIT 1`;
  
  const semanaRes = await db.query(semanaQuery);
  if (semanaRes.rows.length === 0) return res.json({ vuelos: [], semana: null });

  const idSemana = semanaRes.rows[0].id_semana;

  const result = await db.query(`
    SELECT v.*, b.hora_inicio, b.hora_fin, ae.codigo AS aeronave_codigo, rv.estado AS reporte_estado,
           sc.id_solicitud_cancelacion, sc.estado AS estado_solicitud_cancelacion
    FROM vuelo v
    JOIN bloque_horario b ON b.id_bloque = v.id_bloque
    JOIN aeronave ae ON ae.id_aeronave = v.id_aeronave
    LEFT JOIN reporte_vuelo rv ON rv.id_vuelo = v.id_vuelo
    LEFT JOIN solicitud_cancelacion sc ON sc.id_vuelo = v.id_vuelo AND sc.estado = 'PENDIENTE'
    WHERE v.id_alumno = $1 AND v.id_semana = $2
    ORDER BY v.dia_semana, b.hora_inicio
  `, [idAlumno, idSemana]);

  const limitsRes = await db.query(`
    SELECT COALESCE(limite_vuelos_avion, $1) AS lim_avion, 
           COALESCE(limite_vuelos_simulador, $2) AS lim_sim
    FROM solicitud_semana 
    WHERE id_alumno = $3 AND id_semana = $4
  `, [defLimAvion, defLimSim, idAlumno, idSemana]);

  const limits = limitsRes.rows[0] || { lim_avion: defLimAvion, lim_sim: defLimSim };

  res.json({ 
    vuelos: result.rows, 
    semana: semanaRes.rows[0],
    limite_vuelos_avion: limits.lim_avion,
    limite_vuelos_simulador: limits.lim_sim
  });
});

exports.getMiLicencia = catchAsync(async (req, res) => {
  const result = await db.query(`
    SELECT l.* FROM alumno a JOIN licencia l ON l.id_licencia = a.id_licencia WHERE a.id_usuario = $1
  `, [req.user.id_usuario]);
  if (result.rows.length === 0) return res.status(404).json({ message: "Licencia no encontrada" });
  res.json(result.rows[0]);
});

exports.getMiInfo = catchAsync(async (req, res) => {
  const result = await db.query(`
    SELECT l.nombre AS licencia, u_ins.nombre AS instructor_nombre, u_ins.apellido AS instructor_apellido,
           a.limite_vuelos_avion, a.limite_vuelos_simulador
    FROM alumno a
    JOIN licencia l ON l.id_licencia = a.id_licencia
    LEFT JOIN instructor i ON i.id_instructor = a.id_instructor
    LEFT JOIN usuario u_ins ON u_ins.id_usuario = i.id_usuario
    WHERE a.id_usuario = $1
  `, [req.user.id_usuario]);
  res.json(result.rows[0]);
});

exports.getMiProximoMantenimiento = catchAsync(async (req, res) => {
  const result = await db.query(`
    SELECT ae.codigo AS aeronave_codigo, ae.horas_acumuladas, ae.horas_proxima_revision,
    (ae.horas_proxima_revision - ae.horas_acumuladas) AS horas_restantes
    FROM alumno al JOIN vuelo v ON v.id_alumno = al.id_alumno
    JOIN aeronave ae ON ae.id_aeronave = v.id_aeronave
    WHERE al.id_usuario = $1 AND v.estado = 'PUBLICADO' AND ae.tipo != 'SIMULADOR'
    ORDER BY v.fecha_vuelo DESC LIMIT 1
  `, [req.user.id_usuario]);
  res.json(result.rows[0] || null);
});

exports.getCondicionesCancelacion = catchAsync(async (req, res) => {
  const result = await db.query("SELECT * FROM condiciones_cancelacion WHERE activa = true ORDER BY orden ASC");
  
  const countRes = await db.query(`
    SELECT COUNT(*) 
    FROM solicitud_cancelacion sc
    JOIN alumno al ON al.id_alumno = sc.id_alumno
    WHERE al.id_usuario = $1
      AND sc.estado = 'ACEPTADA'
      AND EXTRACT(MONTH FROM sc.creado_en) = EXTRACT(MONTH FROM CURRENT_DATE)
      AND EXTRACT(YEAR FROM sc.creado_en) = EXTRACT(YEAR FROM CURRENT_DATE)
  `, [req.user.id_usuario]);

  res.json({ 
    condiciones: result.rows,
    cancelaciones_aceptadas_mes: parseInt(countRes.rows[0].count)
  });
});


exports.getBloquesBloqueados = catchAsync(async (req, res) => {
  const result = await db.query("SELECT * FROM bloque_bloqueado_dia ORDER BY dia_semana, id_bloque");
  res.json(result.rows);
});

