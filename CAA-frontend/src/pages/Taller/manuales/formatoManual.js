export const CATEGORIA = {
  MANTENIMIENTO: "Mantenimiento",
  PARTES: "Catálogo de partes",
  OVERHAUL: "Overhaul",
  OPERACION: "Operación (POH)",
  BOLETINES: "Boletines",
  NORMATIVA: "Normativa",
  CATALOGO: "Catálogo comercial",
};

export const TIPOS = ["25HR", "50HR", "100HR", "ANUAL"];
export const TIPO_INSPECCION = { "25HR": "25 h", "50HR": "50 h", "100HR": "100 h", ANUAL: "Anual" };
/** La inspección en medio de una frase: "inspección anual", "inspección 100 h". */
export const tipoEnFrase = (tipo) => (TIPO_INSPECCION[tipo] || tipo || "").toLowerCase();

export function pesoLegible(bytes) {
  const mb = Number(bytes) / 1048576;
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(Number(bytes) / 1024))} KB`;
}

/**
 * El mensaje para el toast. De un error de axios, SOLO el que mandó el backend:
 * el propio de axios está en inglés ("Network Error", "Request failed with
 * status code 500"). De un Error nuestro (ventana bloqueada, subida), su texto.
 */
export const mensajeError = (e, porDefecto) =>
  (e?.isAxiosError ? e.response?.data?.message : e?.message) || porDefecto;
