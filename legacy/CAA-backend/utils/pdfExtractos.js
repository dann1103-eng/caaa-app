// legacy/CAA-backend/utils/pdfExtractos.js
/**
 * Armado de PDFs con páginas sueltas de los manuales del taller.
 *
 * Puro salvo la cola (enCola, que guarda estado del módulo): recibe la lista de
 * extractos y una función que da los bytes de cada manual, y devuelve los bytes
 * del PDF resultante. No sabe nada de la base ni de Storage, así se prueba sin
 * red (tests/pdfExtractos.test.js).
 *
 * Spec: docs/superpowers/specs/2026-09-20-manuales-taller-design.md §6
 */
const crypto = require("crypto");
const { PDFDocument, PDFName } = require("pdf-lib");

/**
 * Versión de la receta con la que se arma un PDF. Entra en claveExtractos, así
 * que el nombre del PDF guardado cambia con ella. SUBIRLA cada vez que cambie
 * cómo se arma (las llaves que se quitan, la versión de pdf-lib, cómo se
 * guarda): si no, se seguirían sirviendo los PDFs viejos ya guardados.
 */
const RECETA = "v1";

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

/**
 * Tope de páginas por PDF armado. Acota el RESULTADO (lo que se guarda, se baja
 * y se imprime), no la memoria: la memoria la cuida armarPdf, que abre un solo
 * manual por vez (~350 MB medidos por manual grande), y enCola, que arma un PDF
 * por vez.
 */
const MAX_PAGINAS = 600;

/**
 * Tope de manuales distintos por PDF: cada uno se baja entero de Storage para
 * sacarle páginas, así que también acota el tiempo y el tráfico de un armado.
 */
const MAX_MANUALES = 10;

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
 * entre personas, entre órdenes y entre producción y el demo. La RECETA va
 * adentro para que un cambio en cómo se arma no sirva PDFs viejos.
 */
function claveExtractos(extractos) {
  const firma = extractos.map((e) => [e.sha256, Number(e.pagina_desde), Number(e.pagina_hasta)]);
  return crypto.createHash("sha256").update(JSON.stringify([RECETA, firma])).digest("hex");
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
  const paginas = doc.getPageCount();
  if (paginas === 0) return { error: "El PDF no tiene páginas legibles." };
  return { sha256, paginas };
}

/**
 * Arma el PDF abriendo UN manual por vez: un manual grande abierto con pdf-lib
 * ocupa cientos de MB, y tener dos o tres a la vez podía tumbar el proceso.
 *
 * Por eso no recorre los extractos en orden: los agrupa por manual (en el orden
 * en que cada uno aparece por primera vez), copia de cada manual todas las
 * páginas que se le piden, guarda las copias en el lugar de su extracto, y
 * suelta el manual antes de pedir el siguiente. Al final pega las páginas en el
 * orden original, así un pedido A, B, A sale A, B, A.
 *
 * @param {Array<{sha256:string, pagina_desde:number, pagina_hasta:number}>} extractos en el orden a imprimir
 * @param {(sha256:string) => Promise<Uint8Array|Buffer|undefined>} obtenerFuente bytes de un manual;
 *   se llama una sola vez por manual y nunca dos a la vez
 * @returns {Promise<Uint8Array>}
 */
async function armarPdf(extractos, obtenerFuente) {
  if (!extractos.length) throw new Error("No hay páginas para armar");

  // Posiciones de los extractos de cada manual; el Map conserva el orden de
  // primera aparición.
  const porManual = new Map();
  extractos.forEach((e, pos) => {
    if (!porManual.has(e.sha256)) porManual.set(e.sha256, []);
    porManual.get(e.sha256).push(pos);
  });

  const salida = await PDFDocument.create();
  const lugares = new Array(extractos.length); // páginas ya copiadas, por extracto

  for (const [sha256, posiciones] of porManual) {
    // `bytes` y `src` viven solo en esta vuelta: al pasar a la siguiente quedan
    // sin referencias y el recolector puede soltar este manual antes de que se
    // cargue el próximo. Las copias ya pertenecen a `salida`, no a `src`.
    const bytes = await obtenerFuente(sha256);
    if (!bytes) throw new Error(`Falta el archivo del manual ${String(sha256).slice(0, 12)}`);
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    if (src.isEncrypted) throw new Error("Un manual está cifrado: hay que volver a subirlo sin protección");

    const indices = [];
    for (const pos of posiciones) {
      const e = extractos[pos];
      for (let p = Number(e.pagina_desde); p <= Number(e.pagina_hasta); p++) indices.push(p - 1);
    }
    for (const i of new Set(indices)) {
      const nodo = src.getPage(i).node;
      for (const k of LLAVES_QUE_ARRASTRAN) nodo.delete(PDFName.of(k));
    }

    // Una sola copia por manual: los recursos compartidos (fuentes, imágenes)
    // entran una vez aunque el manual aparezca en varios extractos.
    const copias = await salida.copyPages(src, indices);
    let desde = 0;
    for (const pos of posiciones) {
      const e = extractos[pos];
      const n = Number(e.pagina_hasta) - Number(e.pagina_desde) + 1;
      lugares[pos] = copias.slice(desde, desde + n);
      desde += n;
    }
  }

  for (const copias of lugares) copias.forEach((pg) => salida.addPage(pg));
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
  MAX_PAGINAS, MAX_MANUALES, LLAVES_QUE_ARRASTRAN, RECETA,
};
