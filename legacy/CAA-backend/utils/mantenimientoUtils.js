const db = require("../config/db");

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

module.exports = { sincronizarEstadoFlota, mantenimientoCubreFechaSQL };
