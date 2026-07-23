const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const { logAuditoria } = require("../../utils/auditoria");

exports.getAlumnosListAdmin = catchAsync(async (req, res) => {
  const result = await db.query(`
    SELECT a.id_alumno, a.id_instructor, u.nombre, u.apellido, u.nombre || ' ' || u.apellido AS nombre_completo
    FROM alumno a JOIN usuario u ON u.id_usuario = a.id_usuario
    WHERE a.activo = true AND NOT COALESCE(a.es_practicante, false) AND NOT COALESCE(a.es_externo, false)
    ORDER BY u.apellido, u.nombre
  `);
  res.json(result.rows);
});

exports.getAlumnoPerfilAdmin = catchAsync(async (req, res) => {
  const { id_alumno } = req.params;
  const result = await db.query(`
    SELECT u.id_usuario, u.nombre, u.apellido, u.correo, a.id_alumno, a.telefono, a.numero_licencia, a.soleado
    FROM alumno a JOIN usuario u ON u.id_usuario = a.id_usuario
    WHERE a.id_alumno = $1
  `, [id_alumno]);
  if (result.rows.length === 0) return res.status(404).json({ message: "Alumno no encontrado" });
  res.json(result.rows[0]);
});

// Ficha completa del alumno (todos los campos que admin/instructor/alumno pueden ver/editar).
exports.getAlumnoFichaAdmin = catchAsync(async (req, res) => {
  const { id_alumno } = req.params;
  const result = await db.query(`
    SELECT u.id_usuario, u.nombre, u.apellido, u.correo, u.username,
           u.dui, u.direccion, u.es_extranjero, u.pasaporte, u.nacionalidad,
           a.id_alumno, a.id_instructor, a.id_licencia, a.numero_licencia,
           a.telefono, a.soleado, a.horas_acumuladas,
           a.certificado_medico, a.certificado_medico_numero,
           a.seguro_vida, a.seguro_vida_vencimiento, a.seguro_vida_numero,
           a.limite_vuelos_avion, a.limite_vuelos_simulador,
           l.nombre AS licencia_nombre,
           i_u.nombre || ' ' || i_u.apellido AS instructor_nombre
    FROM alumno a
    JOIN usuario u ON u.id_usuario = a.id_usuario
    LEFT JOIN licencia l ON l.id_licencia = a.id_licencia
    LEFT JOIN instructor i ON i.id_instructor = a.id_instructor
    LEFT JOIN usuario i_u ON i_u.id_usuario = i.id_usuario
    WHERE a.id_alumno = $1
  `, [id_alumno]);
  if (result.rows.length === 0) return res.status(404).json({ message: "Alumno no encontrado" });
  res.json(result.rows[0]);
});

// Edición completa del perfil del alumno por ADMIN/ADMINISTRACION (lo mismo que el
// alumno edita de sí mismo + lo que ajusta el instructor). Solo actualiza los campos
// presentes en el body (COALESCE), para edición parcial segura.
exports.actualizarAlumnoFull = catchAsync(async (req, res) => {
  const { id_alumno } = req.params;
  const {
    telefono, numero_licencia, id_licencia, soleado,
    certificado_medico, certificado_medico_numero,
    seguro_vida, seguro_vida_vencimiento, seguro_vida_numero,
    limite_vuelos_avion, limite_vuelos_simulador,
    id_instructor,
    horas_acumuladas,
    // Datos fiscales / facturación (viven en `usuario`)
    correo, dui, direccion, es_extranjero, pasaporte, nacionalidad,
  } = req.body;

  // Horas totales acumuladas: seteo manual del "saldo inicial" de horas (para
  // alumnos cuyo historial arrancó fuera de la plataforma). Solo se toca si
  // viene en el body; el cierre de vuelos sigue sumando encima con normalidad.
  let horasSet = null;
  if (horas_acumuladas != null && horas_acumuladas !== "") {
    horasSet = Number(horas_acumuladas);
    if (!Number.isFinite(horasSet) || horasSet < 0 || horasSet > 100000) {
      return res.status(400).json({ message: "Horas totales inválidas (0 a 100000)" });
    }
  }

  const r = await db.query(`
    UPDATE alumno SET
      telefono                  = COALESCE($2, telefono),
      numero_licencia           = COALESCE($3, numero_licencia),
      id_licencia               = COALESCE($4, id_licencia),
      soleado                   = COALESCE($5, soleado),
      certificado_medico        = COALESCE($6, certificado_medico),
      certificado_medico_numero = COALESCE($7, certificado_medico_numero),
      seguro_vida               = COALESCE($8, seguro_vida),
      seguro_vida_vencimiento   = COALESCE($9, seguro_vida_vencimiento),
      seguro_vida_numero        = COALESCE($10, seguro_vida_numero),
      limite_vuelos_avion       = COALESCE($11, limite_vuelos_avion),
      limite_vuelos_simulador   = COALESCE($12, limite_vuelos_simulador),
      id_instructor             = COALESCE($13, id_instructor),
      horas_acumuladas          = COALESCE($14, horas_acumuladas)
    WHERE id_alumno = $1
    RETURNING id_alumno
  `, [
    id_alumno,
    telefono ?? null, numero_licencia ?? null, id_licencia ?? null,
    typeof soleado === "boolean" ? soleado : null,
    certificado_medico || null, certificado_medico_numero ?? null,
    seguro_vida ?? null, seguro_vida_vencimiento || null, seguro_vida_numero ?? null,
    limite_vuelos_avion ?? null, limite_vuelos_simulador ?? null,
    id_instructor ?? null,
    horasSet,
  ]);
  if (r.rows.length === 0) return res.status(404).json({ message: "Alumno no encontrado" });

  // Datos fiscales / facturación en `usuario` (DUI/pasaporte/extranjero/dirección/correo).
  await db.query(`
    UPDATE usuario SET
      correo        = COALESCE(NULLIF($2, ''), correo),
      dui           = COALESCE($3, dui),
      direccion     = COALESCE($4, direccion),
      es_extranjero = COALESCE($5::boolean, es_extranjero),
      pasaporte     = COALESCE($6, pasaporte),
      nacionalidad  = COALESCE($7, nacionalidad)
    WHERE id_usuario = (SELECT id_usuario FROM alumno WHERE id_alumno = $1)
  `, [
    id_alumno, correo ?? null, dui ?? null, direccion ?? null,
    typeof es_extranjero === "boolean" ? es_extranjero : null,
    pasaporte ?? null, nacionalidad ?? null,
  ]);

  await logAuditoria(client_safe(), {
    accion: "OTRO", entidad: "alumno", id_entidad: id_alumno, actor: req.user, req,
    descripcion: `Admin/Administración actualizó la ficha del alumno ${id_alumno}`,
  }).catch(() => {});

  res.json({ ok: true, message: "Ficha actualizada" });
});
// logAuditoria espera un client/db; usamos db directo.
function client_safe() { return db; }

exports.listLicencias = catchAsync(async (req, res) => {
  const r = await db.query(`SELECT id_licencia, nombre FROM licencia ORDER BY id_licencia`);
  res.json(r.rows);
});

// Aeronaves habilitadas por una licencia dada (no la del alumno) — usado por el
// selector "licencia a chequear" del modal de agendar (categoría CHEQUEO).
exports.getAeronavesPorLicencia = catchAsync(async (req, res) => {
  const { id_licencia } = req.params;
  const result = await db.query(`
    SELECT a.id_aeronave, a.codigo, a.modelo, a.tipo
    FROM licencia_aeronave la
    JOIN aeronave a ON a.id_aeronave = la.id_aeronave
    WHERE la.id_licencia = $1 AND a.activa = true
    ORDER BY a.codigo
  `, [id_licencia]);
  res.json(result.rows);
});

exports.setSoleado = catchAsync(async (req, res) => {
  const { id_alumno } = req.params;
  const { soleado } = req.body;
  await db.query(`UPDATE alumno SET soleado = $1 WHERE id_alumno = $2`, [soleado, id_alumno]);
  res.json({ message: "Estado soleado actualizado" });
});

exports.getAlumnosConLimite = catchAsync(async (req, res) => {
  const semanaRes = await db.query(`
    SELECT id_semana, fecha_inicio, fecha_fin
    FROM semana_vuelo
    WHERE fecha_inicio > CURRENT_DATE
    ORDER BY fecha_inicio LIMIT 1
  `);
  if (semanaRes.rows.length === 0) return res.json({ semana: null, alumnos: [] });

  const result = await db.query(`
    SELECT a.id_alumno, u.nombre || ' ' || u.apellido AS nombre_completo, 
           COALESCE(ss.limite_vuelos_avion, a.limite_vuelos_avion, 3) AS limite_vuelos_avion,
           COALESCE(ss.limite_vuelos_simulador, a.limite_vuelos_simulador, 3) AS limite_vuelos_simulador,
           (SELECT u2.nombre || ' ' || u2.apellido 
            FROM instructor i 
            JOIN usuario u2 ON u2.id_usuario = i.id_usuario 
            WHERE i.id_instructor = a.id_instructor LIMIT 1) AS instructor_nombre
    FROM alumno a JOIN usuario u ON u.id_usuario = a.id_usuario
    LEFT JOIN solicitud_semana ss ON ss.id_alumno = a.id_alumno AND ss.id_semana = $1
    WHERE a.activo = true AND NOT COALESCE(a.es_practicante, false) AND NOT COALESCE(a.es_externo, false)
    ORDER BY u.apellido, u.nombre
  `, [semanaRes.rows[0].id_semana]);
  res.json({ semana: semanaRes.rows[0], alumnos: result.rows });
});

exports.habilitarVueloExtra = catchAsync(async (req, res) => {
  const { id_alumno } = req.params;
  const { id_semana, limite_vuelos_avion, limite_vuelos_simulador } = req.body;
  
  await db.query(`
    INSERT INTO solicitud_semana (id_alumno, id_semana, limite_vuelos_avion, limite_vuelos_simulador, estado)
    VALUES ($1, $2, $3, $4, 'BORRADOR')
    ON CONFLICT (id_alumno, id_semana) DO UPDATE SET 
      limite_vuelos_avion = EXCLUDED.limite_vuelos_avion, 
      limite_vuelos_simulador = EXCLUDED.limite_vuelos_simulador, 
      fecha_actualizacion = NOW()
  `, [id_alumno, id_semana, limite_vuelos_avion, limite_vuelos_simulador]);
  
  res.json({ message: "Límites actualizados correctamente" });
});

exports.getAeronavesPermitidasAlumno = catchAsync(async (req, res) => {
  const { id_alumno } = req.params;
  const alumnoRes = await db.query(`SELECT id_licencia FROM alumno WHERE id_alumno = $1`, [id_alumno]);
  if (alumnoRes.rows.length === 0) return res.status(404).json({ message: "Alumno no encontrado" });
  
  const idLicencia = alumnoRes.rows[0].id_licencia;
  if (!idLicencia) return res.json([]);

  const result = await db.query(`
    SELECT a.id_aeronave, a.codigo, a.modelo, a.tipo
    FROM licencia_aeronave la
    JOIN aeronave a ON a.id_aeronave = la.id_aeronave
    WHERE la.id_licencia = $1 AND a.activa = true
    ORDER BY a.codigo
  `, [idLicencia]);
  res.json(result.rows);
});

