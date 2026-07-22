const db = require("../../config/db");
const { notificarPorRol } = require("../../utils/webpush");

// "Proyección" (pantalla pública) no es un rol real de `usuario` — es el
// pseudo-rol que proyeccionMiddleware le pone a quien entra con la llave.
// Se incluye acá como destino elegible del ticker (no del push, que se manda
// por rol real de `usuario.rol`).
const ROLES_VALIDOS = ["ALUMNO", "INSTRUCTOR", "TURNO", "PROGRAMACION", "TALLER", "ADMINISTRACION", "DUENO", "PROYECCION"];

// Aviso compuesto a mano desde Administración, con destinatarios elegidos EN
// EL MOMENTO (sin destinatarios = "Todos", difusión general — igual que los
// avisos que ya publica Turno). Puede mandarse como ticker, como push, o ambos.
exports.publicarAviso = async (req, res) => {
  const { mensaje, destinatarios, enviarTicker = true, enviarPush = true } = req.body;
  const user = req.user;
  const io = req.app.get("io");

  if (!mensaje || !mensaje.trim()) {
    return res.status(400).json({ message: "El mensaje no puede estar vacío" });
  }
  if (!enviarTicker && !enviarPush) {
    return res.status(400).json({ message: "Elegí al menos un canal: ticker o push" });
  }

  let roles = null;
  if (Array.isArray(destinatarios) && destinatarios.length > 0) {
    roles = destinatarios.filter((r) => ROLES_VALIDOS.includes(r));
    if (roles.length === 0) {
      return res.status(400).json({ message: "Destinatarios inválidos" });
    }
  }

  try {
    let ticker = null;

    if (enviarTicker) {
      // Misma expiración que el ticker de Turno: fin del último bloque del
      // día, con un piso de 2h por si se publica fuera de horario operativo.
      const bloqueRes = await db.query(`SELECT hora_fin FROM bloque_horario ORDER BY hora_fin DESC LIMIT 1`);
      let expiraExp = "NOW() + INTERVAL '2 hours'";
      if (bloqueRes.rows.length > 0) {
        const horaFin = bloqueRes.rows[0].hora_fin;
        expiraExp = `GREATEST(
          ((NOW() AT TIME ZONE 'America/El_Salvador')::date + '${horaFin}'::time) AT TIME ZONE 'America/El_Salvador',
          NOW() + INTERVAL '2 hours'
        )`;
      }

      const result = await db.query(
        `INSERT INTO mensaje_turno (contenido, tipo, destinatarios, id_usuario_origen, activo, expira_en)
         VALUES ($1, 'TURNO', $2, $3, true, ${expiraExp})
         RETURNING id_mensaje, contenido, creado_en, expira_en, destinatarios`,
        [mensaje.trim().toUpperCase(), roles, user?.id_usuario ?? null]
      );
      ticker = result.rows[0];
      if (io) io.emit("nuevo_ticker", ticker);
    }

    if (enviarPush) {
      // Solo roles reales de `usuario` — "PROYECCION" (si viene elegido) no
      // corresponde a ninguna suscripción push, notificarPorRol simplemente
      // no encuentra filas para ese valor.
      await notificarPorRol(
        { title: "📢 Aviso de Administración", body: mensaje.trim(), url: "/perfil", tag: "aviso-admin" },
        roles,
        { excluirUid: user?.id_usuario }
      );
    }

    res.json({ message: "Aviso publicado", ticker });
  } catch (e) {
    console.error("publicarAviso:", e);
    res.status(500).json({ message: "Error al publicar el aviso" });
  }
};
