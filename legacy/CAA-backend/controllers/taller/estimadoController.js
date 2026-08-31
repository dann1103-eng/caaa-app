/**
 * Estimado de finalización del mantenimiento — la fecha que manda es la del Taller.
 *
 * El caso real: el Taller destapa el avión, encuentra más trabajo, y lo que
 * Operaciones calculó en dos días se vuelve una semana. Hasta ahora el Taller no
 * tenía cómo decirlo y los vuelos seguían programados sobre un avión que no iba
 * a estar.
 *
 * Decisión de Daniel: **manda el Taller**. Su fecha pisa la de Operaciones y los
 * vuelos que queden adentro se cancelan.
 *
 * Se escribe directo sobre `mantenimiento_aeronave.fecha_fin` (una sola fuente de
 * verdad: todo lo que ya lee esa fecha sigue funcionando sin tocarse) y se guarda
 * aparte lo que había dicho Operaciones, para poder explicar después por qué se
 * cancelaron los vuelos que se cancelaron.
 *
 * Spec: docs/superpowers/specs/2026-08-18-cola-de-trabajo-y-revision-del-jefe-design.md
 */
const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const {
  sincronizarEstadoFlota, cancelarVuelosAfectadosPorMantenimiento,
} = require("../../utils/mantenimientoUtils");
const { notificarRoles } = require("../../utils/notificaciones");
const { notificarStaff } = require("../../utils/webpush");

const txt = (v) => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim());

/** Vuelos vivos de esa aeronave dentro de una ventana de fechas. */
const SQL_VUELOS_EN_VENTANA = `
  SELECT v.id_vuelo, v.fecha_vuelo, v.id_bloque, bh.hora_inicio,
         TRIM(COALESCE(ua.nombre,'') || ' ' || COALESCE(ua.apellido,'')) AS alumno,
         TRIM(COALESCE(ui.nombre,'') || ' ' || COALESCE(ui.apellido,'')) AS instructor
    FROM vuelo v
    JOIN bloque_horario bh ON bh.id_bloque = v.id_bloque
    LEFT JOIN alumno al     ON al.id_alumno = v.id_alumno
    LEFT JOIN usuario ua    ON ua.id_usuario = al.id_usuario
    LEFT JOIN instructor ins ON ins.id_instructor = v.id_instructor
    LEFT JOIN usuario ui    ON ui.id_usuario = ins.id_usuario
   WHERE v.id_aeronave = $1
     AND v.estado NOT IN ('CANCELADO','COMPLETADO')
     AND v.fecha_vuelo BETWEEN $2::date AND $3::date`;

async function leerMantenimiento(conn, id) {
  const r = await conn.query(
    `SELECT m.*, a.codigo AS aeronave_codigo
       FROM mantenimiento_aeronave m
       JOIN aeronave a ON a.id_aeronave = m.id_aeronave
      WHERE m.id_mantenimiento = $1`, [id]
  );
  return r.rows[0] || null;
}

/**
 * Dry-run: qué vuelos se cancelarían y cuáles se recuperarían con la fecha nueva.
 *
 * Obligatorio antes de confirmar. Mover una fecha puede cancelarle el vuelo a
 * diez alumnos; eso no se hace a ciegas.
 */
exports.previewEstimado = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { fecha_fin } = req.query;
  if (!fecha_fin) return res.status(400).json({ message: "Falta la fecha estimada de finalización" });

  const m = await leerMantenimiento(db, id);
  if (!m) return res.status(404).json({ message: "Mantenimiento no encontrado" });

  const inicio = (m.fecha_inicio || m.fecha_programada || new Date()).toISOString
    ? new Date(m.fecha_inicio || m.fecha_programada).toISOString().slice(0, 10)
    : String(m.fecha_inicio).slice(0, 10);
  const finActual = m.fecha_fin ? new Date(m.fecha_fin).toISOString().slice(0, 10) : null;

  // Lo que se agrega: los días entre el fin actual y el nuevo (si se extiende).
  let seCancelan = { rows: [] };
  if (!finActual || fecha_fin > finActual) {
    const desde = finActual
      ? new Date(new Date(finActual).getTime() + 86400000).toISOString().slice(0, 10)
      : inicio;
    seCancelan = await db.query(SQL_VUELOS_EN_VENTANA, [m.id_aeronave, desde, fecha_fin]);
  }

  // Lo que se recupera: lo que este mecanismo canceló y con la fecha nueva ya
  // queda afuera. Se lee del propio marcador que dejó la cancelación.
  const seRestauran = await db.query(
    `SELECT v.id_vuelo, v.fecha_vuelo, bh.hora_inicio,
            TRIM(COALESCE(ua.nombre,'') || ' ' || COALESCE(ua.apellido,'')) AS alumno
       FROM vuelo v
       JOIN bloque_horario bh ON bh.id_bloque = v.id_bloque
       LEFT JOIN alumno al  ON al.id_alumno = v.id_alumno
       LEFT JOIN usuario ua ON ua.id_usuario = al.id_usuario
      WHERE v.id_aeronave = $1 AND v.estado = 'CANCELADO'
        AND v.justificacion_cancelacion LIKE '[MANT-AUTO%'
        AND v.fecha_vuelo > $2::date`,
    [m.id_aeronave, fecha_fin]
  );

  res.json({
    aeronave_codigo: m.aeronave_codigo,
    fecha_inicio: inicio,
    fecha_fin_actual: finActual,
    fecha_fin_nueva: fecha_fin,
    se_extiende: !finActual || fecha_fin > finActual,
    se_acorta: !!finActual && fecha_fin < finActual,
    cancelaria: seCancelan.rows,
    restauraria: seRestauran.rows,
  });
});

/**
 * Guarda el estimado del Taller: mueve `fecha_fin`, reacomoda los bloques del
 * último día si dieron una hora, y cancela/restaura los vuelos que correspondan.
 *
 * Cancelar y restaurar salen simétricos gratis: `cancelarVuelosAfectadosPorMantenimiento`
 * recalcula sobre TODA la ventana — cancela lo que quedó adentro y devuelve a su
 * estado previo lo que quedó afuera.
 */
exports.guardarEstimado = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { fecha_fin, hora_listo, motivo } = req.body;
  if (!fecha_fin) return res.status(400).json({ message: "Elegí hasta cuándo estimás tenerlo" });
  if (!txt(motivo)) {
    return res.status(400).json({ message: "Escribí por qué cambia la fecha: es lo que le van a preguntar a Operaciones" });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const mRes = await client.query(
      "SELECT * FROM mantenimiento_aeronave WHERE id_mantenimiento = $1 FOR UPDATE", [id]
    );
    if (!mRes.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Mantenimiento no encontrado" }); }
    const m = mRes.rows[0];
    if (m.completado) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Este mantenimiento ya está completado." });
    }

    const inicioSql = "COALESCE(fecha_inicio::date, fecha_programada, CURRENT_DATE)";
    // La fecha nueva no puede quedar antes del arranque del mantenimiento.
    const chk = await client.query(
      `SELECT ${inicioSql} AS inicio FROM mantenimiento_aeronave WHERE id_mantenimiento = $1`, [id]
    );
    const inicio = new Date(chk.rows[0].inicio).toISOString().slice(0, 10);
    if (fecha_fin < inicio) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: `El avión entró al taller el ${inicio}; la fecha estimada no puede ser anterior.` });
    }

    // Guarda lo que había dicho Operaciones, solo la PRIMERA vez que se mueve.
    await client.query(
      `UPDATE mantenimiento_aeronave SET
         fecha_fin_original = COALESCE(fecha_fin_original, fecha_fin),
         fecha_fin          = $2::date,
         estimado_por       = $3,
         estimado_en        = NOW(),
         motivo_estimado    = $4
       WHERE id_mantenimiento = $1`,
      [id, fecha_fin, req.user?.id_usuario || null, txt(motivo)]
    );

    // Bloques que quedaron fuera de la ventana nueva: si no se borran, siguen
    // cancelando vuelos de días en los que el avión ya va a estar disponible.
    await client.query(
      "DELETE FROM mantenimiento_bloque WHERE id_mantenimiento = $1 AND fecha > $2::date", [id, fecha_fin]
    );

    // La hora se traduce a bloques: si el avión queda listo a las 14:00, se
    // cierran los bloques de ese día ANTERIORES a esa hora y la tarde queda
    // libre. Sin hora, el día entero queda cerrado (que es lo que pasa cuando
    // una fecha no tiene ningún bloque registrado).
    if (txt(hora_listo)) {
      await client.query("DELETE FROM mantenimiento_bloque WHERE id_mantenimiento = $1 AND fecha = $2::date", [id, fecha_fin]);
      await client.query(
        `INSERT INTO mantenimiento_bloque (id_mantenimiento, fecha, id_bloque)
         SELECT $1, $2::date, bh.id_bloque FROM bloque_horario bh WHERE bh.hora_inicio < $3::time`,
        [id, fecha_fin, hora_listo]
      );
    }

    await sincronizarEstadoFlota(client, m.id_aeronave);

    const av = await client.query("SELECT codigo FROM aeronave WHERE id_aeronave = $1", [m.id_aeronave]);
    const codigo = av.rows[0]?.codigo || "";
    const { idsCancelados, idsRestaurados } = await cancelarVuelosAfectadosPorMantenimiento(client, {
      id_mantenimiento: Number(id),
      motivo: `${codigo} en mantenimiento — el Taller estimó hasta el ${fecha_fin}`,
      actorUid: req.user?.id_usuario,
      io: req.app.get("io"),
    });

    // Operaciones tiene que enterarse: es su programación la que se movió.
    await notificarRoles(client, ["TURNO", "ADMIN", "PROGRAMACION"], {
      tipo: idsCancelados.length ? "ALERTA" : "INFO",
      mensaje: `${codigo}: el Taller estima tenerlo listo el ${fecha_fin}${hora_listo ? ` a las ${hora_listo}` : ""}. ${txt(motivo)}`
        + (idsCancelados.length ? ` Se cancelaron ${idsCancelados.length} vuelo(s).` : "")
        + (idsRestaurados.length ? ` Se recuperaron ${idsRestaurados.length} vuelo(s).` : ""),
      enlace: "/admin/mantenimiento",
    });

    await client.query("COMMIT");

    notificarStaff(
      {
        title: `${codigo} — nueva fecha del Taller`,
        body: `Listo estimado: ${fecha_fin}${hora_listo ? " " + hora_listo : ""}.`
          + (idsCancelados.length ? ` ${idsCancelados.length} vuelo(s) cancelado(s).` : ""),
      },
      { excluirUid: req.user?.id_usuario }
    ).catch(() => {});

    res.json({
      ok: true, aeronave_codigo: codigo, fecha_fin, hora_listo: txt(hora_listo),
      cancelados: idsCancelados.length, restaurados: idsRestaurados.length,
    });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});
