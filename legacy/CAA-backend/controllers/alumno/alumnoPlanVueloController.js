const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const { logAuditoria } = require("../../utils/auditoria");
const { puedeAccederVuelo } = require("../../utils/ownership");

exports.getPlanVuelo = catchAsync(async (req, res) => {
  const { id_vuelo } = req.params;
  if (!(await puedeAccederVuelo(req, res, id_vuelo))) return;
  const result = await db.query(`
    SELECT v.*, ae.codigo AS aeronave_codigo, u_al.nombre AS alumno_nombre, u_ins.nombre AS instructor_nombre
    FROM vuelo v
    JOIN aeronave ae ON ae.id_aeronave = v.id_aeronave
    JOIN alumno a ON a.id_alumno = v.id_alumno
    JOIN usuario u_al ON u_al.id_usuario = a.id_usuario
    JOIN instructor i ON i.id_instructor = v.id_instructor
    JOIN usuario u_ins ON u_ins.id_usuario = i.id_usuario
    WHERE v.id_vuelo = $1
  `, [id_vuelo]);
  
  if (result.rows.length === 0) return res.status(404).json({ message: "Vuelo no encontrado" });
  const planRes = await db.query(`SELECT * FROM plan_vuelo WHERE id_vuelo = $1`, [id_vuelo]);
  res.json({ vuelo: result.rows[0], plan: planRes.rows[0] ?? null });
});

exports.guardarPlanVuelo = catchAsync(async (req, res) => {
  const { id_vuelo } = req.params;
  if (!(await puedeAccederVuelo(req, res, id_vuelo))) return;
  const data = req.body;
  await db.query(`
    INSERT INTO plan_vuelo (id_vuelo, reglas, hora_salida, altitud, ruta, estado)
    VALUES ($1, $2, $3, $4, $5, 'BORRADOR')
    ON CONFLICT (id_vuelo) DO UPDATE SET actualizado_en = NOW()
  `, [id_vuelo, data.reglas, data.hora_salida, data.altitud, data.ruta]);
  res.json({ message: "Plan de vuelo guardado" });
});

exports.completarPlanVuelo = catchAsync(async (req, res) => {
  const { id_vuelo } = req.params;
  if (!(await puedeAccederVuelo(req, res, id_vuelo))) return;
  const archivo = req.file;
  if (!archivo) return res.status(400).json({ message: "Se requiere el PDF del plan de vuelo" });

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE plan_vuelo SET estado = 'COMPLETADO', archivo_pdf = $1, actualizado_en = NOW() WHERE id_vuelo = $2`, [archivo.filename, id_vuelo]);
    await logAuditoria(client, { accion: "FILL_PLAN_VUELO", entidad: "plan_vuelo", id_entidad: Number(id_vuelo), actor: req.user, req, descripcion: "Alumno completó plan de vuelo" });
    await client.query("COMMIT");
    res.json({ message: "Plan de vuelo completado", archivo_pdf: archivo.filename });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

