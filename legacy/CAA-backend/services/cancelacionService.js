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

// ── Cancelaciones de emergencia ──────────────────────────────────────────────
//
// Una solicitud es de EMERGENCIA cuando se pidió con menos de 24 horas para la
// salida programada del vuelo (condición 2 de las que acepta el alumno). No es
// una columna: se deriva de `solicitud_cancelacion.creado_en` y de la salida del
// vuelo, que ya están guardados.
//
// La cuenta vive SOLO acá. Quien necesite saber si algo es emergencia usa estos
// fragmentos; nadie la reescribe por su cuenta (la lección de
// utils/horasFacturables.js: una regla copiada en seis consultas deja de ser
// una regla).
//
// Todo es hora de pared de El Salvador en `timestamp` SIN zona, igual que lo
// guarda la base. "Ahora" se pide con la zona FIJADA y no heredada de la
// sesión: el SET timezone de config/db.js va sin await y el pooler puede
// reiniciarlo, y con la sesión en UTC la resta salía corrida 6 horas.
const ZONA = "America/El_Salvador";
const HORAS_EMERGENCIA = 24;

/**
 * Salida programada del vuelo (`v` = vuelo, `b` = su bloque_horario).
 *
 * En una ruta con parada es la salida del TRAMO 1, no la del tramo consultado:
 * cada tramo es su propia fila de `vuelo` con un bloque más tardío, cualquiera
 * se puede pedir cancelar, y aceptar cancela la ruta entera. Midiendo contra el
 * bloque del tramo pedido, una ruta que sale en dos horas se cancelaba "con
 * margen" y sin constancia con solo pedirlo sobre el tramo 2. Una ruta vive en
 * una sola fecha, así que la salida del tramo 1 es la de la ruta.
 *
 * El CASE evita la subconsulta en los vuelos que no son de ruta (casi todos).
 */
const salidaVueloSQL = (v = "v", b = "b") => `COALESCE(
        CASE WHEN ${v}.grupo_ruta IS NOT NULL THEN (
          SELECT t1.fecha_vuelo + b1.hora_inicio::time
            FROM vuelo t1
            JOIN bloque_horario b1 ON b1.id_bloque = t1.id_bloque
           WHERE t1.grupo_ruta = ${v}.grupo_ruta AND t1.orden_tramo = 1
           LIMIT 1
        ) END,
        ${v}.fecha_vuelo + ${b}.hora_inicio::time)`;

/** "Ahora" en hora de El Salvador. Constante dentro de una transacción. */
const AHORA_SV = `(NOW() AT TIME ZONE '${ZONA}')`;

/** ¿La solicitud `sc` se pidió con menos de 24 h para la salida? */
const esEmergenciaSQL = (sc = "sc", v = "v", b = "b") =>
  `((${salidaVueloSQL(v, b)} - ${sc}.creado_en) < interval '${HORAS_EMERGENCIA} hours')`;

/**
 * Lo mismo para un vuelo que todavía no tiene solicitud: contra "ahora". El
 * INSERT de la solicitud escribe `creado_en = AHORA_SV` en la misma transacción,
 * así que lo que se validó antes de crearla y lo que después se deriva de la
 * fila guardada no pueden discrepar.
 */
const seriaEmergenciaSQL = (v = "v", b = "b") =>
  `((${salidaVueloSQL(v, b)} - ${AHORA_SV}) < interval '${HORAS_EMERGENCIA} hours')`;

/**
 * Una hora local sin zona, como instante real. Es lo que hay que mandarle al
 * cliente: `pg` lee un `timestamp` sin zona en la zona del PROCESO (UTC en
 * Railway) y el navegador le restaba 6 horas — el vuelo de las 13:30 se veía a
 * las 7:30.
 */
const comoInstanteSQL = (expr) => `(${expr} AT TIME ZONE '${ZONA}')`;

/** Un intervalo en horas, número con un decimal. */
const horasSQL = (intervalo) => `ROUND((EXTRACT(EPOCH FROM (${intervalo})) / 3600.0)::numeric, 1)::float`;

/** Las constancias de la solicitud `sc`, como arreglo JSON (vacío si no hay). */
const adjuntosJSONSQL = (sc = "sc") => `COALESCE((
        SELECT json_agg(json_build_object(
                 'id_adjunto', ad.id_adjunto,
                 'nombre_archivo', ad.nombre_archivo,
                 'content_type', ad.content_type,
                 'tamano_bytes', ad.tamano_bytes
               ) ORDER BY ad.id_adjunto)
          FROM solicitud_cancelacion_adjunto ad
         WHERE ad.id_solicitud_cancelacion = ${sc}.id_solicitud_cancelacion
      ), '[]'::json)`;

module.exports = {
  getEstadoCancelaciones, MONTO_MULTA,
  HORAS_EMERGENCIA, AHORA_SV,
  salidaVueloSQL, esEmergenciaSQL, seriaEmergenciaSQL, comoInstanteSQL, horasSQL, adjuntosJSONSQL,
};
