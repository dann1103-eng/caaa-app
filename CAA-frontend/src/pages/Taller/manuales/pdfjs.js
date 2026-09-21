/**
 * pdf.js, cargado solo cuando se abre un manual: no engorda el bundle principal.
 *
 * Versión fija 4.10.38 y el build LEGACY: el normal usa Promise.withResolvers,
 * que Safari no tiene antes de iOS 17.4, y los mecánicos abren esto en su
 * celular. El legacy trae los polyfills.
 */
let cargando = null;

export function cargarPdfjs() {
  if (!cargando) {
    cargando = Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
    ])
      .then(([pdfjs, worker]) => {
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        return pdfjs;
      })
      .catch((e) => {
        cargando = null;
        throw e;
      });
  }
  return cargando;
}

/**
 * Abre un manual pidiendo SOLO los bytes que hacen falta.
 *
 * Supabase sí contesta peticiones por rango (206), pero no deja que el navegador
 * lea la cabecera Accept-Ranges (no la expone por CORS). pdf.js la mira para
 * decidir si pide por partes; sin ella bajaría los 72 MB enteros. Por eso los
 * rangos los pide este código, con PDFDataRangeTransport y el tamaño del archivo
 * que ya está en la base. (Medido el 2026-09-21.)
 *
 * `obtenerUrl` se vuelve a llamar una vez si la URL firmada venció (dura 1 h).
 * Devuelve la tarea de pdf.js: `.promise` da el documento, `.destroy()` lo cierra.
 */
export async function abrirPorRangos({ obtenerUrl, largo, onError }) {
  const pdfjs = await cargarPdfjs();
  let url = await obtenerUrl();
  const transporte = new pdfjs.PDFDataRangeTransport(largo, null);

  const pedir = async (desde, hasta, reintento = false) => {
    const r = await fetch(url, { headers: { Range: `bytes=${desde}-${hasta - 1}` } });
    if ((r.status === 400 || r.status === 403) && !reintento) {
      url = await obtenerUrl();
      return pedir(desde, hasta, true);
    }
    if (r.status !== 206 && r.status !== 200) throw new Error(`HTTP ${r.status}`);
    const datos = new Uint8Array(await r.arrayBuffer());
    // Si el servidor ignoró el rango (200), se recorta: pdf.js espera [desde, hasta).
    return r.status === 200 ? datos.subarray(desde, hasta) : datos;
  };

  transporte.requestDataRange = (desde, hasta) => {
    pedir(desde, hasta)
      .then((datos) => transporte.onDataRange(desde, datos))
      .catch((e) => onError?.(e));
  };

  return pdfjs.getDocument({
    range: transporte,
    length: largo,
    rangeChunkSize: 262144,
    disableAutoFetch: true,
    disableStream: true,
  });
}
