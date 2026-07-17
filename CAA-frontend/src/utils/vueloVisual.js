// Helpers visuales compartidos para representar vuelos como en Proyección:
// código de color por aeronave, barra de progreso por estado, badges de
// tipo/categoría y formato de hora. Extraído de PaginaProgramacion.jsx para
// poder reusarse tal cual en otras pantallas (p.ej. el dashboard del dueño).

export const formatHora = (h) => h?.slice(0, 5) ?? "—";

// Hora real de "salida de hangar" (timestamp del botón, no el bloque programado).
export const formatHoraReal = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit", hour12: false }) : null;

export function calcProgreso(v) {
  const { estado } = v;
  if (!estado || estado === "PUBLICADO" || estado === "PROGRAMADO") return null;
  if (estado === "SALIDA_HANGAR") return 5;
  if (estado === "EN_VUELO" || estado === "EN_PROGRESO") return 50;
  if (estado === "REGRESO_HANGAR" || estado === "FINALIZANDO") return 100;
  return null;
}

export const ESTADO_VUELO_META = {
  SALIDA_HANGAR:  { label: "SALIDA HANGAR",  cls: "pp__tbl-badge--hangar"   },
  EN_VUELO:       { label: "EN PROGRESO",        cls: "pp__tbl-badge--envuelo"  },
  EN_PROGRESO:    { label: "EN PROGRESO",        cls: "pp__tbl-badge--envuelo"  },
  REGRESO_HANGAR: { label: "REGRESO HANGAR",  cls: "pp__tbl-badge--regreso"  },
  FINALIZANDO:    { label: "FINALIZANDO",     cls: "pp__tbl-badge--finaliz"  },
  PROGRAMADO:     { label: "STANDBY",         cls: "pp__tbl-badge--programado" },
  PUBLICADO:      { label: "STANDBY",         cls: "pp__tbl-badge--programado" },
};

// Tipo de vuelo (elegido al agendar en Programación) — describe qué se va a
// volar, más allá de a quién/qué avión. Ortogonal a RUTA (tipo_vuelo).
// NORMAL/CHEQUEO muestran la sigla de la licencia (estándar de aviación) en
// vez del nombre de la categoría — más compacto y más útil para el piso.
const LICENCIA_SIGLAS = {
  PRIVADO: "PPL",
  COMERCIAL: "CPL",
  INSTRUMENTOS: "IR",
  BIMOTOR: "ME",
  INSTRUCTOR: "CFI",
};
function siglaLicencia(nombre) {
  if (!nombre) return null;
  return LICENCIA_SIGLAS[nombre.trim().toUpperCase()] || nombre.toUpperCase();
}

const CATEGORIA_CLS = {
  NORMAL: "pp__tipo--normal",
  DEMO: "pp__tipo--demo",
  CHEQUEO: "pp__tipo--chequeo",
  CHEQUEO_LINEA: "pp__tipo--linea",
};
export function categoriaMeta(v) {
  const cat = v?.categoria || "NORMAL";
  const cls = CATEGORIA_CLS[cat] || CATEGORIA_CLS.NORMAL;
  if (cat === "NORMAL") {
    return { label: siglaLicencia(v?.alumno_licencia_nombre) || "Normal", cls };
  }
  if (cat === "CHEQUEO") {
    const sigla = siglaLicencia(v?.licencia_chequeo_nombre);
    return { label: sigla ? `${sigla}/CHECK` : "Chequeo", cls };
  }
  if (cat === "CHEQUEO_LINEA") {
    return { label: v?.tipo_instruccion === "REFRESH" ? "Refresh" : "Chequeo línea", cls };
  }
  return { label: "Demo", cls };
}

/* Código de color por aeronave, réplica del Excel de programación. Se empareja por
   el número de matrícula (334/333/270/127) para que no importe el sufijo P/PE. */
const AERONAVE_COLOR = [
  { num: "334", color: "#f87171" }, // YS-334-PE — rojo
  { num: "333", color: "#60a5fa" }, // YS-333-PE — azul
  { num: "270", color: "#4ade80" }, // YS-270-P  — verde
  { num: "127", color: "#06b6d4" }, // YS-127-P  — cyan fuerte (se distingue del azul del 333)
  { num: "155", color: "#a3e635" }, // YS-155-PE — verde lima fluorescente
  { num: "259", color: "#a3e635" }, // YS-259-P  — verde lima fluorescente
];

export function colorAeronave(codigo) {
  if (!codigo) return undefined;
  const m = AERONAVE_COLOR.find(a => codigo.includes(a.num));
  return m ? m.color : undefined;
}

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Estilo del pill de matrícula en las tablas (Vuelos en Curso / Próximo
// Bloque) — mismo código de color por aeronave que ya usa la lista de
// Schedule, solo que aquí también tiñe fondo/borde del pill.
export function aeroBadgeStyle(codigo) {
  const c = colorAeronave(codigo);
  if (!c) return undefined;
  return { color: c, background: hexToRgba(c, 0.1), borderColor: hexToRgba(c, 0.2) };
}
