const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");

exports.getAuditoria = catchAsync(async (req, res) => {
  const { accion, usuario, entidad, page = 1 } = req.query;
  const PAGE_SIZE = 20;
  const offset = (Math.max(1, Number(page)) - 1) * PAGE_SIZE;

  const result = await db.query(`
    SELECT ae.*, u.nombre AS actor_nombre, u.apellido AS actor_apellido
    FROM auditoria_evento ae
    LEFT JOIN usuario u ON u.id_usuario = ae.actor_id_usuario
    ORDER BY ae.creado_en DESC LIMIT $1 OFFSET $2
  `, [PAGE_SIZE, offset]);

  res.json({ registros: result.rows });
});

exports.getAccionesAuditoria = catchAsync(async (req, res) => {
  const result = await db.query(`SELECT DISTINCT accion FROM auditoria_evento ORDER BY accion`);
  res.json(result.rows.map(r => r.accion));
});
