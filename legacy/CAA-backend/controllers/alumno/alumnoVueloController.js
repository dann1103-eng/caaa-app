const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const { getEstadoCancelaciones } = require("../../services/cancelacionService");

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

  const alRes = await db.query(`SELECT id_alumno FROM alumno WHERE id_usuario = $1`, [req.user.id_usuario]);
  const idAlumno = alRes.rows[0]?.id_alumno;
  const idVuelo = req.query.id_vuelo ? Number(req.query.id_vuelo) : null;

  let estado = { count_mes: 0, racha_semanas: 0, ya_cancelo_esta_semana: false, proxima_tiene_multa: false, motivo: null, monto: 0 };
  if (idAlumno) {
    estado = await getEstadoCancelaciones(idAlumno, idVuelo);
  }

  res.json({
    condiciones: result.rows,
    // Compat: el modal viejo leía cancelaciones_aceptadas_mes; ahora usamos el
    // conteo unificado PENDIENTE+ACEPTADA.
    cancelaciones_aceptadas_mes: estado.count_mes,
    ...estado,
  });
});


exports.getBloquesBloqueados = catchAsync(async (req, res) => {
  const result = await db.query("SELECT * FROM bloque_bloqueado_dia ORDER BY dia_semana, id_bloque");
  res.json(result.rows);
});

// Próximas clases teóricas del alumno (sesiones futuras de sus cursos activos).
exports.getMisClases = catchAsync(async (req, res) => {
  const alRes = await db.query(`SELECT id_alumno FROM alumno WHERE id_usuario = $1`, [req.user.id_usuario]);
  const idAlumno = alRes.rows[0]?.id_alumno;
  if (!idAlumno) return res.json([]);

  const r = await db.query(`
    SELECT s.id, s.fecha, s.hora_inicio, s.hora_fin, s.tema,
           c.codigo AS curso_codigo, c.nombre AS curso_nombre,
           un.numero AS unidad_numero, un.nombre AS unidad_nombre,
           (u.nombre || ' ' || u.apellido) AS instructor_nombre
    FROM sesion_clase s
    JOIN curso c ON c.id = s.id_curso
    JOIN inscripcion_curso ic ON ic.id_curso = s.id_curso AND ic.id_alumno = $1 AND ic.estado = 'ACTIVO'
    LEFT JOIN unidad_teorica un ON un.id = s.id_unidad
    LEFT JOIN instructor i ON i.id_instructor = s.id_instructor
    LEFT JOIN usuario u ON u.id_usuario = i.id_usuario
    WHERE s.fecha >= CURRENT_DATE
    ORDER BY s.fecha ASC, s.hora_inicio ASC NULLS LAST
    LIMIT 10
  `, [idAlumno]);
  res.json(r.rows);
});

