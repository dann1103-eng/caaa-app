const db = require("../config/db");
const { notificarUsuario } = require("./notificaciones");

// Un mantenimiento "cubre" una fecha si no está completado ni cancelado y esa
// fecha cae dentro de su ventana [fecha_inicio, fecha_fin]. fecha_fin NULL =
// abierto (down hasta que se complete). Si no hay fecha_inicio se usa
// fecha_programada. Se comparan DATEs (sin hora) para que un mantenimiento de
// "el lunes" cubra todo el lunes.
const CUBRE_FECHA = `
  m.completado = false
  AND COALESCE(m.estado, '') <> 'CANCELADO'
  AND COALESCE(m.fecha_inicio::date, m.fecha_programada) <= $FECHA$
  AND (m.fecha_fin IS NULL OR m.fecha_fin::date >= $FECHA$)
`;

/**
 * Sincroniza aeronave.activa / aeronave.estado con los mantenimientos que
 * cubren HOY. Regla:
 *  - Si un mantenimiento cubre hoy   → activa=false, estado='MANTENIMIENTO'.
 *  - Si NINGUNO cubre hoy            → se reactiva SOLO si estaba en
 *    'MANTENIMIENTO' (no toca aviones dados de baja por otra razón:
 *    activa=false con estado='ACTIVO').
 * Así el estado del avión es DERIVADO de la fecha, no una bandera pegajosa:
 * un mantenimiento futuro no lo saca de servicio hoy, y cuando pasa su ventana
 * el avión vuelve solo.
 *
 * @param {object} conn  cliente de transacción o el pool
 * @param {number} [idAeronave]  si se pasa, solo esa; si no, toda la flota (no-sim)
 */
async function sincronizarEstadoFlota(conn = db, idAeronave = null) {
  const filtro = idAeronave ? `AND a.id_aeronave = $1` : `AND a.tipo <> 'SIMULADOR'`;
  const params = idAeronave ? [idAeronave] : [];
  await conn.query(
    `
    WITH cubiertas AS (
      SELECT DISTINCT m.id_aeronave
      FROM mantenimiento_aeronave m
      WHERE ${CUBRE_FECHA.replace(/\$FECHA\$/g, "CURRENT_DATE")}
    )
    UPDATE aeronave a SET
      activa = CASE
                 WHEN a.id_aeronave IN (SELECT id_aeronave FROM cubiertas) THEN false
                 WHEN a.estado = 'MANTENIMIENTO' THEN true
                 ELSE a.activa
               END,
      estado = CASE
                 WHEN a.id_aeronave IN (SELECT id_aeronave FROM cubiertas) THEN 'MANTENIMIENTO'
                 WHEN a.estado = 'MANTENIMIENTO' THEN 'ACTIVO'
                 ELSE a.estado
               END
    WHERE true ${filtro}
    `,
    params
  );
}

/**
 * Condición SQL (para inyectar en un WHERE) que dice si una aeronave `alias`
 * tiene un mantenimiento cubriendo la fecha del parámetro $N indicado.
 * Uso: `NOT EXISTS (SELECT 1 FROM mantenimiento_aeronave m WHERE m.id_aeronave = a.id_aeronave AND ${mantenimientoCubreFechaSQL('$2')})`
 */
function mantenimientoCubreFechaSQL(fechaParam) {
  return CUBRE_FECHA.replace(/\$FECHA\$/g, fechaParam);
}

// node-postgres parsea columnas/expresiones DATE como objetos JS Date (no
// strings) — String(unaDate) da el formato verboso "Mon Jul 20 2026 ...", no
// "2026-07-20". Usar esto (no String(x).slice(0,10)) en cualquier mensaje que
// muestre una fecha que vino de una columna/expresión DATE de Postgres.
function soloFecha(v) {
  if (!v) return null;
  return (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);
}

/**
 * Cancela los vuelos afectados por un mantenimiento ya registrado (id
 * `id_mantenimiento`): los que caen en alguno de sus `mantenimiento_bloque`
 * (fecha exacta + bloque) o, si tiene `fecha_fin`, cualquier vuelo dentro de
 * toda su ventana [fecha_inicio, fecha_fin] (día completo cerrado). No recibe
 * bloques/fechas por parámetro — los lee de lo que ya está guardado, así
 * sirve tanto para el modelo de Turno (bloques de HOY + ventana futura) como
 * el de Admin (bloques en fechas arbitrarias) sin duplicar la lógica, y
 * también para **reconciliar** un mantenimiento que ya quedó registrado sin
 * haber cancelado nada (el bug que esta función corrige: antes
 * `adminMantenimientoController.iniciarMantenimiento` solo apagaba
 * `aeronave.activa` y nunca tocaba `vuelo` — las horas seguían "programadas"
 * y seguían apareciendo en Proyección aunque el avión ya no pudiera volar).
 *
 * @returns {number[]} ids de los vuelos cancelados
 */
async function cancelarVuelosAfectadosPorMantenimiento(client, { id_mantenimiento, motivo, actorUid = null, io = null }) {
  const cancelRes = await client.query(
    `WITH m AS (
       SELECT id_aeronave, fecha_inicio::date AS fecha_inicio, fecha_fin::date AS fecha_fin
         FROM mantenimiento_aeronave WHERE id_mantenimiento = $1
     )
     UPDATE vuelo v
        SET estado = 'CANCELADO', justificacion_cancelacion = $2,
            tipo_cancelacion = 'NORMAL', fecha_cancelacion = NOW()
       FROM m
      WHERE v.id_aeronave = m.id_aeronave
        AND v.estado IN ('PUBLICADO','SOLICITADO','AJUSTADO','PROGRAMADO')
        AND (
          EXISTS (
            SELECT 1 FROM mantenimiento_bloque mb
             WHERE mb.id_mantenimiento = $1 AND mb.fecha = v.fecha_vuelo
               AND mb.id_bloque BETWEEN v.id_bloque AND COALESCE(v.id_bloque_fin, v.id_bloque)
          )
          OR (m.fecha_fin IS NOT NULL AND v.fecha_vuelo BETWEEN m.fecha_inicio AND m.fecha_fin)
        )
      RETURNING v.id_vuelo`,
    [id_mantenimiento, motivo]
  );
  const idsCancelados = cancelRes.rows.map((r) => r.id_vuelo);
  if (idsCancelados.length === 0) return [];

  const detRes = await client.query(
    `SELECT v.id_vuelo, ua.id_usuario AS alumno_uid, ui.id_usuario AS instructor_uid
       FROM vuelo v
       JOIN alumno al ON al.id_alumno = v.id_alumno
       JOIN usuario ua ON ua.id_usuario = al.id_usuario
       JOIN instructor i ON i.id_instructor = v.id_instructor
       JOIN usuario ui ON ui.id_usuario = i.id_usuario
      WHERE v.id_vuelo = ANY($1)`,
    [idsCancelados]
  );
  for (const t of detRes.rows) {
    await client.query(
      `INSERT INTO vuelo_estado_tiempo (id_vuelo, estado, registrado_por) VALUES ($1, 'CANCELADO', $2)`,
      [t.id_vuelo, actorUid]
    );
    await notificarUsuario(client, t.alumno_uid, { tipo: "VUELO", mensaje: motivo, enlace: "/perfil" });
    await notificarUsuario(client, t.instructor_uid, { tipo: "VUELO", mensaje: motivo, enlace: "/perfil" });
    if (io) io.emit("vuelo_estado_changed", { id_vuelo: t.id_vuelo, estado: "CANCELADO" });
  }
  return idsCancelados;
}

module.exports = { sincronizarEstadoFlota, mantenimientoCubreFechaSQL, soloFecha, cancelarVuelosAfectadosPorMantenimiento };
