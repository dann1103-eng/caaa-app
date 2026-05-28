const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const { logAuditoria } = require("../../utils/auditoria");

exports.getAeronavesActivas = catchAsync(async (req, res) => {
  const result = await db.query(`
    SELECT id_aeronave, codigo, modelo, tipo
    FROM aeronave
    WHERE activa = true
    ORDER BY codigo
  `);
  res.json(result.rows);
});

exports.getVuelosFuturosAeronave = catchAsync(async (req, res) => {
  const { id } = req.params;
  const r = await db.query(`
    SELECT COUNT(*)::int AS total
    FROM vuelo
    WHERE id_aeronave = $1
      AND estado IN ('PUBLICADO', 'SOLICITADO', 'AJUSTADO')
      AND fecha_vuelo >= CURRENT_DATE
  `, [id]);
  res.json({ total: r.rows[0].total });
});

exports.registrarHorasManuales = catchAsync(async (req, res) => {
  const { id_aeronave, horas, descripcion: desc } = req.body;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const aeronaveRes = await client.query(`SELECT horas_acumuladas, codigo FROM aeronave WHERE id_aeronave = $1 FOR UPDATE`, [id_aeronave]);
    if (aeronaveRes.rows.length === 0) throw new Error("Aeronave no encontrada");

    const horasAntes = parseFloat(aeronaveRes.rows[0].horas_acumuladas);
    const nuevasHoras = horasAntes + parseFloat(horas);

    await client.query(`UPDATE aeronave SET horas_acumuladas = $1 WHERE id_aeronave = $2`, [nuevasHoras, id_aeronave]);
    
    await logAuditoria(client, {
      accion: "OTRO",
      entidad: "aeronave",
      id_entidad: Number(id_aeronave),
      actor: req.user,
      req,
      descripcion: desc || `Registro manual de horas: +${horas}h`,
      metadata: { before: horasAntes, after: nuevasHoras }
    });

    await client.query("COMMIT");
    res.json({ message: "Horas registradas correctamente" });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

exports.setFotoAeronave = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { foto_url } = req.body;
  const r = await db.query(`UPDATE aeronave SET foto_url = $1 WHERE id_aeronave = $2 RETURNING id_aeronave, codigo, foto_url`, [foto_url || null, id]);
  if (r.rows.length === 0) return res.status(404).json({ message: "Aeronave no encontrada" });
  res.json(r.rows[0]);
});
