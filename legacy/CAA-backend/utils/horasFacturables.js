// Predicados SQL para separar dos cosas que en este sistema NO son lo mismo:
//
//   · HORAS TÉCNICAS del avión  → el TAC real. Alimentan aeronave.horas_acumuladas
//     y el mantenimiento 50/100h. Cuentan SIEMPRE, incluso en un regreso por
//     emergencia (el motor corrió). Estas NO usan estos predicados.
//
//   · HORAS FACTURABLES → las que mueven plata o progreso: pago al instructor en
//     nómina, bitácora del alumno, avance de curso. Un regreso por emergencia las
//     pone en cero (salió del hangar pero no voló).
//
// Se centralizan acá porque la condición se usa en 6 consultas distintas; copiarla
// seis veces es exactamente cómo el renombre EN_VUELO→EN_PROGRESO dejó lugares sin
// actualizar durante meses (ver CLAUDE.md §20.D).

/**
 * Agregados de horas pagables/facturables: excluye tanto la inasistencia (el
 * alumno no llegó) como el regreso por emergencia (salió y se regresó).
 *
 * El alias es OBLIGATORIAMENTE parametrizable: mantenimientoCubreFechaSQL
 * hardcodeó el suyo ("m") y eso costó un `column m.completado does not exist`
 * cuando una query vecina necesitó otro nombre (CLAUDE.md §22.I).
 *
 * @param {string} alias alias de reporte_vuelo en la consulta (ej. "rv")
 * @returns {string} fragmento para un WHERE / FILTER
 */
function soloHorasFacturables(alias = "rv") {
  return `COALESCE(${alias}.es_inasistencia, false) = false
          AND COALESCE(${alias}.regreso_emergencia, false) = false`;
}

/**
 * Solo excluye el regreso por emergencia, dejando pasar las inasistencias.
 *
 * Se usa en el desglose de nómina (nomina_detalle_vuelo), que HOY sí inserta las
 * inasistencias con 0 horas y $0. Excluirlas de rebote sería un cambio de
 * comportamiento que nadie pidió.
 *
 * @param {string} alias alias de reporte_vuelo en la consulta (ej. "rv")
 * @returns {string} fragmento para un WHERE
 */
function sinRegresoEmergencia(alias = "rv") {
  return `COALESCE(${alias}.regreso_emergencia, false) = false`;
}

module.exports = { soloHorasFacturables, sinRegresoEmergencia };
