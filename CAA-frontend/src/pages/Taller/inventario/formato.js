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
  SALIDA: { label: "Salida", tag: "red", icon: "bi-box-arrow-up" },
  AJUSTE: { label: "Ajuste", tag: "", icon: "bi-sliders" },
};

/** Hoy en formato YYYY-MM-DD, para precargar los campos de fecha. */
export const hoy = () => new Date().toISOString().slice(0, 10);
