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

const REINTENTO_MS = 800;

// Un error de red (fetch rechaza sin status) o un 5xx vale un segundo intento;
// un 4xx no se arregla solo, y lo abortado es porque se cerró el visor.
const esReintentable = (e) => e?.name !== "AbortError" && (e?.status === undefined || e.status >= 500);

const esperar = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal.addEventListener("abort", () => {
    clearTimeout(t);
    reject(new DOMException("Visor cerrado", "AbortError"));
  }, { once: true });
});

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
 * Un corte de red o un 5xx se reintenta una vez antes de avisar por `onError`.
 * Devuelve la tarea de pdf.js: `.promise` da el documento, `.destroy()` lo
 * cierra y corta las descargas que estén en curso.
 */
export async function abrirPorRangos({ obtenerUrl, largo, onError }) {
  const pdfjs = await cargarPdfjs();
  let url = await obtenerUrl();
  const control = new AbortController();
  const transporte = new pdfjs.PDFDataRangeTransport(largo, null);

  // Si el almacenamiento ignora el Range y contesta 200 con el archivo entero,
  // se guarda esa respuesta y los pedazos siguientes salen de ahí: volver a
  // pedir cada pedazo bajaría el archivo completo una vez por pedazo.
  let completo = null; // Promise<Uint8Array>

  const desdeCompleto = async (desde, hasta) => {
    const p = completo;
    try {
      return (await p).subarray(desde, hasta);
    } catch (e) {
      if (completo === p) completo = null; // falló a medias: el próximo lo vuelve a bajar
      throw e;
    }
  };

  const pedirUnaVez = async (desde, hasta, renovada = false) => {
    if (completo) return desdeCompleto(desde, hasta);
    const r = await fetch(url, {
      headers: { Range: `bytes=${desde}-${hasta - 1}` },
      signal: control.signal,
    });
    if ((r.status === 400 || r.status === 403) && !renovada) {
      url = await obtenerUrl();
      return pedirUnaVez(desde, hasta, true);
    }
    if (r.status === 200) {
      if (completo) r.body?.cancel().catch(() => {}); // otro pedazo ya lo está bajando
      else completo = r.arrayBuffer().then((b) => new Uint8Array(b));
      return desdeCompleto(desde, hasta);
    }
    if (r.status !== 206) {
      const e = new Error(`HTTP ${r.status}`);
      e.status = r.status;
      throw e;
    }
    return new Uint8Array(await r.arrayBuffer());
  };

  const pedir = async (desde, hasta) => {
    try {
      return await pedirUnaVez(desde, hasta);
    } catch (e) {
      if (control.signal.aborted || !esReintentable(e)) throw e;
      await esperar(REINTENTO_MS, control.signal);
      return pedirUnaVez(desde, hasta);
    }
  };

  transporte.requestDataRange = (desde, hasta) => {
    if (control.signal.aborted) return;
    pedir(desde, hasta)
      .then((datos) => { if (!control.signal.aborted) transporte.onDataRange(desde, datos); })
      .catch((e) => { if (!control.signal.aborted) onError?.(e); });
  };
  // pdf.js llama a abort() al destruir el documento.
  transporte.abort = () => control.abort();

  const tarea = pdfjs.getDocument({
    range: transporte,
    length: largo,
    rangeChunkSize: 262144,
    disableAutoFetch: true,
    disableStream: true,
  });
  // pdf.js solo llama a transporte.abort() cuando el worker terminó de cerrar
  // (y nunca si se destruye antes de que arranque): se corta ya, al destruir.
  const destruir = tarea.destroy.bind(tarea);
  tarea.destroy = () => {
    control.abort();
    return destruir();
  };
  return tarea;
}
