const db = require("../../config/db");
const { ROLES_STAFF, TIPOS_PUSH } = require("../../utils/webpush");

// Devuelve la matriz tipo×rol para la UI de Administración → Notificaciones push.
exports.listar = async (req, res) => {
  try {
    const r = await db.query(`SELECT tipo, rol, habilitado FROM push_notificacion_config`);
    const config = {};
    for (const { tipo } of TIPOS_PUSH) config[tipo] = Object.fromEntries(ROLES_STAFF.map((rol) => [rol, true]));
    for (const row of r.rows) {
      if (!config[row.tipo]) config[row.tipo] = {};
      config[row.tipo][row.rol] = row.habilitado;
    }
    res.json({ ok: true, tipos: TIPOS_PUSH, roles: ROLES_STAFF, config });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

// Actualiza uno o más pares (tipo, rol, habilitado). Body: { cambios: [{tipo, rol, habilitado}] }
exports.actualizar = async (req, res) => {
  const client = await db.connect();
  try {
    const { cambios } = req.body;
    if (!Array.isArray(cambios) || cambios.length === 0) {
      return res.status(400).json({ ok: false, message: "Debe incluir al menos un cambio" });
    }
    const tiposValidos = new Set(TIPOS_PUSH.map((t) => t.tipo));
    const rolesValidos = new Set(ROLES_STAFF);
    for (const c of cambios) {
      if (!tiposValidos.has(c.tipo) || !rolesValidos.has(c.rol) || typeof c.habilitado !== "boolean") {
        return res.status(400).json({ ok: false, message: `Cambio inválido: ${JSON.stringify(c)}` });
      }
    }
    await client.query("BEGIN");
    for (const c of cambios) {
      await client.query(
        `INSERT INTO push_notificacion_config (tipo, rol, habilitado)
         VALUES ($1, $2, $3)
         ON CONFLICT (tipo, rol) DO UPDATE SET habilitado = $3`,
        [c.tipo, c.rol, c.habilitado]
      );
    }
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ ok: false, message: e.message });
  } finally {
    client.release();
  }
};
