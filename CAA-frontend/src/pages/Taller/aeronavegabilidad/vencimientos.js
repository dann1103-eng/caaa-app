/**
 * Presentación de vencimientos. El cálculo vive en el backend
 * (legacy/CAA-backend/utils/vencimientos.js); acá solo se pinta.
 */

// ── Las dos escalas del TAC ───────────────────────────────────────────────
// La base guarda en escala del SISTEMA. Los papeles, los libros y el mecánico
// hablan en escala de LIBRO. Todo lo que se MUESTRA pasa por acá.
// Solo el YS-334-PE tiene offset != 0 (su tacómetro dio la vuelta en 9999.99),
// así que un error de escala se ve en un solo avión de cinco.
export const aLibro = (v, offset) =>
  v == null || v === "" ? null : Math.round((Number(v) + Number(offset || 0)) * 100) / 100;

export const horas = (v, offset) => {
  const n = aLibro(v, offset);
  return n == null ? "—" : n.toLocaleString("es-SV", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const fecha = (f) => {
  if (!f) return "—";
  const s = String(f).slice(0, 10).split("-");
  return s.length === 3 ? `${s[2]}/${s[1]}/${s[0]}` : String(f);
};

export const ESTADOS = {
  VENCIDO: { t: "Vencido", clase: "seg-badge--vencido" },
  PROXIMO: { t: "Por vencer", clase: "seg-badge--proximo" },
  VIGENTE: { t: "Vigente", clase: "seg-badge--vigente" },
  SIN_INTERVALO: { t: "Falta cada cuánto", clase: "seg-badge--sinint" },
  NO_APLICA: { t: "No aplica", clase: "seg-badge--noaplica" },
  N_A: { t: "Sin próxima", clase: "seg-badge--na" },
};

export const esAlerta = (e) => e === "VENCIDO" || e === "PROXIMO";

/**
 * Cuánto falta, en la unidad que mande. Un ítem con doble base se evalúa contra
 * las dos y muestra la que llegue primero, que es la que decide.
 */
export function restante(t) {
  const h = t.horas_restantes, d = t.dias_restantes;
  if (h == null && d == null) return "—";
  if (h != null && d == null) return `${h.toFixed(1)} h`;
  if (h == null && d != null) return `${d} d`;
  // Con las dos: manda la más apremiante. No se pueden comparar horas contra
  // días directamente, así que se compara qué tan cerca está cada una de su
  // propio umbral (10 h y 30 d).
  return (h / 10) <= (d / 30) ? `${h.toFixed(1)} h` : `${d} d`;
}

/**
 * Un registro con los DOS intervalos se muestra como DOS renglones, uno por
 * base, repitiendo el resto de las columnas — así la lista calza renglón por
 * renglón con el papel, que es como lo pidió Daniel. Se guarda uno solo para
 * que se cumpla una vez y alerte una vez.
 */
export function renglonesDe(t) {
  const bases = [];
  if (t.intervalo_horas != null) bases.push({ etiqueta: `${Number(t.intervalo_horas).toLocaleString("es-SV")} h`, base: "horas" });
  if (t.intervalo_dias != null) {
    const años = Number(t.intervalo_dias) / 365;
    bases.push({
      etiqueta: Number.isInteger(años) ? `${años} año${años === 1 ? "" : "s"}` : `${t.intervalo_dias} d`,
      base: "dias",
    });
  }
  if (!bases.length) bases.push({ etiqueta: t.recurrente ? "—" : "Una vez", base: null });
  return bases.map((b, i) => ({ ...t, _base: b, _continuacion: i > 0 }));
}

export const LIBROS = [
  { v: "CELULA", t: "Libro de avión" },
  { v: "MOTOR", t: "Libro de motor" },
  { v: "HELICE", t: "Libro de hélice" },
];
