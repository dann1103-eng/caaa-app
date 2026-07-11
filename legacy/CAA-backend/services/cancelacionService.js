const db = require("../config/db");

const MONTO_MULTA = 35.0;

/**
 * Estado de cancelaciones de un alumno para alimentar alertas y decidir multa.
 *
 * Reglas (definidas con el usuario):
 *  - Máx 1 cancelación por semana (se valida aparte en el controller).
 *  - Mensual: 3 en el mes → alerta; la 4ª del mes → multa.
 *  - Racha: cancelar en semanas consecutivas; 3 seguidas → alerta; la 4ª
 *    semana seguida → multa.
 * El cobro es MANUAL (Administración) — acá solo se marca/expone.
 *
 * Una cancelación "cuenta" si su estado es PENDIENTE o ACEPTADA. La "semana" de
 * una cancelación es la semana_vuelo del vuelo cancelado.
 *
 * @param {number} id_alumno
 * @param {number|null} id_vuelo  vuelo que se está por cancelar (define la semana
 *                                de referencia); si se omite, se usa la semana en
 *                                curso (para el panel del alumno).
 */
async function getEstadoCancelaciones(id_alumno, id_vuelo = null, conn = db) {
  // Conteo mensual (PENDIENTE + ACEPTADA).
  const mesRes = await conn.query(
    `SELECT COUNT(*)::int AS n
       FROM solicitud_cancelacion
      WHERE id_alumno = $1
        AND estado IN ('PENDIENTE','ACEPTADA')
        AND date_trunc('month', creado_en) = date_trunc('month', CURRENT_DATE)`,
    [id_alumno]
  );
  const count_mes = mesRes.rows[0].n;

  // Semanas (fecha_inicio) donde el alumno ya tiene cancelación vigente.
  const semRes = await conn.query(
    `SELECT DISTINCT sw.fecha_inicio
       FROM solicitud_cancelacion sc
       JOIN vuelo v ON v.id_vuelo = sc.id_vuelo
       JOIN semana_vuelo sw ON sw.id_semana = v.id_semana
      WHERE sc.id_alumno = $1 AND sc.estado IN ('PENDIENTE','ACEPTADA')`,
    [id_alumno]
  );
  const semanasSet = new Set(semRes.rows.map(r => new Date(r.fecha_inicio).getTime()));

  // Semana de referencia.
  let refRes;
  if (id_vuelo) {
    refRes = await conn.query(
      `SELECT sw.fecha_inicio FROM vuelo v JOIN semana_vuelo sw ON sw.id_semana = v.id_semana WHERE v.id_vuelo = $1`,
      [id_vuelo]
    );
  } else {
    refRes = await conn.query(
      `SELECT fecha_inicio FROM semana_vuelo WHERE CURRENT_DATE BETWEEN fecha_inicio AND fecha_fin LIMIT 1`
    );
  }
  const refFecha = refRes.rows[0]?.fecha_inicio ? new Date(refRes.rows[0].fecha_inicio).getTime() : null;
  const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

  const ya_cancelo_esta_semana = refFecha != null && semanasSet.has(refFecha);

  // Racha previa: semanas consecutivas inmediatamente ANTES de la de referencia.
  let racha_previa = 0;
  if (refFecha != null) {
    let cursor = refFecha - SEMANA_MS;
    while (semanasSet.has(cursor)) { racha_previa++; cursor -= SEMANA_MS; }
  }

  // ¿La próxima cancelación (en la semana de referencia) genera multa?
  const multaMensual = count_mes >= 3;   // esta sería la 4ª del mes
  const multaRacha = racha_previa >= 3;   // esta sería la 4ª semana seguida
  const proxima_tiene_multa = multaMensual || multaRacha;
  const motivo = multaMensual ? "MENSUAL" : (multaRacha ? "RACHA" : null);

  return {
    count_mes,
    racha_semanas: ya_cancelo_esta_semana ? racha_previa + 1 : racha_previa,
    ya_cancelo_esta_semana,
    proxima_tiene_multa,
    motivo,
    monto: proxima_tiene_multa ? MONTO_MULTA : 0,
  };
}

module.exports = { getEstadoCancelaciones, MONTO_MULTA };
