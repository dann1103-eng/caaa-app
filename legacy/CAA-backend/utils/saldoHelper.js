const db = require("../config/db");

/**
 * Obtiene el saldo actual de la cuenta corriente de un alumno.
 * Devuelve 0 si no existe registro (cuenta nueva). Devuelve null si la tabla
 * todavía no existe (módulo de Administración no migrado).
 */
async function getSaldoAlumno(id_alumno, client = db) {
  try {
    const r = await client.query(
      `SELECT saldo_actual_usd FROM cuenta_corriente_alumno WHERE id_alumno = $1`,
      [id_alumno]
    );
    if (r.rows.length === 0) return 0;
    return Number(r.rows[0].saldo_actual_usd);
  } catch (e) {
    // Tabla no existe (módulo aún no migrado) → no bloquear
    if (e.code === "42P01") return null;
    throw e;
  }
}

/**
 * Estima el costo de un conjunto de vuelos a agendar, usando la TARIFA EFECTIVA
 * del alumno para cada avión: precio especial asignado (alumno_tarifa_aeronave)
 * → tarifa estándar vigente por id_aeronave → match por texto de modelo (solo
 * queda para tarifas viejas sin vincular).
 * vuelos: Array<{ id_aeronave, duracion_estimada_min }>
 * Devuelve el costo total estimado en USD.
 */
async function estimarCostoVuelos(vuelos, fecha = new Date(), client = db, id_alumno = null) {
  if (!Array.isArray(vuelos) || vuelos.length === 0) return 0;
  let total = 0;
  for (const v of vuelos) {
    const horas = (v.duracion_estimada_min || 60) / 60;
    let tarifa = null;

    // 1) Precio especial asignado al alumno para ese avión.
    if (id_alumno && v.id_aeronave) {
      try {
        const e = await client.query(`
          SELECT at.tarifa_hora_usd
          FROM alumno_tarifa_aeronave ata
          JOIN aeronave_tarifa at ON at.id = ata.id_tarifa
          WHERE ata.id_alumno = $1 AND ata.id_aeronave = $2
          LIMIT 1
        `, [id_alumno, v.id_aeronave]);
        if (e.rows.length > 0) tarifa = Number(e.rows[0].tarifa_hora_usd);
      } catch (_) {}
    }

    // 2) Tarifa estándar vigente vinculada por id_aeronave.
    if (tarifa == null && v.id_aeronave) {
      try {
        const t = await client.query(`
          SELECT tarifa_hora_usd FROM aeronave_tarifa
          WHERE id_aeronave = $1
            AND COALESCE(es_estandar, TRUE) = TRUE
            AND vigente_desde <= $2::date
            AND (vigente_hasta IS NULL OR vigente_hasta >= $2::date)
          ORDER BY vigente_desde DESC LIMIT 1
        `, [v.id_aeronave, fecha]);
        if (t.rows.length > 0) tarifa = Number(t.rows[0].tarifa_hora_usd);
      } catch (_) {}
    }

    // 3) Último recurso: match por texto de modelo (tarifas viejas sin vincular).
    if (tarifa == null) {
      let modelo = "Cessna 152";
      if (v.id_aeronave) {
        try {
          const a = await client.query(`SELECT modelo, tipo FROM aeronave WHERE id_aeronave = $1`, [v.id_aeronave]);
          if (a.rows.length > 0) modelo = a.rows[0].modelo || a.rows[0].tipo || modelo;
        } catch (_) {}
      }
      try {
        const t = await client.query(`
          SELECT tarifa_hora_usd FROM aeronave_tarifa
          WHERE modelo_aeronave ILIKE '%' || $1 || '%'
            AND COALESCE(es_estandar, TRUE) = TRUE
            AND vigente_desde <= $2::date
            AND (vigente_hasta IS NULL OR vigente_hasta >= $2::date)
          ORDER BY vigente_desde DESC LIMIT 1
        `, [modelo, fecha]);
        if (t.rows.length > 0) tarifa = Number(t.rows[0].tarifa_hora_usd);
      } catch (_) {}
    }

    if (tarifa != null) total += horas * tarifa;
  }
  return +total.toFixed(2);
}

/**
 * Verifica si el alumno tiene saldo suficiente para agendar.
 * Devuelve { ok, saldo, costo_estimado, mensaje }.
 */
async function verificarSaldoSuficiente(id_alumno, vuelos, client = db) {
  const saldo = await getSaldoAlumno(id_alumno, client);
  if (saldo === null) {
    // Módulo no instalado: no aplica bloqueo
    return { ok: true, saldo: null, costo_estimado: 0 };
  }
  const costo = await estimarCostoVuelos(vuelos, new Date(), client, id_alumno);
  if (saldo < costo) {
    const faltante = +(costo - saldo).toFixed(2);
    return {
      ok: false,
      saldo,
      costo_estimado: costo,
      mensaje: `Saldo insuficiente. Saldo actual: $${saldo.toFixed(2)}. Costo estimado de los vuelos: $${costo.toFixed(2)}. Te faltan $${faltante.toFixed(2)} para poder agendar.`
    };
  }
  return { ok: true, saldo, costo_estimado: costo };
}

module.exports = { getSaldoAlumno, estimarCostoVuelos, verificarSaldoSuficiente };
