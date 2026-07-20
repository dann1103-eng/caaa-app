const db = require("../config/db");
const { notificarRoles } = require("../utils/notificaciones");

// ── Acciones del dueño ───────────────────────────────────────────────────────
// El dashboard del dueño es de solo lectura salvo esto: marcar un vuelo como
// revisado/aprobado. Al marcarlo se notifica in-app a los usuarios de TURNO;
// desmarcar (des-clickear el checkbox) solo limpia el campo, sin notificar.

exports.aprobarVuelo = async (req, res) => {
  try {
    const { id_vuelo } = req.params;
    const aprobado = req.body?.aprobado !== false; // default: marcar

    const r = await db.query(`
      UPDATE vuelo SET aprobado_dueno_en = ${aprobado ? "NOW()" : "NULL"}
      WHERE id_vuelo = $1
      RETURNING id_vuelo, aprobado_dueno_en
    `, [id_vuelo]);
    if (r.rows.length === 0) return res.status(404).json({ message: "Vuelo no encontrado" });

    if (aprobado) {
      // Datos del vuelo para el texto de la notificación.
      const info = await db.query(`
        SELECT a.codigo AS aeronave_codigo,
               TRIM(u.nombre || ' ' || COALESCE(u.apellido, '')) AS alumno_nombre,
               b.hora_inicio
        FROM vuelo v
        JOIN aeronave a ON a.id_aeronave = v.id_aeronave
        LEFT JOIN alumno al ON al.id_alumno = v.id_alumno
        LEFT JOIN usuario u ON u.id_usuario = al.id_usuario
        LEFT JOIN bloque_horario b ON b.id_bloque = v.id_bloque
        WHERE v.id_vuelo = $1
      `, [id_vuelo]);
      const v = info.rows[0] || {};
      const quien = `Cap. ${req.user.nombre || ""} ${req.user.apellido || ""}`.trim();
      const detalle = [v.aeronave_codigo, v.alumno_nombre, v.hora_inicio ? String(v.hora_inicio).slice(0, 5) : null]
        .filter(Boolean).join(" · ");

      // Best-effort: la notificación nunca debe voltear la acción principal.
      try {
        await notificarRoles(null, ["TURNO"], {
          tipo: "INFO",
          mensaje: `✅ El ${quien} aprobó esta operación: ${detalle}`,
        });
      } catch (e) {
        console.error("duenoController.aprobarVuelo notificación:", e.message);
      }
    }

    const io = req.app.get("io");
    if (io) io.emit("vuelo_aprobado_dueno", { id_vuelo: Number(id_vuelo), aprobado_dueno_en: r.rows[0].aprobado_dueno_en });

    res.json({ id_vuelo: r.rows[0].id_vuelo, aprobado_dueno_en: r.rows[0].aprobado_dueno_en });
  } catch (e) {
    console.error("duenoController.aprobarVuelo:", e);
    res.status(500).json({ message: "Error al marcar el vuelo" });
  }
};
