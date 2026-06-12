// Formateo de fechas seguro contra desfases de zona horaria.
//
// Problema: las columnas DATE llegan del backend como medianoche UTC
// ("2026-06-12T00:00:00.000Z" o "2026-06-12"). `new Date(...)` las corre a la
// zona local (UTC-6) → se muestran un día antes (12/06 → 11/06). Lo mismo pasa
// con claves de mes ("2026-06-01" → "mayo de 2026").
//
// Estos helpers interpretan la parte de calendario (YYYY-MM-DD) tal cual,
// sin conversión de zona. Para timestamps reales con hora significativa,
// seguir usando `new Date(...)` directamente.

/** Date local construida desde la parte YYYY-MM-DD del valor (string o Date). */
export function fechaLocal(valor) {
  if (!valor) return null;
  const s = valor instanceof Date ? valor.toISOString() : String(valor);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) {
    const d = new Date(valor);
    return isNaN(d) ? null : d;
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** "12/06/26" (o el formato de opciones dado) sin desfase de día. */
export function fmtFechaCorta(valor, opciones = { day: "2-digit", month: "2-digit", year: "2-digit" }) {
  const d = fechaLocal(valor);
  return d ? d.toLocaleDateString("es-SV", opciones) : "—";
}

/** "12/6/2026" estilo es-SV por defecto. */
export function fmtFecha(valor) {
  const d = fechaLocal(valor);
  return d ? d.toLocaleDateString("es-SV") : "—";
}

/** "junio de 2026" para claves de mes tipo "2026-06-01". */
export function fmtMes(valor) {
  const d = fechaLocal(valor);
  return d ? d.toLocaleDateString("es-SV", { month: "long", year: "numeric" }) : "—";
}
