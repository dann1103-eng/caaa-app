const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const { logAuditoria } = require("../../utils/auditoria");

exports.getAlumnosListAdmin = catchAsync(async (req, res) => {
  const result = await db.query(`
    SELECT a.id_alumno, a.id_instructor, u.nombre, u.apellido, u.nombre || ' ' || u.apellido AS nombre_completo
    FROM alumno a JOIN usuario u ON u.id_usuario = a.id_usuario
    WHERE a.activo = true ORDER BY u.apellido, u.nombre
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
    WHERE a.activo = true ORDER BY u.apellido, u.nombre
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

