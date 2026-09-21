// legacy/CAA-backend/utils/pdfExtractos.js
/**
 * Armado de PDFs con páginas sueltas de los manuales del taller.
 *
 * Puro: recibe los bytes de cada manual y la lista de extractos, y devuelve los
 * bytes del PDF resultante. No sabe nada de la base ni de Storage, así se prueba
 * sin red (tests/pdfExtractos.test.js).
 *
 * Spec: docs/superpowers/specs/2026-09-20-manuales-taller-design.md §6
 */
const crypto = require("crypto");
const { PDFDocument, PDFName } = require("pdf-lib");

/**
 * 🚨 Llaves que se le quitan a cada página ANTES de copiarla.
 *
 * Los manuales traen links internos (/Annots con /Dest a otras páginas) y
 * pdf-lib los sigue al copiar: arrastra la página destino, sus imágenes y de ahí
 * el manual entero. Medido: 20 páginas del service manual del Cherokee pesaban
 * 14.8 MB; sin las anotaciones, 0.84 MB. En un PDF para imprimir los links no
 * sirven de nada.
 */
const LLAVES_QUE_ARRASTRAN = ["Annots", "Thumb", "B", "StructParents", "PieceInfo"];

/** Tope por PDF: protege la memoria del servidor (~350 MB medidos por manual grande). */
const MAX_PAGINAS = 600;

const entero = (v) => {
  if (v === null || v === undefined || v === "") return NaN;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
};

/** Mensaje de error si el rango no sirve para un manual de `paginas` páginas; null si está bien. */
function validarRango(desde, hasta, paginas) {
  const d = entero(desde);
  const h = entero(hasta);
  if (Number.isNaN(d) || Number.isNaN(h)) return "Las páginas tienen que ser números enteros";
  if (d < 1) return "La página inicial tiene que ser 1 o más";
  if (h < d) return `La página final (${h}) no puede ser menor que la inicial (${d})`;
  if (h > paginas) return `El manual tiene ${paginas} páginas: no existe la ${h}`;
  return null;
}

const paginasDe = (extractos) =>
  extractos.reduce((s, e) => s + (Number(e.pagina_hasta) - Number(e.pagina_desde) + 1), 0);

/**
 * Nombre del PDF armado: depende SOLO de lo pedido. Mismo manual (por su
 * sha256), mismas páginas, mismo orden → mismo archivo. Por eso se reutiliza
 * entre personas, entre órdenes y entre producción y el demo.
 */
function claveExtractos(extractos) {
  const firma = extractos.map((e) => [e.sha256, Number(e.pagina_desde), Number(e.pagina_hasta)]);
  return crypto.createHash("sha256").update(JSON.stringify(firma)).digest("hex");
}

/**
 * Huella y páginas de un PDF recién subido. Lo lee el SERVIDOR, no se confía en
 * lo que diga el navegador. Devuelve {sha256, paginas} o {error}.
 */
async function analizarPdf(bytes) {
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  let doc;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  } catch {
    return { error: "El archivo no es un PDF que se pueda leer." };
  }
  if (doc.isEncrypted) {
    return { error: "El PDF está protegido o cifrado. Guardalo de nuevo sin protección y volvé a subirlo." };
  }
  return { sha256, paginas: doc.getPageCount() };
}

/**
 * @param {Array<{sha256:string, pagina_desde:number, pagina_hasta:number}>} extractos en el orden a imprimir
 * @param {Map<string, Uint8Array|Buffer>} fuentes bytes de cada manual, por sha256
 * @returns {Promise<Uint8Array>}
 */
async function armarPdf(extractos, fuentes) {
  if (!extractos.length) throw new Error("No hay páginas para armar");
  const salida = await PDFDocument.create();
  const abiertos = new Map();
  for (const e of extractos) {
    let src = abiertos.get(e.sha256);
    if (!src) {
      const bytes = fuentes.get(e.sha256);
      if (!bytes) throw new Error(`Falta el archivo del manual ${String(e.sha256).slice(0, 12)}`);
      src = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
      if (src.isEncrypted) throw new Error("Un manual está cifrado: hay que volver a subirlo sin protección");
      abiertos.set(e.sha256, src);
    }
    const indices = [];
    for (let p = Number(e.pagina_desde); p <= Number(e.pagina_hasta); p++) indices.push(p - 1);
    for (const i of indices) {
      const nodo = src.getPage(i).node;
      for (const k of LLAVES_QUE_ARRASTRAN) nodo.delete(PDFName.of(k));
    }
    const copias = await salida.copyPages(src, indices);
    copias.forEach((pg) => salida.addPage(pg));
  }
  return salida.save({ useObjectStreams: true });
}

/**
 * Cola de uno en uno para lo que carga un manual entero en memoria (armar un
 * PDF, analizar una subida): dos a la vez de manuales grandes podrían tumbar el
 * proceso en Railway.
 */
let cola = Promise.resolve();
function enCola(fn) {
  const turno = cola.then(() => fn(), () => fn());
  cola = turno.catch(() => {});
  return turno;
}

module.exports = {
  validarRango, claveExtractos, analizarPdf, armarPdf, enCola, paginasDe,
  MAX_PAGINAS, LLAVES_QUE_ARRASTRAN,
};
