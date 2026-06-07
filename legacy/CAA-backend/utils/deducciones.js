/**
 * Deducciones de planilla — El Salvador, dirigidas por configuración fiscal.
 *
 * Las tasas y tramos viven en la tabla `config_fiscal` (editable desde la app),
 * sembrada con la tabla de retención mensual oficial del Ministerio de Hacienda.
 *
 * Modelo (igual que el sistema de referencia):
 *   - PLANTA: ISSS (% con tope) y AFP (% con tope opcional), empleado y patrono;
 *     ISR por tramos aplicado sobre la BASE GRAVABLE = bruto − ISSS_emp − AFP_emp.
 *   - SERVICIOS profesionales: retención única (10% por defecto) sobre el bruto.
 */

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Tramos por defecto (fallback si no hay config en BD).
const TRAMOS_DEFAULT = [
  { from: 0,       to: 472.0,  rate: 0,    fixed: 0,      baseSubtract: 0 },
  { from: 472.01,  to: 895.24, rate: 0.10, fixed: 17.67,  baseSubtract: 472.0 },
  { from: 895.25,  to: 2038.1, rate: 0.20, fixed: 60.0,   baseSubtract: 895.24 },
  { from: 2038.11, to: null,   rate: 0.30, fixed: 288.57, baseSubtract: 2038.1 },
];

const CONFIG_DEFAULT = {
  isss_empleado_rate: 0.03,
  isss_patrono_rate: 0.075,
  isss_tope_usd: 1000,
  afp_empleado_rate: 0.0725,
  afp_patrono_rate: 0.0875,
  afp_tope_usd: null,
  isr_tramos_json: TRAMOS_DEFAULT,
  servicios_isr_rate: 0.10,
};

/** ISR por tramos sobre una base gravable. */
function aplicarTramosISR(base, tramos) {
  const b = Number(base) || 0;
  if (b <= 0) return 0;
  const list = Array.isArray(tramos) && tramos.length ? tramos : TRAMOS_DEFAULT;
  for (const t of list) {
    const upper = t.to == null ? Infinity : Number(t.to);
    if (b >= Number(t.from) && b <= upper) {
      const gravable = Math.max(0, b - Number(t.baseSubtract || 0));
      return round2(gravable * Number(t.rate || 0) + Number(t.fixed || 0));
    }
  }
  const last = list[list.length - 1];
  return round2(Math.max(0, b - Number(last.baseSubtract || 0)) * Number(last.rate || 0) + Number(last.fixed || 0));
}

/**
 * Deducciones de planta (empleado + patrono) para un bruto dado.
 * @returns {{ isr, isss, afp, isss_patrono, afp_patrono }}
 */
function calcularPlanta(bruto, cfg = CONFIG_DEFAULT) {
  const g = round2(Math.max(0, Number(bruto) || 0));
  const isssBase = Math.min(g, Number(cfg.isss_tope_usd ?? 1000));
  const isss = round2(isssBase * Number(cfg.isss_empleado_rate ?? 0.03));
  const isss_patrono = round2(isssBase * Number(cfg.isss_patrono_rate ?? 0.075));

  const afpBase = cfg.afp_tope_usd != null ? Math.min(g, Number(cfg.afp_tope_usd)) : g;
  const afp = round2(afpBase * Number(cfg.afp_empleado_rate ?? 0.0725));
  const afp_patrono = round2(afpBase * Number(cfg.afp_patrono_rate ?? 0.0875));

  const baseISR = round2(g - isss - afp);
  const isr = aplicarTramosISR(baseISR, cfg.isr_tramos_json);

  return { isr, isss, afp, isss_patrono, afp_patrono };
}

/** Retención de servicios profesionales (10% por defecto) sobre el bruto. */
function retencionServicios(bruto, cfg = CONFIG_DEFAULT) {
  const rate = Number(cfg?.servicios_isr_rate ?? 0.10);
  return round2((Number(bruto) || 0) * rate);
}

// Compatibilidad: versión sin config (usa defaults oficiales).
function calcularDeduccionesPlanta(sueldoBase) {
  const d = calcularPlanta(sueldoBase, CONFIG_DEFAULT);
  return { ...d, totalDeducciones: round2(d.isr + d.isss + d.afp) };
}

module.exports = {
  round2,
  aplicarTramosISR,
  calcularPlanta,
  retencionServicios,
  calcularDeduccionesPlanta,
  TRAMOS_DEFAULT,
  CONFIG_DEFAULT,
};
