// legacy/CAA-backend/utils/manualesReglas.js
/**
 * Reglas puras de los manuales del taller (sin base ni Storage), para poder
 * probarlas solas (tests/manualesReglas.test.js).
 *
 * Spec: docs/superpowers/specs/2026-09-20-manuales-taller-design.md
 */
const { derivarTipoRevision } = require("./aeronaveUtils");

const TIPOS_PAQUETE = ["25HR", "50HR", "100HR", "ANUAL"];
const ETIQUETA_TIPO = { "25HR": "25 h", "50HR": "50 h", "100HR": "100 h", ANUAL: "anual" };
const CATEGORIAS = ["MANTENIMIENTO", "PARTES", "OVERHAUL", "OPERACION", "BOLETINES", "NORMATIVA", "CATALOGO"];
const JEFE = ["TALLER", "ADMIN"];

/**
 * Código de paquete a partir de un código o de un nombre libre; null si no es
 * ninguno de los cuatro. El nombre se traduce con derivarTipoRevision: el mismo
 * mapa que usa el resto del Taller, no una copia.
 */
function aTipoPaquete(texto) {
  if (texto === null || texto === undefined) return null;
  const t = String(texto).trim();
  if (!t) return null;
  if (TIPOS_PAQUETE.includes(t.toUpperCase())) return t.toUpperCase();
  const codigo = derivarTipoRevision(t);
  return TIPOS_PAQUETE.includes(codigo) ? codigo : null;
}

/**
 * Qué inspección es una orden (spec §7): lo primero que traduzca entre el
 * mantenimiento enlazado, la tarea programada del cumplimiento y el reporte.
 */
function resolverInspeccion({ tipo_mantenimiento, nombre_tarea, tipo_inspeccion_reporte } = {}) {
  return aTipoPaquete(tipo_mantenimiento)
    || aTipoPaquete(nombre_tarea)
    || aTipoPaquete(tipo_inspeccion_reporte);
}

/**
 * "Mecánico de la orden": quien la abrió, a quien se la asignaron, o quien la
 * trabaja de segundo (id_aprendiz: al abrir la orden se pone ahí al aprendiz o a
 * otro mecánico). Mismo criterio de "lo mío" que asignadas=true (§36).
 */
function esMecanicoDeOrden(orden, idUsuario) {
  if (!idUsuario) return false;
  return [orden.creado_por, orden.id_mecanico_asignado, orden.id_aprendiz]
    .some((x) => x !== null && x !== undefined && Number(x) === Number(idUsuario));
}

const esJefe = (rol) => JEFE.includes(rol);

module.exports = {
  TIPOS_PAQUETE, ETIQUETA_TIPO, CATEGORIAS,
  aTipoPaquete, resolverInspeccion, esMecanicoDeOrden, esJefe,
};
