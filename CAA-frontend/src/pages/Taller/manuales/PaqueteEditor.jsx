import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { getPaquete, guardarPaquete, getManuales, getManual } from "../../../services/manualesApi";
import { TIPO_INSPECCION, tipoEnFrase, mensajeError } from "./formatoManual";
import { agruparSecciones, parsearPaginas, formatearPaginas, mostrarPaginas } from "./paginasSeleccion";
import VisorManual from "./VisorManual";

const aFila = (e) => ({
  clave: `e${e.id_extracto}`,
  id_manual: e.id_manual,
  manual_titulo: e.manual_titulo,
  manual_revision: e.manual_revision,
  manual_estado: e.manual_estado,
  manual_paginas: e.manual_paginas,
  pagina_desde: e.pagina_desde,
  pagina_hasta: e.pagina_hasta,
  titulo: e.titulo || "",
  origen: e.origen,
});

/**
 * Cada fila del editor lleva su `grupo`: la sección a la que pertenece. Las del
 * servidor se agrupan por manual y título (agruparSecciones); de ahí en más la
 * sección se identifica por el grupo, así editar un título no la funde con la
 * vecina que se llama igual mientras se escribe.
 */
const conGrupos = (filas) => agruparSecciones(filas).flatMap((s) => s.filas.map((f) => ({ ...f, grupo: s.clave })));

const etiquetaManual = (m) => `${m.titulo}${m.revision ? ` · ${m.revision}` : ""}`;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

const AVISO_MANUAL = { REEMPLAZADO: "Revisión reemplazada", ARCHIVADO: "Manual archivado" };

/**
 * Editor de un paquete: a la izquierda las secciones agrupadas por manual, a la
 * derecha el visor para elegir páginas nuevas. El estado se elige explícito al
 * guardar (spec §9.4).
 *
 * Una SECCIÓN = filas consecutivas del mismo manual con el mismo título (§9.6):
 * «Lubricación, págs. 170, 172, 174-175» son tres filas. El estado sigue siendo
 * `filas`, plano, que es lo que se guarda; las secciones se derivan.
 *
 * `onSucio(bool)` avisa hacia arriba si hay cambios sin guardar.
 */
export default function PaqueteEditor({ aeronave, tipo, tabla, onVolver, onSucio }) {
  const [paquete, setPaquete] = useState(null);
  const [filas, setFilas] = useState([]);
  const [sucio, setSucio] = useState(false);
  // Guardar reemplaza el set COMPLETO de rangos: con el paquete sin cargar (o
  // con la carga fallida) se guardaría vacío y un CONFIRMADO volvería a
  // borrador. Nada del editor se habilita hasta que la carga termina bien.
  const [cargado, setCargado] = useState(false);
  const [errorCarga, setErrorCarga] = useState(null);
  const [intento, setIntento] = useState(0);
  const [manuales, setManuales] = useState([]);
  const [cargandoManuales, setCargandoManuales] = useState(true);
  const [verTodos, setVerTodos] = useState(false);
  const [visor, setVisor] = useState(null); // { manual, pagina, marca? }
  const [guardando, setGuardando] = useState(false);
  const [copiarDe, setCopiarDe] = useState("");
  // Secciones con el campo de páginas mal escrito (sin aplicar): guardar
  // mandaría las páginas viejas mientras la pantalla muestra un error.
  const [paginasMal, setPaginasMal] = useState(() => new Set());
  const [resaltar, setResaltar] = useState(false);
  const secuencia = useRef(0); // claves de React y grupos de lo todavía sin guardar
  // Una marca nueva por cada "Ver": el visor salta aunque ya estuviera abierto
  // en ese manual y esa página de arranque (el usuario pudo haber hojeado).
  const vistas = useRef(0);
  const elegirRef = useRef(null);
  const selectorRef = useRef(null);
  const timerResaltar = useRef(null);
  const idSelector = useId();

  useEffect(() => {
    let vivo = true;
    setCargado(false);
    setErrorCarga(null);
    getPaquete(aeronave.id_aeronave, tipo)
      .then((r) => {
        if (!vivo) return;
        setPaquete(r.paquete);
        setFilas(conGrupos(r.extractos.map(aFila)));
        setSucio(false);
        setCargado(true);
      })
      .catch((e) => { if (vivo) setErrorCarga(mensajeError(e, "No se pudo abrir el paquete")); });
    return () => { vivo = false; };
  }, [aeronave.id_aeronave, tipo, intento]);

  useEffect(() => {
    onSucio?.(sucio);
    return () => onSucio?.(false);
  }, [sucio, onSucio]);

  useEffect(() => {
    // `vivo`: con "Ver todos" marcado y desmarcado rápido, la respuesta vieja
    // podría llegar después de la nueva y pisarla.
    let vivo = true;
    setCargandoManuales(true);
    getManuales(verTodos ? {} : { aeronave: aeronave.id_aeronave })
      .then((ms) => {
        if (!vivo) return;
        setManuales(ms);
        setVisor((v) => v || (ms.length ? { manual: ms.find((m) => m.categoria === "MANTENIMIENTO") || ms[0], pagina: 1 } : null));
      })
      .catch((e) => { if (vivo) toast.error(mensajeError(e, "No se pudo cargar la lista de manuales")); })
      .finally(() => { if (vivo) setCargandoManuales(false); });
    return () => { vivo = false; };
  }, [verTodos, aeronave.id_aeronave]);

  useEffect(() => () => clearTimeout(timerResaltar.current), []);

  const secciones = useMemo(() => agruparSecciones(filas, "grupo"), [filas]);
  const codigoDe = (id) => tabla?.aeronaves.find((a) => a.id_aeronave === id)?.codigo || `#${id}`;
  const opcionesCopia = useMemo(
    () => (tabla?.celdas || []).filter((c) => c.extractos > 0 && !(c.id_aeronave === aeronave.id_aeronave && c.tipo_mantenimiento === tipo)),
    [tabla, aeronave.id_aeronave, tipo]
  );
  const total = secciones.reduce((s, x) => s + x.paginas, 0);
  // El visor puede estar mostrando un manual que no está en la lista (el
  // "Ver" de una sección que apunta a una revisión reemplazada): sin su
  // opción, el selector mostraría otro título.
  const visorFueraDeLista = visor && !manuales.some((m) => m.id_manual === visor.manual.id_manual);

  const cambiar = (nuevas) => { setFilas(nuevas); setSucio(true); };
  const deSecciones = (lista) => lista.flatMap((s) => s.filas);

  // Mueve la sección entera por encima o por debajo de la vecina.
  const moverSeccion = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= secciones.length) return;
    const n = [...secciones];
    [n[i], n[j]] = [n[j], n[i]];
    cambiar(deSecciones(n));
  };
  const quitarSeccion = (i) => cambiar(deSecciones(secciones.filter((_, x) => x !== i)));
  const tituloSeccion = (i, titulo) => cambiar(secciones.flatMap((s, x) => (
    x === i ? s.filas.map((f) => ({ ...f, titulo, origen: "MANUAL" })) : s.filas
  )));
  /** Filas de una sección para estos rangos. La primera conserva su clave: el campo no pierde el foco. */
  const filasDe = (base, rangos) => rangos.map((r, k) => ({
    ...base,
    clave: k === 0 ? base.clave : `n${++secuencia.current}`,
    pagina_desde: r.desde,
    pagina_hasta: r.hasta,
    origen: "MANUAL",
  }));
  // Reemplaza las filas de la sección i por las de los rangos nuevos, en su lugar.
  const paginasSeccion = (i, rangos) => cambiar(secciones.flatMap((s, x) => (
    x === i ? filasDe(s.filas[0], rangos) : s.filas
  )));

  const marcarPaginasMal = useCallback((clave, mal) => {
    setPaginasMal((prev) => {
      if (prev.has(clave) === mal) return prev;
      const n = new Set(prev);
      if (mal) n.add(clave);
      else n.delete(clave);
      return n;
    });
  }, []);

  const elegirManual = (id) => {
    const m = manuales.find((x) => String(x.id_manual) === String(id));
    if (m) setVisor({ manual: m, pagina: 1 });
  };
  const ver = (idManual, pagina) => {
    const enLista = manuales.find((m) => m.id_manual === idManual);
    if (enLista) {
      setVisor({ manual: enLista, pagina, marca: ++vistas.current });
    } else {
      getManual(idManual).then((m) => setVisor({ manual: m, pagina, marca: ++vistas.current }))
        .catch((e) => toast.error(mensajeError(e, "No se pudo abrir el manual")));
    }
  };

  // «Agregar páginas de otro manual»: lleva al selector del visor, le da el
  // foco y lo resalta un momento para que se vea que ese es el paso.
  const irAlSelector = () => {
    const quieto = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    elegirRef.current?.scrollIntoView({ behavior: quieto ? "auto" : "smooth", block: "start" });
    selectorRef.current?.focus({ preventScroll: true });
    setResaltar(true);
    clearTimeout(timerResaltar.current);
    timerResaltar.current = setTimeout(() => setResaltar(false), 1800);
  };

  // Desde el visor: una fila por rango, todas con el mismo título. Si la última
  // sección es del mismo manual y tiene ese mismo título, es la misma sección:
  // se le suman las páginas.
  const agregar = ({ rangos, titulo }) => {
    const m = visor.manual;
    const nuevos = rangos.map((r) => ({ desde: Number(r.pagina_desde), hasta: Number(r.pagina_hasta) }));
    const ultima = secciones[secciones.length - 1];
    if (ultima && ultima.id_manual === m.id_manual && String(ultima.titulo).trim() === titulo.trim()) {
      const junto = parsearPaginas(formatearPaginas([...ultima.rangos, ...nuevos]), m.paginas);
      const rs = junto.error ? [...ultima.rangos, ...nuevos] : junto.rangos;
      cambiar([...deSecciones(secciones.slice(0, -1)), ...filasDe(ultima.filas[0], rs)]);
    } else {
      const base = {
        id_manual: m.id_manual, manual_titulo: m.titulo, manual_revision: m.revision,
        manual_estado: m.estado, manual_paginas: m.paginas, titulo, grupo: `g${++secuencia.current}`,
      };
      cambiar([...filas, ...filasDe({ ...base, clave: `n${++secuencia.current}` }, nuevos)]);
    }
    toast.success(`Págs. ${mostrarPaginas(nuevos)} agregadas. Falta guardar.`);
  };

  const copiar = async () => {
    if (!copiarDe) return;
    const [idA, tp] = copiarDe.split("|");
    try {
      const r = await getPaquete(idA, tp);
      const otras = agruparSecciones(r.extractos).length;
      if (secciones.length && !window.confirm(
        `¿Reemplazar las ${plural(secciones.length, "sección", "secciones")} actuales por las ${plural(otras, "sección", "secciones")} del otro paquete?`
      )) return;
      cambiar(conGrupos(r.extractos.map((e) => ({ ...aFila(e), clave: `c${e.id_extracto}`, origen: "MANUAL" }))));
      toast.success("Copiado. Revisá las secciones y guardá.");
    } catch (e) { toast.error(mensajeError(e, "No se pudo copiar")); }
  };

  const guardar = async (estado) => {
    if (!cargado) return;
    if (paginasMal.size) {
      return toast.error("Hay una sección con las páginas mal escritas: corregila (o Esc para volver a como estaba) antes de guardar.");
    }
    const sinTitulo = secciones.findIndex((s) => !String(s.titulo).trim());
    if (sinTitulo >= 0) return toast.error(`La sección ${sinTitulo + 1} no tiene título`);
    setGuardando(true);
    try {
      const r = await guardarPaquete(aeronave.id_aeronave, tipo, {
        estado,
        extractos: filas.map((f) => ({
          id_manual: f.id_manual, pagina_desde: Number(f.pagina_desde), pagina_hasta: Number(f.pagina_hasta),
          titulo: f.titulo, origen: f.origen,
        })),
      });
      const { extractos, ...p } = r;
      setPaquete(p);
      setFilas(conGrupos(extractos.map(aFila)));
      setSucio(false);
      toast.success(estado === "CONFIRMADO" ? "Paquete confirmado: el mecánico ya lo ve" : "Guardado como borrador: el mecánico no lo ve");
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo guardar"));
    } finally {
      setGuardando(false);
    }
  };
  const volver = () => {
    if (sucio && !window.confirm("Hay cambios sin guardar. ¿Salir igual?")) return;
    onVolver();
  };

  const estado = paquete?.estado || null;
  const botones = estado === "CONFIRMADO"
    ? [["Pasar a borrador", "BORRADOR", "secondary"], ["Guardar", "CONFIRMADO", ""]]
    : [["Guardar borrador", "BORRADOR", "secondary"], ["Guardar y confirmar", "CONFIRMADO", ""]];

  return (
    <>
      <div className="pe-head">
        <button type="button" className="adf-btn secondary small" onClick={volver}>
          <i className="bi bi-arrow-left"></i> Tabla de paquetes
        </button>
        <h3>{aeronave.codigo} · Inspección {tipoEnFrase(tipo)}</h3>
        {estado && (
          <span className={`adf-tag ${estado === "CONFIRMADO" ? "green" : "amber"}`}>
            {estado === "CONFIRMADO" ? "Confirmado" : "Borrador"}
          </span>
        )}
        {filas.some((f) => f.origen === "SUGERIDO") && <span className="adf-tag blue">Sugerido por el sistema</span>}
        <div className="pe-acciones">
          {sucio && <small className="man-tenue">Cambios sin guardar</small>}
          {botones.map(([l, e, cl]) => (
            <button type="button" key={l} className={`adf-btn ${cl}`}
              disabled={!cargado || guardando || (e === "CONFIRMADO" && !filas.length)} onClick={() => guardar(e)}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {!cargado && (
        errorCarga ? (
          <div className="pe-error" role="alert">
            <span>{errorCarga}</span>
            <button type="button" className="adf-btn secondary small" onClick={() => setIntento((n) => n + 1)}>
              <i className="bi bi-arrow-clockwise"></i> Reintentar
            </button>
          </div>
        ) : <p className="man-vacio">Cargando el paquete…</p>
      )}

      {cargado && (
        <div className="pe-cuerpo">
          <section className="pe-lista">
            <div className="pe-lista__tit">
              Páginas del paquete{" "}
              <small>({plural(secciones.length, "sección", "secciones")} · {plural(total, "pág.", "págs.")})</small>
            </div>
            {!secciones.length && (
              <p className="man-vacio">
                Todavía no tiene páginas. Elegí un manual a la derecha, escribí o marcá las páginas, ponele título y agregalas.
              </p>
            )}
            {secciones.map((s, i) => (
              <Fragment key={s.clave}>
                {(i === 0 || secciones[i - 1].id_manual !== s.id_manual) && (
                  <h4 className="pe-manual">
                    <i className="bi bi-book"></i>
                    <span>{s.manual_titulo}{s.manual_revision ? <small> · {s.manual_revision}</small> : null}</span>
                  </h4>
                )}
                <SeccionPaquete s={s} n={i + 1} esPrimera={i === 0} esUltima={i === secciones.length - 1}
                  onTitulo={(v) => tituloSeccion(i, v)} onPaginas={(rs) => paginasSeccion(i, rs)}
                  onVer={() => ver(s.id_manual, Math.min(...s.rangos.map((r) => r.desde)))}
                  onMover={(d) => moverSeccion(i, d)} onQuitar={() => quitarSeccion(i)}
                  onPaginasMal={marcarPaginasMal} />
              </Fragment>
            ))}
            <button type="button" className="adf-btn secondary pe-otro" onClick={irAlSelector}>
              <i className="bi bi-plus-lg"></i> Agregar páginas de otro manual
            </button>
            {opcionesCopia.length > 0 && (
              <div className="pe-copiar">
                <select className="inv-campo" value={copiarDe} aria-label="Copiar de otro paquete" onChange={(e) => setCopiarDe(e.target.value)}>
                  <option value="">Copiar de otro paquete…</option>
                  {opcionesCopia.map((c) => (
                    <option key={`${c.id_aeronave}|${c.tipo_mantenimiento}`} value={`${c.id_aeronave}|${c.tipo_mantenimiento}`}>
                      {codigoDe(c.id_aeronave)} · {TIPO_INSPECCION[c.tipo_mantenimiento]} ({c.estado === "CONFIRMADO" ? "confirmado" : "borrador"})
                    </option>
                  ))}
                </select>
                <button type="button" className="adf-btn secondary small" disabled={!copiarDe} onClick={copiar}>Copiar</button>
              </div>
            )}
          </section>

          <section className="pe-visor">
            <div ref={elegirRef} className={`pe-visor__elegir${resaltar ? " pe-visor__elegir--resaltado" : ""}`}>
              <label className="vm-rotulo" htmlFor={idSelector}>Manual</label>
              <select id={idSelector} ref={selectorRef} className="inv-campo" value={visor?.manual?.id_manual || ""}
                onChange={(e) => elegirManual(e.target.value)}>
                {!manuales.length && !visor && (
                  <option value="">
                    {cargandoManuales ? "Cargando manuales…" : verTodos ? "No hay manuales en la biblioteca" : "Este avión no tiene manuales asignados"}
                  </option>
                )}
                {visorFueraDeLista && (
                  <option value={visor.manual.id_manual}>
                    {etiquetaManual(visor.manual)}{AVISO_MANUAL[visor.manual.estado] ? ` (${AVISO_MANUAL[visor.manual.estado].toLowerCase()})` : ""}
                  </option>
                )}
                {manuales.map((m) => (
                  <option key={m.id_manual} value={m.id_manual}>{etiquetaManual(m)}</option>
                ))}
              </select>
              <label className="man-check">
                <input type="checkbox" checked={verTodos} onChange={(e) => setVerTodos(e.target.checked)} /> Ver todos los manuales
              </label>
            </div>
            {visor ? (
              <VisorManual key={visor.manual.id_manual} manual={visor.manual} paginaInicial={visor.pagina}
                irAPagina={{ pagina: visor.pagina, marca: visor.marca }}
                accion={{ etiqueta: "Agregar al paquete", icono: "bi-plus-lg", pideTitulo: true, ejecutar: agregar }} />
            ) : <p className="man-vacio">{cargandoManuales ? "Cargando…" : "Elegí un manual."}</p>}
          </section>
        </div>
      )}
    </>
  );
}

/**
 * Una sección de la lista: título y páginas editables en bloque. El campo de
 * páginas se aplica al confirmar (Enter o salir del campo); con error queda en
 * rojo y NO se aplica. Esc vuelve a como estaba.
 */
function SeccionPaquete({ s, n, esPrimera, esUltima, onTitulo, onPaginas, onVer, onMover, onQuitar, onPaginasMal }) {
  const formateado = formatearPaginas(s.rangos);
  const [texto, setTexto] = useState(formateado);
  const [error, setError] = useState(null);
  const id = useId();

  // Si las páginas cambian desde afuera (guardar, copiar, agregar a esta
  // sección desde el visor), el campo las sigue.
  useEffect(() => {
    setTexto(formateado);
    setError(null);
  }, [formateado]);
  useEffect(() => { onPaginasMal(s.clave, Boolean(error)); }, [s.clave, error, onPaginasMal]);
  useEffect(() => () => onPaginasMal(s.clave, false), [s.clave, onPaginasMal]);

  const revisar = (v) => {
    const p = parsearPaginas(v, s.manual_paginas);
    if (p.error) return { error: p.error };
    if (!p.rangos.length) return { error: "Escribí al menos una página. Para sacar la sección usá Quitar." };
    return { rangos: p.rangos };
  };
  const aplicar = () => {
    if (texto === formateado) { setError(null); return; }
    const r = revisar(texto);
    if (r.error) { setError(r.error); return; }
    setError(null);
    if (formatearPaginas(r.rangos) === formateado) setTexto(formateado);
    else onPaginas(r.rangos);
  };
  const volverAComoEstaba = () => { setTexto(formateado); setError(null); };

  const nombre = String(s.titulo).trim() || `sección ${n}`;
  return (
    <div className="pe-fila">
      <input className="inv-campo pe-fila__titulo" value={s.titulo} maxLength={200} placeholder="Qué es"
        aria-label={`Título de la sección ${n}`} onChange={(e) => onTitulo(e.target.value)} />
      <div className="pe-fila__rango">
        <label htmlFor={`${id}-pag`}>págs.</label>
        <input id={`${id}-pag`} className="pe-fila__paginas" value={texto} autoComplete="off" spellCheck={false}
          aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => {
            setTexto(e.target.value);
            // Con un error a la vista, se vuelve a revisar al escribir: se va apenas se corrige.
            if (error) setError(e.target.value === formateado ? null : revisar(e.target.value).error || null);
          }}
          onBlur={aplicar}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); aplicar(); }
            if (e.key === "Escape") { e.preventDefault(); volverAComoEstaba(); }
          }} />
        <span className="pe-fila__cuenta">{s.paginas} {s.paginas === 1 ? "pág." : "págs."}</span>
        <span className="pe-fila__botones">
          <button type="button" className="adf-icon-btn" title="Ver" aria-label={`Ver ${nombre}`}
            onClick={onVer}><i className="bi bi-eye"></i></button>
          <button type="button" className="adf-icon-btn" title="Subir" aria-label={`Subir ${nombre}`}
            disabled={esPrimera} onClick={() => onMover(-1)}><i className="bi bi-arrow-up"></i></button>
          <button type="button" className="adf-icon-btn" title="Bajar" aria-label={`Bajar ${nombre}`}
            disabled={esUltima} onClick={() => onMover(1)}><i className="bi bi-arrow-down"></i></button>
          <button type="button" className="adf-icon-btn danger" title="Quitar" aria-label={`Quitar ${nombre}`}
            onClick={onQuitar}><i className="bi bi-trash"></i></button>
        </span>
      </div>
      {error && <div id={`${id}-error`} className="pe-fila__error" role="alert">{error}</div>}
      {AVISO_MANUAL[s.manual_estado] && (
        <div className="pe-fila__meta"><span className="adf-tag red">{AVISO_MANUAL[s.manual_estado]}</span></div>
      )}
    </div>
  );
}
