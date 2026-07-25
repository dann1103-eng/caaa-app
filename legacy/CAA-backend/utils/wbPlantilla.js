// Mapper puro entre la fila de la tabla `wb_plantilla` (Postgres) y la forma
// "AIRCRAFT" que consume el wizard del loadsheet (CAA-frontend/src/loadsheet/data/aircraft.js).
//
// SIN acceso a DB: ambas funciones son transformaciones de datos en memoria.
// - filaAObjetoAircraft: fila de `SELECT * FROM wb_plantilla` (+ la aeronave dueña) -> objeto AIRCRAFT.
// - objetoAircraftAFila: objeto AIRCRAFT (o el estado de un editor) -> columnas de `wb_plantilla`.

/**
 * Convierte una fila de `wb_plantilla` (tal como la devuelve `pg`, con los NUMERIC
 * como strings) a la forma AIRCRAFT que espera el wizard del loadsheet.
 *
 * @param {object} fila - fila de wb_plantilla (SELECT * FROM wb_plantilla ...).
 * @param {object} aeronave - fila de `aeronave` dueña de la plantilla; se usa SOLO
 *   para tomar `aeronave.codigo` (la matrícula real, clave del catálogo AIRCRAFT).
 * @returns {object} objeto con la forma AIRCRAFT.
 */
function filaAObjetoAircraft(fila, aeronave) {
  const obj = {
    reg: aeronave?.codigo,
    model: fila.model,
    sheet: fila.sheet,
    empty_weight: Number(fila.empty_weight),
    empty_arm: Number(fila.empty_weight_arm),
    empty_moment: Number(fila.empty_weight_moment),
    max_gross: Number(fila.max_takeoff_weight),
    max_landing: Number(fila.max_landing_weight),
    fuel_cap_gal: Number(fila.fuel_capacity_gal),
    fuel_usable_gal: Number(fila.fuel_usable_gal),
    fuel_lb_gal: Number(fila.fuel_lb_gal),
    fuel_burn_note: fila.fuel_burn_note,
    default_power: fila.default_power == null ? undefined : Number(fila.default_power),
    default_flow_gal: fila.default_flow_gal == null ? undefined : Number(fila.default_flow_gal),
    moment_div1000: !!fila.moment_div1000,
    oil: fila.oil ?? null,
    stations: fila.estaciones,
    limits_normal: fila.limits_normal,
  };

  if (fila.max_useful_load !== null && fila.max_useful_load !== undefined) {
    obj.max_useful_load = Number(fila.max_useful_load);
  }

  if (fila.limits_utility !== null && fila.limits_utility !== undefined) {
    obj.limits_utility = fila.limits_utility;
  }

  return obj;
}

/**
 * Convierte un objeto con forma AIRCRAFT (o el estado de un editor/seed) a las
 * columnas que espera un INSERT/UPDATE de `wb_plantilla`.
 *
 * @param {object} obj - objeto con forma AIRCRAFT (o compatible).
 * @returns {object} columnas listas para escribir en wb_plantilla.
 */
function objetoAircraftAFila(obj) {
  const emptyWeight = Number(obj.empty_weight);
  const emptyArm = Number(obj.empty_arm);
  const emptyMoment = Number(
    obj.empty_moment ?? emptyWeight * emptyArm
  );

  return {
    nombre: obj.nombre || obj.sheet || obj.model,
    empty_weight: emptyWeight,
    empty_weight_arm: emptyArm,
    empty_weight_moment: emptyMoment,
    max_takeoff_weight: obj.max_gross,
    max_landing_weight: obj.max_landing,
    max_useful_load: obj.max_useful_load,
    fuel_capacity_gal: obj.fuel_cap_gal,
    fuel_usable_gal: obj.fuel_usable_gal,
    fuel_burn_gal_hr: obj.default_flow_gal,
    fuel_lb_gal: obj.fuel_lb_gal,
    default_power: obj.default_power,
    default_flow_gal: obj.default_flow_gal,
    moment_div1000: obj.moment_div1000,
    fuel_burn_note: obj.fuel_burn_note,
    model: obj.model,
    sheet: obj.sheet,
    oil: obj.oil ?? null,
    estaciones: obj.stations,
    limits_normal: obj.limits_normal,
    limits_utility: obj.limits_utility ?? null,
  };
}

module.exports = { filaAObjetoAircraft, objetoAircraftAFila };
