/** Formateo compartido de las pantallas de inventario. */

export const fmt = (v, dec = 2) => {
  const n = Number(v);
  return isNaN(n) ? "—" : n.toFixed(dec);
};

export const money = (v) => {
  const n = Number(v);
  return isNaN(n) ? "—" : `$${n.toFixed(2)}`;
};

export const fecha = (v) => (v ? String(v).slice(0, 10) : "—");

/** Etiqueta y color del tipo de documento. */
export const META_TIPO = {
  ENTRADA: { label: "Entrada", tag: "green", icon: "bi-box-arrow-in-down" },
  SALIDA: { label: "Solicitud", tag: "red", icon: "bi-box-arrow-up" },
  AJUSTE: { label: "Ajuste", tag: "", icon: "bi-sliders" },
  REQUISICION: { label: "Requisición", tag: "blue", icon: "bi-pencil-square" },
  RETORNO: { label: "Retorno", tag: "green", icon: "bi-arrow-return-left" },
  PRESTAMO: { label: "Préstamo", tag: "blue", icon: "bi-arrow-left-right" },
};

/** Hoy en formato YYYY-MM-DD, para precargar los campos de fecha. */
export const hoy = () => new Date().toISOString().slice(0, 10);

// Cronómetro de un trabajo, en segundos. Compartido por "Mi taller" (el propio)
// y por la vista del jefe (los de todos): un solo formato para el mismo dato.
export const reloj = (seg) => {
  if (seg == null) return "—";
  const s = Math.max(0, Math.floor(seg));
  const d = Math.floor(s / 86400);
  const hh = String(Math.floor((s % 86400) / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return d > 0 ? `${d} d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
};
