const db = require("../../config/db");

exports.list = async (req, res) => {
  try {
    const { categoria, desde, hasta } = req.query;
    const params = [];
    const where = [];
    if (categoria) { params.push(categoria); where.push(`categoria = $${params.length}`); }
    if (desde) { params.push(desde); where.push(`fecha >= $${params.length}`); }
    if (hasta) { params.push(hasta); where.push(`fecha <= $${params.length}`); }
    const r = await db.query(`
      SELECT * FROM egreso
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY fecha DESC, id DESC
      LIMIT 500
    `, params);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { categoria, proveedor, concepto, monto_usd, fecha, id_mantenimiento } = req.body;
    if (!categoria || !concepto || !monto_usd) {
      return res.status(400).json({ ok: false, message: "Datos incompletos" });
    }
    const r = await db.query(`
      INSERT INTO egreso (categoria, proveedor, concepto, monto_usd, fecha, id_mantenimiento, registrado_por)
      VALUES ($1, $2, $3, $4, COALESCE($5, CURRENT_DATE), $6, $7) RETURNING *
    `, [categoria, proveedor || null, concepto, monto_usd, fecha || null, id_mantenimiento || null, req.user?.id_usuario || null]);
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { categoria, proveedor, concepto, monto_usd, fecha } = req.body;
    const r = await db.query(`
      UPDATE egreso SET
        categoria = COALESCE($2, categoria),
        proveedor = COALESCE($3, proveedor),
        concepto  = COALESCE($4, concepto),
        monto_usd = COALESCE($5, monto_usd),
        fecha     = COALESCE($6, fecha)
      WHERE id = $1 RETURNING *
    `, [id, categoria, proveedor, concepto, monto_usd, fecha]);
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};
