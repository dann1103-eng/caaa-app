const db = require("../../config/db");

// Catálogo configurable de "tipos de cobro" (conceptos) con monto por defecto.
// Ej: Reposición de examen ($60). Se aplican a la cuenta del alumno como cargo.

exports.list = async (req, res) => {
  try {
    const soloActivos = req.query.activos === "true";
    const r = await db.query(`
      SELECT * FROM concepto_cobro
      ${soloActivos ? "WHERE activo = true" : ""}
      ORDER BY activo DESC, nombre
    `);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { codigo, nombre, monto_usd, descripcion } = req.body;
    if (!nombre || monto_usd == null) {
      return res.status(400).json({ ok: false, message: "Nombre y monto son obligatorios" });
    }
    const r = await db.query(`
      INSERT INTO concepto_cobro (codigo, nombre, monto_usd, descripcion)
      VALUES (NULLIF($1, ''), $2, $3, $4)
      RETURNING *
    `, [codigo || null, nombre, Number(monto_usd), descripcion || null]);
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ ok: false, message: "Ese código ya existe" });
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, monto_usd, descripcion, activo } = req.body;
    const r = await db.query(`
      UPDATE concepto_cobro SET
        nombre      = COALESCE($2, nombre),
        monto_usd   = COALESCE($3, monto_usd),
        descripcion = $4,
        activo      = COALESCE($5, activo)
      WHERE id = $1
      RETURNING *
    `, [id, nombre || null, monto_usd != null ? Number(monto_usd) : null, descripcion ?? null, activo]);
    if (!r.rows.length) return res.status(404).json({ ok: false, message: "Concepto no encontrado" });
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};
