/**
 * Selección de páginas de un manual (spec 2026-09-20 §9.6): el campo «Páginas»
 * del visor, que se escribe como el de imprimir (`43, 45, 47-50`), y las
 * secciones de la lista (filas consecutivas del mismo manual y el mismo título).
 *
 * Puro, sin React: se prueba con `npm test` (paginasSeleccion.test.js).
 *
 * Todas las páginas son las del PDF (la del contador del visor), 1-based.
 */

// Un número de página razonable: arriba de esto es un dedo apoyado en una tecla.
const MAX_PAGINA = 1_000_000;

const tramo = ({ desde, hasta }) => (desde === hasta ? String(desde) : `${desde}-${hasta}`);

/** Ordena y une lo repetido, lo solapado y lo contiguo (47, 48, 49 → 47-49). */
function unir(rangos) {
  const orden = [...rangos].sort((a, b) => a.desde - b.desde || a.hasta - b.hasta);
  const salida = [];
  for (const r of orden) {
    const ultimo = salida[salida.length - 1];
    if (ultimo && r.desde <= ultimo.hasta + 1) ultimo.hasta = Math.max(ultimo.hasta, r.hasta);
    else salida.push({ desde: r.desde, hasta: r.hasta });
  }
  return salida;
}

const contar = (rangos) => rangos.reduce((s, r) => s + (r.hasta - r.desde + 1), 0);

/**
 * "43, 45, 47-50" → { rangos: [{desde, hasta}], paginas: n, error: null|string }
 * - separadores: coma, punto y coma o espacio; rangos con "-", "–" o "—"
 * - ordena, quita repetidos y une contiguos/solapados (47,48,49 → 47-49)
 * - un rango al revés ("50-47") se da vuelta
 * - error (en castellano) si hay un token inválido, una página < 1, o > total
 * - texto vacío → { rangos: [], paginas: 0, error: null }
 *
 * Con error no devuelve rangos: lo que se agrega es lo que se ve escrito.
 */
export function parsearPaginas(texto, total) {
  const limpio = String(texto ?? "")
    .replace(/[–—]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .trim();
  const vacio = { rangos: [], paginas: 0 };
  if (!limpio) return { ...vacio, error: null };
  const tope = Number.isFinite(Number(total)) && Number(total) > 0 ? Number(total) : Infinity;

  const rangos = [];
  for (const token of limpio.split(/[\s,;]+/).filter(Boolean)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(token);
    if (!m) return { ...vacio, error: `«${token}» no es una página ni un rango (se escribe 43, 45, 47-50)` };
    let desde = Number(m[1]);
    let hasta = m[2] === undefined ? desde : Number(m[2]);
    if (desde > hasta) [desde, hasta] = [hasta, desde];
    if (desde < 1) return { ...vacio, error: "No existe la página 0: el manual empieza en la 1" };
    if (hasta > MAX_PAGINA) return { ...vacio, error: `«${token}» no es un número de página` };
    if (hasta > tope) return { ...vacio, error: `El manual tiene ${tope} páginas: no existe la ${hasta}` };
    rangos.push({ desde, hasta });
  }
  const unidos = unir(rangos);
  return { rangos: unidos, paginas: contar(unidos), error: null };
}

/** [{desde, hasta}] → "43, 45, 47-50" (con guion común: es lo que se edita). */
export function formatearPaginas(rangos) {
  return (rangos || []).map(tramo).join(", ");
}

/** Igual que formatearPaginas pero para mostrar: "43, 45, 47–50" (con raya). */
export function mostrarPaginas(rangos) {
  return (rangos || []).map((r) => tramo(r).replace("-", "–")).join(", ");
}

/**
 * Suma una página o un rango a un texto, devolviendo el texto normalizado.
 * Si el texto actual tiene error, lo deja como está y agrega al final (el
 * usuario lo corrige): no se le borra lo que escribió.
 */
export function sumarAlTexto(texto, desde, hasta = desde, total = Infinity) {
  const d = Math.min(desde, hasta);
  const h = Math.max(desde, hasta);
  const nuevo = tramo({ desde: d, hasta: h });
  const base = String(texto ?? "").trim().replace(/[\s,;]+$/, "");
  const actual = parsearPaginas(base, total);
  if (!actual.error) {
    const junto = parsearPaginas(base ? `${base}, ${nuevo}` : nuevo, total);
    if (!junto.error) return formatearPaginas(junto.rangos);
  }
  return base ? `${base}, ${nuevo}` : nuevo;
}

/** ¿La página p está en los rangos? */
export function contiene(rangos, p) {
  return (rangos || []).some((r) => p >= r.desde && p <= r.hasta);
}

/**
 * Rango de una SECCIÓN del índice.
 * entradas: índice APLANADO en orden de documento, [{ nivel, pagina }] (pagina
 * 1-based o null). i: posición de la entrada elegida. total: páginas del manual.
 * Termina justo antes de la próxima entrada de nivel <= al suyo que tenga página
 * > su página; si no hay, hasta el final del manual. Si la entrada no tiene
 * página → null.
 */
export function rangoDeSeccion(entradas, i, total) {
  const e = entradas?.[i];
  if (!e || e.pagina == null) return null;
  for (let j = i + 1; j < entradas.length; j++) {
    const f = entradas[j];
    if (f.nivel <= e.nivel && f.pagina != null && f.pagina > e.pagina) {
      return { desde: e.pagina, hasta: f.pagina - 1 };
    }
  }
  return { desde: e.pagina, hasta: Math.max(e.pagina, Number(total) || e.pagina) };
}

/**
 * rangoDeSeccion sin tener todas las páginas del índice: las pide de a una con
 * `paginaDe(k)` (Promise<number|null>), solo las de la propia entrada y las de
 * las siguientes de nivel <= al suyo, hasta dar con el borde. Un manual como el
 * AC 43.13 tiene 3.784 entradas: resolverlas todas de golpe tarda y no hace
 * falta. `niveles`: [{ nivel }] aplanado en orden de documento.
 */
export async function resolverRangoDeSeccion(niveles, i, total, paginaDe) {
  const e = niveles?.[i];
  if (!e) return null;
  const propia = await paginaDe(i);
  if (propia == null) return null;
  const conocidas = niveles.map((x) => ({ nivel: x.nivel, pagina: null }));
  conocidas[i].pagina = propia;
  for (let j = i + 1; j < niveles.length; j++) {
    if (niveles[j].nivel > e.nivel) continue;
    const p = await paginaDe(j);
    conocidas[j].pagina = p;
    if (p != null && p > propia) break;
  }
  return rangoDeSeccion(conocidas, i, total);
}

const textoTitulo = (t) => String(t ?? "").trim();

/**
 * Agrupa filas de extractos en SECCIONES: filas CONSECUTIVAS con el mismo
 * id_manual, el mismo título y, si se pide, el mismo `claveExtra` (un nombre de
 * campo, como "origen", o una función fila → valor). Una sección con páginas
 * sueltas se guarda como varias filas con el mismo título (§9.6).
 *
 * → [{ clave, id_manual, titulo, manual_titulo, manual_revision, manual_estado,
 *      manual_paginas, filas, rangos: [{desde, hasta}], paginas }]
 * `clave` sale de la primera fila (su `clave` o su `id_extracto`): única y
 * estable mientras esa fila siga primera.
 */
export function agruparSecciones(filas, claveExtra) {
  const extra = typeof claveExtra === "function"
    ? claveExtra
    : claveExtra ? (f) => f[claveExtra] : () => "";
  const secciones = [];
  let actual = null;
  let firmaActual = null;
  for (const f of filas || []) {
    const firma = `${f.id_manual}|${textoTitulo(f.titulo)}|${extra(f) ?? ""}`;
    if (!actual || firmaActual !== firma) {
      firmaActual = firma;
      actual = {
        clave: `s-${f.clave ?? f.id_extracto}`,
        id_manual: f.id_manual,
        titulo: f.titulo ?? "",
        manual_titulo: f.manual_titulo,
        manual_revision: f.manual_revision,
        manual_estado: f.manual_estado,
        manual_paginas: f.manual_paginas,
        filas: [],
        rangos: [],
        paginas: 0,
      };
      secciones.push(actual);
    }
    const desde = Number(f.pagina_desde);
    const hasta = Number(f.pagina_hasta);
    actual.filas.push(f);
    actual.rangos.push({ desde, hasta });
    actual.paginas += Math.max(0, hasta - desde + 1) || 0;
  }
  return secciones;
}
