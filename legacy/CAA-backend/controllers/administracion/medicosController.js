const db = require("../../config/db");

exports.list = async (req, res) => {
  try {
    const r = await db.query(`
      SELECT * FROM medico_autorizado
      WHERE activo = TRUE
      ORDER BY especialidad, nombre
    `);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { especialidad, nombre, telefonos, correo } = req.body;
    if (!especialidad || !nombre) {
      return res.status(400).json({ ok: false, message: "Datos incompletos" });
    }
    const r = await db.query(`
      INSERT INTO medico_autorizado (especialidad, nombre, telefonos, correo)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [especialidad, nombre, telefonos || null, correo || null]);
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { especialidad, nombre, telefonos, correo, activo } = req.body;
    const r = await db.query(`
      UPDATE medico_autorizado SET
        especialidad = COALESCE($2, especialidad),
        nombre       = COALESCE($3, nombre),
        telefonos    = COALESCE($4, telefonos),
        correo       = COALESCE($5, correo),
        activo       = COALESCE($6, activo)
      WHERE id = $1 RETURNING *
    `, [id, especialidad, nombre, telefonos, correo, activo]);
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};
