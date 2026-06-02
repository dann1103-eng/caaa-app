const db = require("../../config/db");

/**
 * Personal administrativo de planta (no instructor). Cada empleado tiene un
 * selector booleano `es_servicios_profesionales` que decide en cuál planilla
 * entra (PLANTA con ISR/ISSS/AFP, o SERVICIOS con retención del 10%).
 */

exports.list = async (req, res) => {
  try {
    const r = await db.query(`
      SELECT * FROM empleado
      WHERE activo = TRUE
      ORDER BY nombre
    `);
    res.json({ ok: true, data: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.create = async (req, res) => {
  try {
    const {
      nombre, dui, nit, isss_num, afp_num, cargo,
      sueldo_base, es_servicios_profesionales
    } = req.body;
    if (!nombre) {
      return res.status(400).json({ ok: false, message: "El nombre es obligatorio" });
    }
    const r = await db.query(`
      INSERT INTO empleado
        (nombre, dui, nit, isss_num, afp_num, cargo, sueldo_base, es_servicios_profesionales)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      nombre, dui || null, nit || null, isss_num || null, afp_num || null,
      cargo || null, Number(sueldo_base) || 0, !!es_servicios_profesionales
    ]);
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombre, dui, nit, isss_num, afp_num, cargo,
      sueldo_base, es_servicios_profesionales, activo
    } = req.body;
    const r = await db.query(`
      UPDATE empleado SET
        nombre                      = COALESCE($2, nombre),
        dui                         = COALESCE($3, dui),
        nit                         = COALESCE($4, nit),
        isss_num                    = COALESCE($5, isss_num),
        afp_num                     = COALESCE($6, afp_num),
        cargo                       = COALESCE($7, cargo),
        sueldo_base                 = COALESCE($8, sueldo_base),
        es_servicios_profesionales  = COALESCE($9, es_servicios_profesionales),
        activo                      = COALESCE($10, activo)
      WHERE id = $1
      RETURNING *
    `, [
      id, nombre, dui, nit, isss_num, afp_num, cargo,
      sueldo_base != null ? Number(sueldo_base) : null,
      es_servicios_profesionales,
      activo
    ]);
    if (r.rows.length === 0) {
      return res.status(404).json({ ok: false, message: "Empleado no encontrado" });
    }
    res.json({ ok: true, data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};
