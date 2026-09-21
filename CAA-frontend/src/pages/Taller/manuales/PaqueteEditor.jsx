import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { getPaquete, guardarPaquete, getManuales, getManual } from "../../../services/manualesApi";
import { TIPO_INSPECCION, tipoEnFrase, mensajeError } from "./formatoManual";
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

const etiquetaManual = (m) => `${m.titulo}${m.revision ? ` · ${m.revision}` : ""}`;

const AVISO_MANUAL = { REEMPLAZADO: "Revisión reemplazada", ARCHIVADO: "Manual archivado" };

/**
 * Editor de un paquete: a la izquierda los rangos, a la derecha el visor para
 * marcar páginas nuevas. El estado se elige explícito al guardar (spec §9.4).
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
  const secuencia = useRef(0); // clave de React de los rangos todavía sin guardar
  // Una marca nueva por cada "Ver": el visor salta aunque ya estuviera abierto
  // en ese manual y esa página de arranque (el usuario pudo haber hojeado).
  const vistas = useRef(0);

  useEffect(() => {
    let vivo = true;
    setCargado(false);
    setErrorCarga(null);
    getPaquete(aeronave.id_aeronave, tipo)
      .then((r) => {
        if (!vivo) return;
        setPaquete(r.paquete);
        setFilas(r.extractos.map(aFila));
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

  const codigoDe = (id) => tabla?.aeronaves.find((a) => a.id_aeronave === id)?.codigo || `#${id}`;
  const opcionesCopia = useMemo(
    () => (tabla?.celdas || []).filter((c) => c.extractos > 0 && !(c.id_aeronave === aeronave.id_aeronave && c.tipo_mantenimiento === tipo)),
    [tabla, aeronave.id_aeronave, tipo]
  );
  const total = filas.reduce((s, f) => s + Math.max(0, Number(f.pagina_hasta) - Number(f.pagina_desde) + 1 || 0), 0);
  // El visor puede estar mostrando un manual que no está en la lista (el
  // "Ver" de un rango que apunta a una revisión reemplazada): sin su opción,
  // el selector mostraría otro título.
  const visorFueraDeLista = visor && !manuales.some((m) => m.id_manual === visor.manual.id_manual);

  const cambiar = (nuevas) => { setFilas(nuevas); setSucio(true); };
  const mover = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= filas.length) return;
    const n = [...filas];
    [n[i], n[j]] = [n[j], n[i]];
    cambiar(n);
  };
  const editarFila = (i, k, v) => cambiar(filas.map((f, x) => (x === i ? { ...f, [k]: v, origen: "MANUAL" } : f)));
  const quitar = (i) => cambiar(filas.filter((_, x) => x !== i));

  const elegirManual = (id) => {
    const m = manuales.find((x) => String(x.id_manual) === String(id));
    if (m) setVisor({ manual: m, pagina: 1 });
  };
  const ver = (f) => {
    const enLista = manuales.find((m) => m.id_manual === f.id_manual);
    if (enLista) {
      setVisor({ manual: enLista, pagina: f.pagina_desde, marca: ++vistas.current });
    } else {
      getManual(f.id_manual).then((m) => setVisor({ manual: m, pagina: f.pagina_desde, marca: ++vistas.current }))
        .catch((e) => toast.error(mensajeError(e, "No se pudo abrir el manual")));
    }
  };

  const agregar = ({ pagina_desde, pagina_hasta, titulo }) => {
    const m = visor.manual;
    const nueva = {
      clave: `n${++secuencia.current}`, id_manual: m.id_manual, manual_titulo: m.titulo, manual_revision: m.revision,
      manual_estado: m.estado, manual_paginas: m.paginas, pagina_desde, pagina_hasta, titulo, origen: "MANUAL",
    };
    setFilas((prev) => [...prev, nueva]);
    setSucio(true);
    toast.success(`Págs. ${pagina_desde}–${pagina_hasta} agregadas. Falta guardar.`);
  };

  const copiar = async () => {
    if (!copiarDe) return;
    const [idA, tp] = copiarDe.split("|");
    try {
      const r = await getPaquete(idA, tp);
      if (filas.length && !window.confirm(`¿Reemplazar los ${filas.length} rango(s) actuales por los ${r.extractos.length} del otro paquete?`)) return;
      cambiar(r.extractos.map((e) => ({ ...aFila(e), clave: `c${e.id_extracto}`, origen: "MANUAL" })));
      toast.success("Copiado. Revisá los rangos y guardá.");
    } catch (e) { toast.error(mensajeError(e, "No se pudo copiar")); }
  };

  const guardar = async (estado) => {
    if (!cargado) return;
    const sinTitulo = filas.findIndex((f) => !String(f.titulo).trim());
    if (sinTitulo >= 0) return toast.error(`El rango ${sinTitulo + 1} no tiene título`);
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
      setFilas(extractos.map(aFila));
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
            <div className="pe-lista__tit">Páginas del paquete <small>({filas.length} rango(s) · {total} págs.)</small></div>
            {!filas.length && (
              <p className="man-vacio">Todavía no tiene páginas. Elegí un manual a la derecha, marcá desde y hasta, y agregalas.</p>
            )}
            {filas.map((f, i) => (
              <div key={f.clave} className="pe-fila">
                <input className="inv-campo pe-fila__titulo" value={f.titulo} maxLength={200} placeholder="Qué es"
                  aria-label={`Título del rango ${i + 1}`} onChange={(e) => editarFila(i, "titulo", e.target.value)} />
                <div className="pe-fila__meta">
                  {f.manual_titulo}{f.manual_revision ? ` · ${f.manual_revision}` : ""}
                  {AVISO_MANUAL[f.manual_estado] && <span className="adf-tag red">{AVISO_MANUAL[f.manual_estado]}</span>}
                </div>
                <div className="pe-fila__rango">
                  págs.
                  <input type="number" min={1} max={f.manual_paginas} value={f.pagina_desde} aria-label={`Rango ${i + 1}: desde`}
                    onChange={(e) => editarFila(i, "pagina_desde", e.target.value)} />
                  a
                  <input type="number" min={1} max={f.manual_paginas} value={f.pagina_hasta} aria-label={`Rango ${i + 1}: hasta`}
                    onChange={(e) => editarFila(i, "pagina_hasta", e.target.value)} />
                  <span className="pe-fila__botones">
                    <button type="button" className="adf-icon-btn" title="Ver" aria-label={`Ver el rango ${i + 1}`}
                      onClick={() => ver(f)}><i className="bi bi-eye"></i></button>
                    <button type="button" className="adf-icon-btn" title="Subir" aria-label={`Subir el rango ${i + 1}`}
                      disabled={i === 0} onClick={() => mover(i, -1)}><i className="bi bi-arrow-up"></i></button>
                    <button type="button" className="adf-icon-btn" title="Bajar" aria-label={`Bajar el rango ${i + 1}`}
                      disabled={i === filas.length - 1} onClick={() => mover(i, 1)}><i className="bi bi-arrow-down"></i></button>
                    <button type="button" className="adf-icon-btn danger" title="Quitar" aria-label={`Quitar el rango ${i + 1}`}
                      onClick={() => quitar(i)}><i className="bi bi-trash"></i></button>
                  </span>
                </div>
              </div>
            ))}
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
            <div className="pe-visor__elegir">
              <select className="inv-campo" aria-label="Manual" value={visor?.manual?.id_manual || ""} onChange={(e) => elegirManual(e.target.value)}>
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
