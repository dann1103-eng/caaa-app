const db = require("../config/db");

// Lista las notificaciones del usuario autenticado (más recientes primero).
exports.listar = async (req, res) => {
  try {
    const r = await db.query(
      `SELECT id, tipo, mensaje, enlace, leida, creada_en
       FROM notificacion WHERE id_usuario = $1
       ORDER BY creada_en DESC LIMIT 50`,
      [req.user.id_usuario]
    );
    const noLeidas = r.rows.filter(n => !n.leida).length;
    res.json({ ok: true, data: r.rows, no_leidas: noLeidas });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.marcarLeida = async (req, res) => {
  try {
    await db.query(`UPDATE notificacion SET leida = TRUE WHERE id = $1 AND id_usuario = $2`,
      [req.params.id, req.user.id_usuario]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

exports.marcarTodas = async (req, res) => {
  try {
    await db.query(`UPDATE notificacion SET leida = TRUE WHERE id_usuario = $1 AND leida = FALSE`,
      [req.user.id_usuario]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};
