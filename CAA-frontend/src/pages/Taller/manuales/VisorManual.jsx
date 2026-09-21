import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { abrirPorRangos } from "./pdfjs";
import { getManualUrl, pdfDeManual, abrirPdfCuandoEste } from "../../../services/manualesApi";
import { mensajeError } from "./formatoManual";
import "../inventario/inventario.css";
import "./manuales.css";

// Tope de píxeles del lienzo. Safari (iPhone/iPad) deja el canvas EN BLANCO,
// sin error, si pasa de ~16.7 millones de píxeles; un celular acostado con
// zoom 300% y pantalla densa lo pasa. Arriba de esto se baja la nitidez, no el
// tamaño en pantalla.
const MAX_PIXELES_LIENZO = 16_000_000;

/**
 * Visor de manuales. Uno solo para la biblioteca, el configurador de paquetes y
 * la orden de trabajo: solo cambia lo que hace el botón de abajo (spec §9.2).
 *
 * Se trabaja SIEMPRE con la página del PDF (la del contador), no con la
 * numeración impresa del manual (2-15, fichas 1A11): el título del rango dice qué es.
 *
 * @param accion  { etiqueta, icono, pideTitulo, ejecutar({pagina_desde, pagina_hasta, titulo}) }
 *                Sin `accion`, el botón imprime las páginas marcadas.
 */
export default function VisorManual({ manual, paginaInicial = 1, accion }) {
  const total = manual.paginas;
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState(null);
  const [intento, setIntento] = useState(0);
  const [pagina, setPagina] = useState(paginaInicial);
  const [irA, setIrA] = useState(String(paginaInicial));
  const [zoom, setZoom] = useState(1);
  const [indice, setIndice] = useState([]);
  const [verIndice, setVerIndice] = useState(() => window.innerWidth > 900);
  const [ultimaEntrada, setUltimaEntrada] = useState("");
  const [desde, setDesde] = useState(null);
  const [hasta, setHasta] = useState(null);
  const [titulo, setTitulo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [busqueda, setBusqueda] = useState({ texto: "", activa: false, progreso: 0, sinResultado: false });
  const [ancho, setAncho] = useState(0);
  const lienzo = useRef(null);
  const marco = useRef(null);
  const tareaRender = useRef(null);
  const textos = useRef(new Map());
  const cancelarBusqueda = useRef(false);

  const ir = useCallback((n) => {
    const p = Math.max(1, Math.min(total, Math.round(Number(n)) || 1));
    setPagina(p);
    setIrA(String(p));
  }, [total]);

  useEffect(() => { ir(paginaInicial); }, [paginaInicial, ir]);

  // Abrir el documento (solo pide los bytes que hacen falta).
  useEffect(() => {
    let vivo = true;
    let tarea = null;
    setDoc(null);
    setError(null);
    setIndice([]);
    textos.current = new Map();
    abrirPorRangos({
      obtenerUrl: async () => (await getManualUrl(manual.id_manual)).url,
      largo: Number(manual.tamano_bytes),
      onError: () => vivo && setError("Se cortó la conexión leyendo el manual."),
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
      .then((o) => { if (vivo && o) setIndice(o); })
      .catch(() => vivo && setError("No se pudo abrir el manual."));
    return () => {
      vivo = false;
      cancelarBusqueda.current = true;
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
      if (e.key === "ArrowRight") ir(pagina + 1);
      if (e.key === "ArrowLeft") ir(pagina - 1);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [pagina, ir]);

  const irAEntrada = async (item) => {
    try {
      const dest = typeof item.dest === "string" ? await doc.getDestination(item.dest) : item.dest;
      if (!dest) return;
      const idx = typeof dest[0] === "number" ? dest[0] : await doc.getPageIndex(dest[0]);
      ir(idx + 1);
      setUltimaEntrada(String(item.title || "").trim());
      if (window.innerWidth <= 900) setVerIndice(false);
    } catch {
      toast.error("Esa entrada del índice no apunta a ninguna página");
    }
  };

  const textoDe = async (n) => {
    if (!textos.current.has(n)) {
      const pg = await doc.getPage(n);
      const tc = await pg.getTextContent();
      textos.current.set(n, tc.items.map((i) => i.str).join(" ").toLowerCase());
    }
    return textos.current.get(n);
  };

  const buscarSiguiente = async () => {
    const q = busqueda.texto.trim().toLowerCase();
    // Enter en el campo con una búsqueda en curso arrancaría otra en paralelo.
    if (!q || !doc || busqueda.activa) return;
    cancelarBusqueda.current = false;
    setBusqueda((b) => ({ ...b, activa: true, progreso: 0, sinResultado: false }));
    for (let k = 1; k <= total; k++) {
      if (cancelarBusqueda.current) break;
      const n = ((pagina - 1 + k) % total) + 1;
      const t = await textoDe(n).catch(() => "");
      if (k % 10 === 0) setBusqueda((b) => ({ ...b, progreso: k / total }));
      if (t.includes(q)) {
        ir(n);
        setBusqueda((b) => ({ ...b, activa: false }));
        return;
      }
    }
    setBusqueda((b) => ({ ...b, activa: false, sinResultado: !cancelarBusqueda.current }));
  };

  const marcarDesde = () => {
    setDesde(pagina);
    if (hasta !== null && hasta < pagina) setHasta(pagina);
    if (!titulo && ultimaEntrada) setTitulo(ultimaEntrada);
  };
  const marcarHasta = () => {
    setHasta(pagina);
    if (desde === null || desde > pagina) setDesde(pagina);
  };
  const rango = desde !== null && hasta !== null ? { pagina_desde: desde, pagina_hasta: hasta } : null;

  const efectiva = accion || {
    etiqueta: "Imprimir estas páginas",
    icono: "bi-printer",
    pideTitulo: false,
    ejecutar: (r) => abrirPdfCuandoEste(() => pdfDeManual([{ id_manual: manual.id_manual, ...r }])),
  };

  const ejecutar = async () => {
    if (!rango) return toast.error("Marcá desde qué página y hasta cuál");
    if (efectiva.pideTitulo && !titulo.trim()) {
      return toast.error("Poné qué es ese rango (ej. «Inspección 100 h», «Lubricación»)");
    }
    setEnviando(true);
    try {
      // Sin await antes de esto: si la acción abre una pestaña, tiene que ser dentro del clic.
      await efectiva.ejecutar({ ...rango, titulo: titulo.trim() });
      setDesde(null);
      setHasta(null);
      setTitulo("");
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo"), {
        action: { label: "Reintentar", onClick: () => ejecutar() },
      });
    } finally {
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
            onClick={() => ir(pagina - 1)} disabled={pagina <= 1}>
            <i className="bi bi-chevron-left"></i>
          </button>
          <input className="vm-pag" inputMode="numeric" aria-label="Página" value={irA}
            onChange={(e) => setIrA(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") ir(irA); }}
            onBlur={() => ir(irA)} />
          <span className="vm-de">de {total}</span>
          <button type="button" className="adf-icon-btn" title="Página siguiente"
            onClick={() => ir(pagina + 1)} disabled={pagina >= total}>
            <i className="bi bi-chevron-right"></i>
          </button>
        </div>
        <div className="vm-zoom">
          <button type="button" className="adf-icon-btn" title="Alejar"
            onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}>
            <i className="bi bi-zoom-out"></i>
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" className="adf-icon-btn" title="Acercar"
            onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.25) * 100) / 100))}>
            <i className="bi bi-zoom-in"></i>
          </button>
        </div>
        <form className="vm-buscar" onSubmit={(e) => { e.preventDefault(); buscarSiguiente(); }}>
          <input className="inv-campo" placeholder="Buscar en el manual" value={busqueda.texto}
            onChange={(e) => setBusqueda((b) => ({ ...b, texto: e.target.value, sinResultado: false }))} />
          {busqueda.activa ? (
            <button type="button" className="adf-btn secondary small"
              onClick={() => { cancelarBusqueda.current = true; }}>
              Cancelar {Math.round(busqueda.progreso * 100)}%
            </button>
          ) : (
            <button type="submit" className="adf-btn secondary small"><i className="bi bi-search"></i> Buscar</button>
          )}
        </form>
      </div>

      {busqueda.sinResultado && (
        <p className="vm-aviso">
          No aparece «{busqueda.texto}» en el texto del manual. Si es un escaneo sin texto, usá el índice o el número de página.
        </p>
      )}

      <div className="vm-cuerpo">
        {verIndice && (
          <nav className="vm-indice" aria-label="Índice del manual">
            {indice.length
              ? <ListaIndice items={indice} onElegir={irAEntrada} nivel={0} />
              : <p className="vm-vacio">Este manual no trae índice. Usá la búsqueda o el número de página.</p>}
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
          <canvas ref={lienzo} className="vm-lienzo" style={{ display: doc && !error ? "block" : "none" }} />
        </div>
      </div>

      <div className="vm-rango">
        <div className="vm-rango__marcas">
          <button type="button" className="adf-btn secondary small" onClick={marcarDesde}>
            <i className="bi bi-arrow-bar-right"></i> Desde aquí
          </button>
          <button type="button" className="adf-btn secondary small" onClick={marcarHasta}>
            <i className="bi bi-arrow-bar-left"></i> Hasta aquí
          </button>
          <span className="vm-rango__txt">
            {rango
              ? `Págs. ${desde}–${hasta} (${hasta - desde + 1})`
              : desde !== null ? `Desde la ${desde}…` : "Marcá un rango de páginas"}
          </span>
        </div>
        {efectiva.pideTitulo && (
          <input className="inv-campo vm-rango__titulo" maxLength={200} value={titulo}
            placeholder="Qué es: «5-20-00 Scheduled Maintenance»"
            onChange={(e) => setTitulo(e.target.value)} />
        )}
        <button type="button" className="adf-btn" disabled={!rango || enviando} onClick={ejecutar}>
          <i className={`bi ${efectiva.icono}`}></i> {enviando ? "Un momento…" : efectiva.etiqueta}
        </button>
      </div>
    </div>
  );
}

function ListaIndice({ items, onElegir, nivel }) {
  return (
    <ul className="vm-indice__lista">
      {items.map((it, i) => <EntradaIndice key={`${nivel}-${i}`} item={it} onElegir={onElegir} nivel={nivel} />)}
    </ul>
  );
}

function EntradaIndice({ item, onElegir, nivel }) {
  const [abierta, setAbierta] = useState(false);
  const hijos = item.items?.length > 0;
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
      </div>
      {hijos && abierta && <ListaIndice items={item.items} onElegir={onElegir} nivel={nivel + 1} />}
    </li>
  );
}
