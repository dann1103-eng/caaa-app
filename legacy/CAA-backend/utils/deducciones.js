/**
 * Deducciones de planilla — El Salvador.
 *
 * Lógica portada del sistema de referencia (Gestión ML, El Molino). La tabla de
 * ISR y las constantes ($42.35, $271.09) son oficiales del Ministerio de Hacienda
 * y NO deben modificarse arbitrariamente.
 *
 * Dos modalidades:
 *   - PLANTA (mensual fijo): ISR por tramos + ISSS (3%, tope $30) + AFP (6.25%).
 *   - SERVICIOS profesionales: retención fija del 10% sobre el bruto.
 */

/**
 * Calcula ISR + ISSS + AFP para un sueldo mensual de planta.
 * @param {number|string} sueldoBase
 * @returns {{ isr:number, isss:number, afp:number, totalDeducciones:number }}
 */
function calcularDeduccionesPlanta(sueldoBase) {
  const s = Number(sueldoBase) || 0;

  // ISR — tramos oficiales Ministerio de Hacienda El Salvador
  let isr;
  if (s <= 472.00) {
    isr = 0;
  } else if (s <= 895.24) {
    isr = (s - 472.00) * 0.10;
  } else if (s <= 2038.10) {
    isr = 42.35 + (s - 895.24) * 0.20;
  } else {
    isr = 271.09 + (s - 2038.10) * 0.30;
  }

  const isss = Math.min(s * 0.03, 30);   // ISSS: 3% del salario, tope $30
  const afp  = s * 0.0625;               // AFP: 6.25% del salario

  const r = {
    isr:  +isr.toFixed(2),
    isss: +isss.toFixed(2),
    afp:  +afp.toFixed(2),
  };
  r.totalDeducciones = +(r.isr + r.isss + r.afp).toFixed(2);
  return r;
}

/**
 * Retención del 10% para servicios profesionales.
 * @param {number|string} bruto
 * @returns {number}
 */
function retencionServicios(bruto) {
  return +((Number(bruto) || 0) * 0.10).toFixed(2);
}

module.exports = { calcularDeduccionesPlanta, retencionServicios };
