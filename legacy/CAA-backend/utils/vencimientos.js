/**
 * Vencimientos de tareas programadas: inspecciones, ADs, boletines de servicio
 * y vida límite de componentes.
 *
 * Fuente ÚNICA del cálculo. Antes vivía duplicado en seguimientoController y en
 * dashboardController, con la misma fórmula escrita dos veces — y la del
 * dashboard no sabía de `aplica`, así que al cargar los ADs habría contado como
 * alerta los renglones que no aplican al avión. Misma disciplina que
 * utils/horasFacturables.js: fragmento compartido, no copiado.
 */

// ── Umbrales de aviso ─────────────────────────────────────────────────────
// Decisión de Daniel (2026-08-29): 10 horas de vuelo, 7 días y 30 días.
// Los dos primeros ya existían con estos mismos valores.
const UMBRAL_HORAS = 10;
const UMBRAL_DIAS = 30;
// Segundo nivel visual DENTRO de PROXIMO, no un estado aparte.
const UMBRAL_DIAS_URGENTE = 7;

// ── Las dos escalas del TAC ───────────────────────────────────────────────
//
// Se GUARDA en escala del sistema, igual que aeronave.horas_acumuladas y que
// taller_componente.horas_aeronave_instalacion. Se MUESTRA e IMPRIME en escala
// de libro, que es como están escritos los papeles.
//
// El YS-334-PE es el único con tac_offset != 0: su tacómetro dio la vuelta en
// 9999.99 y los mecánicos le suman 10,000 a mano. Confundir las dos escalas son
// 10,000 horas en un dato del que depende la aeronavegabilidad del avión.
//
// Para los otros cuatro aviones la conversión es la identidad, así que un error
// de escala pasa desapercibido en todos menos en uno: por eso la prueba del
// YS-334-PE es obligatoria.
// Se redondea a 2 decimales a propósito: el TAC se lleva con 2 decimales en todo
// el sistema, y sin esto `10043.60 - 10000` da 43.600000000000364, que es lo que
// el importador terminaría ESCRIBIENDO en la base.
const r2 = (n) => Math.round(n * 100) / 100;
const aLibro = (v, offset) => (v == null ? null : r2(Number(v) + Number(offset || 0)));
const aSistema = (v, offset) => (v == null ? null : r2(Number(v) - Number(offset || 0)));

/**
 * Días enteros desde hoy hasta una fecha, comparando fecha contra fecha.
 *
 * `proxima_fecha` es DATE (sin hora) y node-postgres la devuelve como objeto
 * Date — la trampa que ya mordió cuatro veces en este módulo. Restarla contra
 * `new Date()`, que sí tiene hora, hacía que el umbral de 30 días se corriera
 * según la hora del día: a las 13:00 "faltan 31 días" daba 30 y disparaba la
 * alerta un día antes. Acá se normalizan las dos puntas a medianoche UTC para
 * que el resultado sea el mismo a cualquier hora.
 */
function diasHasta(fecha) {
  if (fecha == null) return null;
  let y, m, d;
  if (fecha instanceof Date) {
    y = fecha.getFullYear(); m = fecha.getMonth(); d = fecha.getDate();
  } else {
    const p = String(fecha).slice(0, 10).split("-").map(Number);
    if (p.length !== 3 || p.some(isNaN)) return null;
    [y, m, d] = [p[0], p[1] - 1, p[2]];
  }
  const hoy = new Date();
  return Math.round(
    (Date.UTC(y, m, d) - Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())) / 86400000
  );
}

/**
 * Deriva horas/días restantes y el estado de una tarea contra las horas
 * actuales de su aeronave. Ambos valores en escala del sistema.
 *
 * El estado es el PEOR de las dimensiones aplicables: un ítem con doble base
 * (2,000 horas y 12 años) vence por lo que llegue primero.
 *
 * Estados:
 *   NO_APLICA      el renglón no aplica a este avión (N/A por serie o modelo)
 *   SIN_INTERVALO  recurrente, pero el papel no dice cada cuánto
 *   VENCIDO · PROXIMO · VIGENTE
 *   N_A            sin próxima definida y no es recurrente
 */
function calcularEstado(t) {
  const horasAeronave = parseFloat(t.aeronave_horas) || 0;
  let horas_restantes = null;
  let dias_restantes = null;

  if (t.proxima_horas != null) {
    horas_restantes = Math.round((parseFloat(t.proxima_horas) - horasAeronave) * 100) / 100;
  }
  dias_restantes = diasHasta(t.proxima_fecha);

  // Un renglón que no aplica no vence nunca. Sale primero para que no entre en
  // ningún conteo de alertas, pero conserva los restantes por si se quieren ver.
  if (t.aplica === false) {
    return { horas_restantes, dias_restantes, estado: "NO_APLICA", urgente: false };
  }

  const dims = [];
  if (horas_restantes != null) dims.push({ rest: horas_restantes, prox: horas_restantes <= UMBRAL_HORAS });
  if (dias_restantes != null) dims.push({ rest: dias_restantes, prox: dias_restantes <= UMBRAL_DIAS });

  if (!dims.length) {
    // Recurrente sin ninguna base para calcular: el papel no dice cada cuánto.
    // Son 29 de los 38 ADs recurrentes. Se distingue de N_A para que la pantalla
    // pueda pedirlo explícitamente en vez de mostrarlo como si estuviera al día.
    const sinIntervalo = !!t.recurrente && t.intervalo_horas == null && t.intervalo_dias == null;
    return {
      horas_restantes, dias_restantes,
      estado: sinIntervalo ? "SIN_INTERVALO" : "N_A",
      urgente: false,
    };
  }

  let estado = "VIGENTE";
  if (dims.some((d) => d.rest <= 0)) estado = "VENCIDO";
  else if (dims.some((d) => d.prox)) estado = "PROXIMO";

  const urgente = estado === "PROXIMO"
    && dias_restantes != null && dias_restantes > 0 && dias_restantes <= UMBRAL_DIAS_URGENTE;

  return { horas_restantes, dias_restantes, estado, urgente };
}

// Orden de urgencia para las listas: lo que arde primero, arriba.
const PESO_ESTADO = { VENCIDO: 0, PROXIMO: 1, SIN_INTERVALO: 2, VIGENTE: 3, N_A: 4, NO_APLICA: 5 };

// Los estados que cuentan como alerta para el jefe de taller.
const ES_ALERTA = (estado) => estado === "VENCIDO" || estado === "PROXIMO";

module.exports = {
  UMBRAL_HORAS, UMBRAL_DIAS, UMBRAL_DIAS_URGENTE,
  aLibro, aSistema, diasHasta,
  calcularEstado, PESO_ESTADO, ES_ALERTA,
};
