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
export const TIPO_INSPECCION = { "25HR": "25 h", "50HR": "50 h", "100HR": "100 h", ANUAL: "anual" };

export function pesoLegible(bytes) {
  const mb = Number(bytes) / 1048576;
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(Number(bytes) / 1024))} KB`;
}

export const mensajeError = (e, porDefecto) => e?.response?.data?.message || e?.message || porDefecto;
