import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { abrirPorRangos } from "./pdfjs";
import { getManualUrl, pdfDeManual, abrirPdfCuandoEste } from "../../../services/manualesApi";
import { mensajeError } from "./formatoManual";
import { parsearPaginas, sumarAlTexto, contiene, resolverRangoDeSeccion } from "./paginasSeleccion";
import "../inventario/inventario.css";
import "./manuales.css";

// Tope de píxeles del lienzo. Safari (iPhone/iPad) deja el canvas EN BLANCO,
// sin error, si pasa de ~16.7 millones de píxeles; un celular acostado con
// zoom 300% y pantalla densa lo pasa. Arriba de esto se baja la nitidez, no el
// tamaño en pantalla.
const MAX_PIXELES_LIENZO = 16_000_000;

// Tramos por selección: el mismo tope que el backend pone a un "agregar" y a
// un PDF de la biblioteca (50 rangos por pedido).
const MAX_TRAMOS = 50;

const BUSQUEDA_QUIETA = { activa: false, progreso: 0, sinResultado: false, encontrada: null };

/** El índice de pdf.js (un árbol) aplanado en orden de documento, con su nivel (1 = capítulo). */
function aplanarIndice(items, nivel = 1, salida = []) {
  for (const item of items || []) {
    salida.push({ item, nivel });
    if (item.items?.length) aplanarIndice(item.items, nivel + 1, salida);
  }
  return salida;
}

/** Página (1-based) a la que apunta una entrada del índice, o null si no apunta a ninguna. */
async function paginaDeEntrada(d, item) {
  try {
    const dest = typeof item.dest === "string" ? await d.getDestination(item.dest) : item.dest;
    if (!Array.isArray(dest) || !dest.length) return null;
    const idx = typeof dest[0] === "number" ? dest[0] : await d.getPageIndex(dest[0]);
    return Number.isInteger(idx) ? idx + 1 : null;
  } catch {
    return null;
  }
}

const etiquetaPaginas = ({ desde, hasta }) => (desde === hasta ? `pág. ${desde}` : `págs. ${desde}–${hasta}`);

/**
 * Visor de manuales. Uno solo para la biblioteca, el configurador de paquetes y
 * la orden de trabajo: solo cambia lo que hace el botón de la barra de
 * selección (spec §9.2 y §9.6).
 *
 * Se trabaja SIEMPRE con la página del PDF (la del contador), no con la
 * numeración impresa del manual (2-15, fichas 1A11): el título dice qué es.
 *
 * La selección es UN texto, como el campo de imprimir («43, 45, 47-50»): es la
 * única fuente. «+ Esta página», «Desde aquí / Hasta aquí» y «+ sección» del
 * índice lo editan con sumarAlTexto; lo que se agrega es lo que dice el texto.
 *
 * @param paginaInicial  página con la que abre (y a la que va si cambia).
 * @param irAPagina      { pagina, marca }: salta a `pagina` cada vez que cambia
 *                       `marca`, aunque la página sea la misma que la última vez
 *                       (el "Ver" de una sección, después de que el usuario hojeó).
 * @param accion  { etiqueta, icono, pideTitulo, ejecutar({ rangos: [{pagina_desde, pagina_hasta}], titulo }) }
 *                Sin `accion`, el botón imprime las páginas elegidas.
 */
export default function VisorManual({ manual, paginaInicial = 1, irAPagina, accion }) {
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState(null);
  const [intento, setIntento] = useState(0);
  // Numérica desde el arranque: puede llegar como texto (el campo de un rango).
  const [pagina, setPagina] = useState(() => Math.max(1, Math.round(Number(paginaInicial)) || 1));
  const [irA, setIrA] = useState(() => String(pagina));
  const [zoom, setZoom] = useState(1);
  const [indice, setIndice] = useState(null); // null: todavía no respondió getOutline
  const [verIndice, setVerIndice] = useState(() => window.innerWidth > 900);
  const [ultimaEntrada, setUltimaEntrada] = useState("");
  const [seleccion, setSeleccion] = useState("");
  const [inicio, setInicio] = useState(null); // la página de «Desde aquí»
  const [titulo, setTitulo] = useState("");
  const [enviando, setEnviando] = useState(false);
  // El candado de la acción va también en un ref: el "Reintentar" del toast
  // llama a ejecutar con el estado de cuando se creó el toast.
  const enviandoRef = useRef(false);
  const [resolviendo, setResolviendo] = useState(null); // la entrada del índice cuya sección se está calculando
  const [busqueda, setBusqueda] = useState({ texto: "", ...BUSQUEDA_QUIETA });
  const [ancho, setAncho] = useState(0);
  const lienzo = useRef(null);
  const marco = useRef(null);
  const tareaRender = useRef(null);
  const textos = useRef(new Map());
  // Página de cada entrada del índice ya resuelta (entrada → Promise<número|null>).
  // Se resuelve recién cuando hace falta: un manual grande trae miles.
  const paginasIndice = useRef(new Map());
  // Generación de la búsqueda: subirla (Cancelar, reabrir, cerrar) deja sin voz
  // a la búsqueda en curso. No alcanza con un flag leído entre página y página:
  // pdf.js NUNCA resuelve un getTextContent pendiente si su worker se destruyó
  // (pasa con un corte de conexión), y el bucle se queda colgado en ese await.
  const idBusqueda = useRef(0);
  // Lo mismo para el «+ sección» del índice.
  const idSeccion = useRef(0);
  const idCampo = useId();

  // Antes de abrir, el tope es el de la base; ya abierto, el del PDF real.
  const total = doc?.numPages || manual.paginas;
  const tope = useRef(total);
  useEffect(() => { tope.current = total; }, [total]);

  const acotar = useCallback((n) => Math.max(1, Math.min(tope.current, n)), []);
  const ir = useCallback((n) => {
    const p = acotar(Math.round(Number(n)) || 1);
    setPagina(p);
    setIrA(String(p));
  }, [acotar]);
  // Relativo a la página ACTUAL (updater), no a la del último render: dos
  // flechas seguidas antes de re-renderizar avanzaban una sola.
  const mover = useCallback((d) => setPagina((p) => acotar(p + d)), [acotar]);

  // El campo de página sigue a la página, venga de donde venga el cambio.
  useEffect(() => { setIrA(String(pagina)); }, [pagina]);
  useEffect(() => { if (doc) setPagina((p) => Math.min(p, doc.numPages)); }, [doc]);

  useEffect(() => { ir(paginaInicial); }, [paginaInicial, ir]);
  const saltoMarca = irAPagina?.marca;
  const saltoPagina = irAPagina?.pagina;
  useEffect(() => {
    if (saltoMarca == null) return;
    ir(saltoPagina);
  }, [saltoMarca, saltoPagina, ir]);

  // Abrir el documento (solo pide los bytes que hacen falta).
  useEffect(() => {
    let vivo = true;
    let tarea = null;
    // Lo que estaba esperando bytes de este documento ya no va a llegar.
    const cortarPendientes = () => {
      idBusqueda.current += 1;
      setBusqueda((b) => ({ ...b, ...BUSQUEDA_QUIETA }));
      idSeccion.current += 1;
      setResolviendo(null);
    };
    cortarPendientes();
    setDoc(null);
    setError(null);
    setIndice(null);
    textos.current = new Map();
    paginasIndice.current = new Map();
    abrirPorRangos({
      obtenerUrl: async () => (await getManualUrl(manual.id_manual)).url,
      largo: Number(manual.tamano_bytes),
      onError: () => {
        if (!vivo) return;
        setError("Se cortó la conexión leyendo el manual.");
        cortarPendientes();
      },
    })
      .then((t) => {
        tarea = t;
        if (!vivo) { t.destroy(); return null; }
        return t.promise;
      })
      .then((d) => {
        if (!vivo || !d) return null;
        setDoc(d);
        // Sin índice no es un error: el manual se lee igual.
        return d.getOutline().catch(() => null);
      })
      .then((o) => { if (vivo) setIndice(o || []); })
      .catch(() => vivo && setError("No se pudo abrir el manual."));
    return () => {
      vivo = false;
      idBusqueda.current += 1;
      idSeccion.current += 1;
      tarea?.destroy();
    };
  }, [manual.id_manual, manual.tamano_bytes, intento]);

  // Ancho disponible para la hoja.
  useEffect(() => {
    if (!marco.current) return undefined;
    const ro = new ResizeObserver(([e]) => setAncho(Math.floor(e.contentRect.width)));
    ro.observe(marco.current);
    return () => ro.disconnect();
  }, []);

  // Dibujar la página actual.
  useEffect(() => {
    if (!doc || !ancho || !lienzo.current) return undefined;
    let cancelado = false;
    (async () => {
      const pg = await doc.getPage(pagina);
      if (cancelado) return;
      tareaRender.current?.cancel();
      const base = pg.getViewport({ scale: 1 });
      const escala = Math.min(Math.max(ancho - 24, 120) / base.width, 3) * zoom;
      const dpr = window.devicePixelRatio || 1;
      const area = base.width * base.height * (escala * dpr) ** 2;
      const nitidez = dpr * (area > MAX_PIXELES_LIENZO ? Math.sqrt(MAX_PIXELES_LIENZO / area) : 1);
      const vp = pg.getViewport({ scale: escala * nitidez });
      const c = lienzo.current;
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      c.style.width = `${Math.floor(base.width * escala)}px`;
      c.style.height = `${Math.floor(base.height * escala)}px`;
      const t = pg.render({ canvasContext: c.getContext("2d"), viewport: vp });
      tareaRender.current = t;
      await t.promise.catch(() => {}); // cancelada: normal al pasar rápido de página
    })().catch(() => {});
    return () => { cancelado = true; };
  }, [doc, pagina, zoom, ancho]);

  // Flechas del teclado para pasar de página (salvo escribiendo en un campo).
  useEffect(() => {
    const tecla = (e) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName) || e.target?.isContentEditable) return;
      // Alt+← es "atrás" en el navegador: no se le roba.
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowRight") mover(1);
      if (e.key === "ArrowLeft") mover(-1);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [mover]);

  // Enter o salir del campo: un número válido va a esa página; vacío o basura
  // vuelve a mostrar la página actual (antes saltaba a la 1).
  const confirmarIrA = () => {
    const v = irA.trim();
    const n = Number(v);
    if (!v || !Number.isFinite(n)) setIrA(String(pagina));
    else ir(n);
  };

  // El índice aplanado: lo que necesita rangoDeSeccion para saber dónde termina una sección.
  const planas = useMemo(() => aplanarIndice(indice), [indice]);
  const posiciones = useMemo(() => new Map(planas.map((p, k) => [p.item, k])), [planas]);

  /** Página de una entrada, resuelta una sola vez por documento. */
  const paginaDeItem = (d, cache, item) => {
    if (!cache.has(item)) cache.set(item, paginaDeEntrada(d, item));
    return cache.get(item);
  };

  const irAEntrada = async (item) => {
    if (!doc) return;
    const p = await paginaDeItem(doc, paginasIndice.current, item);
    if (p == null) {
      toast.error("Esa entrada del índice no apunta a ninguna página");
      return;
    }
    ir(p);
    setUltimaEntrada(String(item.title || "").trim());
    if (window.innerWidth <= 900) setVerIndice(false);
  };

  // «+ sección»: desde la página de la entrada hasta antes de la próxima de su
  // nivel o superior. Se resuelven solo las páginas que hacen falta para saber
  // dónde termina (resolverRangoDeSeccion), no las miles de un índice grande.
  const agregarSeccion = async (item) => {
    const i = posiciones.get(item);
    if (i === undefined || !doc || resolviendo) return;
    // Locales: si se reabre el manual a mitad de camino, esto sigue mirando el
    // documento y el caché VIEJOS, y su resultado no se usa.
    const d = doc;
    const cache = paginasIndice.current;
    const n = d.numPages;
    idSeccion.current += 1;
    const id = idSeccion.current;
    const vigente = () => idSeccion.current === id;
    setResolviendo(item);
    try {
      const r = await resolverRangoDeSeccion(planas, i, n, (k) => {
        if (!vigente()) throw new Error("cortado");
        return paginaDeItem(d, cache, planas[k].item);
      });
      if (!vigente()) return;
      if (!r) {
        toast.error("Esa entrada del índice no apunta a ninguna página");
        return;
      }
      setSeleccion((t) => sumarAlTexto(t, r.desde, r.hasta, n));
      const nombre = String(item.title || "").trim().slice(0, 200);
      if (nombre) setTitulo((t) => (t.trim() ? t : nombre));
      toast.success(`Sección agregada a la selección: ${etiquetaPaginas(r)}`);
    } catch {
      if (vigente()) toast.error("No se pudo leer esa parte del índice");
    } finally {
      if (vigente()) setResolviendo(null);
    }
  };

  const buscarSiguiente = async () => {
    const q = busqueda.texto.trim().toLowerCase();
    // Enter en el campo con una búsqueda en curso arrancaría otra en paralelo.
    if (!q || !doc || busqueda.activa) return;
    idBusqueda.current += 1;
    const id = idBusqueda.current;
    const vigente = () => idBusqueda.current === id;
    // Locales: si se reabre el manual a mitad de camino, esta búsqueda sigue
    // mirando el documento y el caché VIEJOS, nunca los del siguiente.
    const d = doc;
    const cache = textos.current;
    const n = d.numPages;
    setBusqueda((b) => ({ ...b, ...BUSQUEDA_QUIETA, activa: true }));
    for (let k = 1; k <= n; k++) {
      const num = ((pagina - 1 + k) % n) + 1;
      let t = cache.get(num);
      if (t === undefined) {
        try {
          const pg = await d.getPage(num);
          if (!vigente()) return;
          const tc = await pg.getTextContent();
          if (!vigente()) return;
          t = tc.items.map((i) => i.str).join(" ").toLowerCase();
          cache.set(num, t);
        } catch {
          if (!vigente()) return;
          t = "";
        }
      }
      if (k % 10 === 0) setBusqueda((b) => ({ ...b, progreso: k / n }));
      if (t.includes(q)) {
        ir(num);
        setBusqueda((b) => ({ ...b, activa: false, encontrada: num }));
        return;
      }
    }
    if (vigente()) setBusqueda((b) => ({ ...b, activa: false, sinResultado: true }));
  };

  const cancelarBusqueda = () => {
    idBusqueda.current += 1;
    setBusqueda((b) => ({ ...b, ...BUSQUEDA_QUIETA }));
  };

  const anuncioBusqueda = busqueda.activa
    ? `Buscando «${busqueda.texto}», ${Math.floor(busqueda.progreso * 10) * 10}% del manual`
    : busqueda.sinResultado
      ? `No aparece «${busqueda.texto}» en el texto del manual`
      : busqueda.encontrada
        ? `«${busqueda.texto}» aparece en la página ${busqueda.encontrada}`
        : "";

  // ── Selección: el texto manda ────────────────────────────────────────────
  const sel = useMemo(() => parsearPaginas(seleccion, total), [seleccion, total]);
  const errorSel = sel.error
    || (sel.rangos.length > MAX_TRAMOS
      ? `Son ${sel.rangos.length} tramos sueltos: el máximo por vez es ${MAX_TRAMOS}. Agregá en dos veces.`
      : null);
  const enSeleccion = !errorSel && contiene(sel.rangos, pagina);

  // Las páginas que se eligen después de ir a una entrada del índice suelen ser
  // de esa entrada: su nombre es un buen título de arranque.
  const tituloDeLaEntrada = () => {
    if (!titulo.trim() && ultimaEntrada) setTitulo(ultimaEntrada.slice(0, 200));
  };
  const sumarEsta = () => {
    setSeleccion((t) => sumarAlTexto(t, pagina, pagina, total));
    tituloDeLaEntrada();
  };
  const marcarDesde = () => {
    setInicio(pagina);
    tituloDeLaEntrada();
  };
  // Sin «Desde aquí» antes, suma solo esta página.
  const marcarHasta = () => {
    const a = inicio ?? pagina;
    setSeleccion((t) => sumarAlTexto(t, a, pagina, total));
    setInicio(null);
  };

  const efectiva = accion || {
    etiqueta: "Imprimir estas páginas",
    icono: "bi-printer",
    pideTitulo: false,
    ejecutar: ({ rangos }) =>
      abrirPdfCuandoEste(() => pdfDeManual(rangos.map((r) => ({ id_manual: manual.id_manual, ...r })))),
  };

  const ejecutar = async () => {
    if (enviandoRef.current) return;
    if (errorSel) return toast.error(errorSel);
    if (!sel.rangos.length) return toast.error("Escribí o marcá qué páginas (ej. 43, 45, 47-50)");
    if (efectiva.pideTitulo && !titulo.trim()) {
      return toast.error("Poné qué es esa sección (ej. «Inspección 100 h», «Lubricación»)");
    }
    enviandoRef.current = true;
    setEnviando(true);
    const rangos = sel.rangos.map((r) => ({ pagina_desde: r.desde, pagina_hasta: r.hasta }));
    try {
      // Sin await antes de esto: si la acción abre una pestaña, tiene que ser dentro del clic.
      await efectiva.ejecutar({ rangos, titulo: titulo.trim() });
      setSeleccion("");
      setInicio(null);
      setTitulo("");
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo"), {
        action: { label: "Reintentar", onClick: () => ejecutar() },
      });
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  };

  return (
    <div className="vm">
      <div className="vm-barra">
        <button type="button" className="adf-icon-btn" title="Índice del manual"
          aria-pressed={verIndice} onClick={() => setVerIndice((v) => !v)}>
          <i className="bi bi-list-nested"></i>
        </button>
        <div className="vm-nav">
          <button type="button" className="adf-icon-btn" title="Página anterior"
            onClick={() => mover(-1)} disabled={pagina <= 1}>
            <i className="bi bi-chevron-left"></i>
          </button>
          <input className="vm-pag" inputMode="numeric" aria-label="Página" value={irA}
            onChange={(e) => setIrA(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") confirmarIrA(); }}
            onBlur={confirmarIrA} />
          <span className="vm-de">de {total}</span>
          <button type="button" className="adf-icon-btn" title="Página siguiente"
            onClick={() => mover(1)} disabled={pagina >= total}>
            <i className="bi bi-chevron-right"></i>
          </button>
        </div>
        <div className="vm-zoom">
          <button type="button" className="adf-icon-btn" title="Alejar"
            onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}>
            <i className="bi bi-zoom-out"></i>
          </button>
          <span className="vm-zoom__pct">{Math.round(zoom * 100)}%</span>
          <button type="button" className="adf-icon-btn" title="Acercar"
            onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.25) * 100) / 100))}>
            <i className="bi bi-zoom-in"></i>
          </button>
        </div>
        <form className="vm-buscar" onSubmit={(e) => { e.preventDefault(); buscarSiguiente(); }}>
          <input className="inv-campo" placeholder="Buscar en el manual" aria-label="Buscar en el manual"
            value={busqueda.texto}
            onChange={(e) => setBusqueda((b) => ({ ...b, texto: e.target.value, sinResultado: false, encontrada: null }))} />
          {busqueda.activa ? (
            <button type="button" className="adf-btn secondary small" onClick={cancelarBusqueda}>
              Cancelar {Math.round(busqueda.progreso * 100)}%
            </button>
          ) : (
            <button type="submit" className="adf-btn secondary small"><i className="bi bi-search"></i> Buscar</button>
          )}
        </form>
      </div>

      {/* Barra de selección: ARRIBA y siempre a la vista (spec §9.6). Abajo del
          visor quedaba fuera de la pantalla en el editor de paquetes. */}
      <form className="vm-seleccion" aria-label="Páginas elegidas"
        onSubmit={(e) => { e.preventDefault(); ejecutar(); }}>
        <div className="vm-seleccion__fila">
          <label className="vm-rotulo" htmlFor={`${idCampo}-paginas`}>Páginas</label>
          <input id={`${idCampo}-paginas`} className="inv-campo vm-seleccion__paginas" value={seleccion}
            placeholder="43, 45, 47-50" autoComplete="off" spellCheck={false}
            aria-invalid={errorSel ? true : undefined} aria-describedby={`${idCampo}-estado`}
            onChange={(e) => setSeleccion(e.target.value)} />
          {errorSel ? (
            <span id={`${idCampo}-estado`} className="vm-seleccion__estado vm-seleccion__error" role="alert">{errorSel}</span>
          ) : (
            <span id={`${idCampo}-estado`} className="vm-seleccion__estado" aria-live="polite">
              {sel.paginas} {sel.paginas === 1 ? "pág." : "págs."}
            </span>
          )}
          <div className="vm-seleccion__marcas">
            <button type="button" className="adf-btn secondary small" onClick={sumarEsta}>
              <i className="bi bi-plus-lg"></i> Esta página ({pagina})
            </button>
            <button type="button" className="adf-btn secondary small" aria-pressed={inicio !== null} onClick={marcarDesde}>
              <i className="bi bi-arrow-bar-right"></i> Desde aquí
            </button>
            <button type="button" className="adf-btn secondary small" onClick={marcarHasta}>
              <i className="bi bi-arrow-bar-left"></i> Hasta aquí{inicio !== null ? ` (desde ${inicio})` : ""}
            </button>
          </div>
        </div>
        <div className="vm-seleccion__fila">
          {efectiva.pideTitulo && (
            <>
              <label className="vm-rotulo" htmlFor={`${idCampo}-titulo`}>Título</label>
              <input id={`${idCampo}-titulo`} className="inv-campo vm-seleccion__titulo" maxLength={200} value={titulo}
                placeholder="Qué es: «5-20-00 Scheduled Maintenance»"
                onChange={(e) => setTitulo(e.target.value)} />
            </>
          )}
          <button type="submit" className="adf-btn vm-seleccion__accion"
            disabled={!sel.rangos.length || Boolean(errorSel) || enviando}>
            <i className={`bi ${efectiva.icono}`}></i> {enviando ? "Un momento…" : efectiva.etiqueta}
          </button>
        </div>
      </form>

      <p className="visually-hidden" aria-live="polite">{anuncioBusqueda}</p>

      {busqueda.sinResultado && (
        <p className="vm-aviso">
          No aparece «{busqueda.texto}» en el texto del manual. Si es un escaneo sin texto, usá el índice o el número de página.
        </p>
      )}

      <div className="vm-cuerpo">
        {verIndice && (
          <nav className="vm-indice" aria-label="Índice del manual">
            {indice === null ? (
              <p className="vm-vacio">{error ? "No se pudo leer el índice." : "Cargando índice…"}</p>
            ) : indice.length ? (
              <ListaIndice items={indice} onElegir={irAEntrada} onSeccion={agregarSeccion}
                resolviendo={resolviendo} nivel={0} />
            ) : (
              <p className="vm-vacio">Este manual no trae índice. Usá la búsqueda o el número de página.</p>
            )}
          </nav>
        )}
        <div className="vm-hoja" ref={marco}>
          {error && (
            <div className="vm-error">
              {error}
              <button type="button" className="adf-btn secondary small" onClick={() => setIntento((n) => n + 1)}>
                Reintentar
              </button>
            </div>
          )}
          {!error && !doc && <div className="vm-cargando">Abriendo el manual…</div>}
          <canvas ref={lienzo} className="vm-lienzo" role="img"
            aria-label={`Página ${pagina} de ${total}${enSeleccion ? ", en la selección" : ""}`}
            style={{ display: doc && !error ? "block" : "none" }} />
        </div>
        {doc && !error && enSeleccion && (
          <span className="adf-tag green vm-en-seleccion" aria-hidden="true">
            <i className="bi bi-check2"></i> En la selección
          </span>
        )}
      </div>
    </div>
  );
}

function ListaIndice({ items, nivel, ...resto }) {
  return (
    <ul className="vm-indice__lista">
      {items.map((it, i) => <EntradaIndice key={`${nivel}-${i}`} item={it} nivel={nivel} {...resto} />)}
    </ul>
  );
}

function EntradaIndice({ item, onElegir, onSeccion, resolviendo, nivel }) {
  const [abierta, setAbierta] = useState(false);
  const hijos = item.items?.length > 0;
  const nombre = String(item.title || "").trim();
  const calculando = resolviendo === item;
  return (
    <li>
      <div className="vm-indice__fila" style={{ paddingLeft: 6 + nivel * 12 }}>
        {hijos ? (
          <button type="button" className="vm-indice__toggle" aria-label={abierta ? "Cerrar" : "Abrir"}
            aria-expanded={abierta} onClick={() => setAbierta((a) => !a)}>
            <i className={`bi ${abierta ? "bi-chevron-down" : "bi-chevron-right"}`}></i>
          </button>
        ) : <span className="vm-indice__toggle" />}
        <button type="button" className="vm-indice__titulo" title={item.title} onClick={() => onElegir(item)}>
          {item.title}
        </button>
        <button type="button" className="vm-indice__seccion" aria-label={`Agregar la sección ${nombre}`}
          title="Agregar esta sección a la selección" aria-busy={calculando || undefined}
          disabled={Boolean(resolviendo)} onClick={() => onSeccion(item)}>
          {calculando ? <i className="bi bi-hourglass-split"></i> : <i className="bi bi-plus-lg"></i>} sección
        </button>
      </div>
      {hijos && abierta && (
        <ListaIndice items={item.items} onElegir={onElegir} onSeccion={onSeccion} resolviendo={resolviendo} nivel={nivel + 1} />
      )}
    </li>
  );
}
