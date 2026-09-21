import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getManualesOrden, agregarManualOrden, quitarManualOrden, traerPaqueteOrden, pdfDeOrden,
  getManuales, getManual, abrirPdfCuandoEste,
} from "../../../services/manualesApi";
import { TIPO_INSPECCION, TIPOS, tipoEnFrase, mensajeError } from "../manuales/formatoManual";
import VisorManualModal from "../manuales/VisorManualModal";
import "../inventario/inventario.css";
import "../manuales/manuales.css";

const AVISO_MANUAL = { REEMPLAZADO: "De la revisión anterior", ARCHIVADO: "Manual archivado" };

/**
 * "Manuales de este trabajo": las páginas del paquete de la inspección más las
 * que se le agregaron a la orden, listas para imprimir (spec §9.5). Pensado para
 * el celular: el mecánico lo abre de pie junto al avión.
 *
 * `orden` necesita id_orden, correlativo y aeronave_codigo (lo que ya trae SELECT_OT).
 */
export default function ManualesOrdenModal({ orden, onClose }) {
  const [d, setD] = useState(null);
  const [visor, setVisor] = useState(null); // { manual, pagina, agregar }
  const [eligiendo, setEligiendo] = useState(false);
  const [manuales, setManuales] = useState([]);
  const [verTodos, setVerTodos] = useState(false);
  const [tipoTraer, setTipoTraer] = useState("100HR");
  const [cargandoManuales, setCargandoManuales] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const [imprimiendo, setImprimiendo] = useState(false);
  // El candado de imprimir va también en un ref: el "Reintentar" del toast
  // llama a imprimirTodo con el estado de cuando se creó el toast.
  const imprimiendoRef = useRef(false);
  const pedido = useRef(0); // solo cuenta la respuesta del último pedido

  const cargar = useCallback(() => {
    const n = ++pedido.current;
    return getManualesOrden(orden.id_orden)
      .then((r) => { if (n === pedido.current) setD(r); })
      .catch((e) => { if (n === pedido.current) toast.error(mensajeError(e, "No se pudieron cargar los manuales")); });
  }, [orden.id_orden]);
  useEffect(() => { cargar(); }, [cargar]);

  const idAeronave = d?.orden.id_aeronave;
  useEffect(() => {
    if (!eligiendo || !idAeronave) return undefined;
    // `vivo`: con "Ver todos" marcado y desmarcado rápido, la respuesta vieja
    // podía llegar después de la nueva y pisarla.
    let vivo = true;
    setCargandoManuales(true);
    getManuales(verTodos ? {} : { aeronave: idAeronave })
      .then((ms) => { if (vivo) setManuales(ms); })
      .catch((e) => { if (vivo) toast.error(mensajeError(e, "No se pudo cargar la lista de manuales")); })
      .finally(() => { if (vivo) setCargandoManuales(false); });
    return () => { vivo = false; };
  }, [eligiendo, verTodos, idAeronave]);

  // Sin await antes de abrirPdfCuandoEste: la pestaña se abre dentro del clic.
  const imprimirTodo = () => {
    if (imprimiendoRef.current) return;
    imprimiendoRef.current = true;
    setImprimiendo(true);
    abrirPdfCuandoEste(() => pdfDeOrden(orden.id_orden))
      .catch((e) => toast.error(mensajeError(e, "No se pudo armar el PDF"), {
        action: { label: "Reintentar", onClick: () => imprimirTodo() },
      }))
      .finally(() => {
        imprimiendoRef.current = false;
        setImprimiendo(false);
      });
  };

  const ver = (e) =>
    getManual(e.id_manual).then((m) => setVisor({ manual: m, pagina: e.pagina_desde, agregar: false }))
      .catch((err) => toast.error(mensajeError(err, "No se pudo abrir el manual")));

  const quitar = async (e) => {
    if (quitando) return;
    if (!window.confirm(`¿Quitar «${e.titulo || e.manual_titulo}» de esta orden?`)) return;
    setQuitando(true);
    try {
      await quitarManualOrden(orden.id_orden, e.id_extracto);
      await cargar();
    } catch (err) {
      toast.error(mensajeError(err, "No se pudo quitar"));
    } finally {
      setQuitando(false);
    }
  };

  const traer = async () => {
    if (trabajando) return;
    setTrabajando(true);
    try {
      const r = await traerPaqueteOrden(orden.id_orden, tipoTraer);
      // El backend no duplica lo que ya estaba agregado: puede no quedar nada nuevo.
      if (r.agregadas > 0) toast.success(`${r.agregadas} rango(s) agregados`);
      else toast.info("Esas páginas ya estaban en la orden");
      cargar();
    } catch (err) {
      toast.error(mensajeError(err, "No se pudo traer el paquete"));
    } finally {
      setTrabajando(false);
    }
  };

  // Los errores los muestra el visor (con "Reintentar"): por eso no se atrapan acá.
  const agregar = async (r) => {
    await agregarManualOrden(orden.id_orden, { id_manual: visor.manual.id_manual, ...r });
    toast.success(`Págs. ${r.pagina_desde}–${r.pagina_hasta} agregadas a la orden`);
    setVisor(null);
    cargar();
  };

  // En medio de una frase: "inspección anual", "inspección 100 h".
  const insp = d?.inspeccion ? `inspección ${tipoEnFrase(d.inspeccion)}` : null;
  const hayPaginas = d && (d.del_paquete.length > 0 || d.agregadas.length > 0);

  // `prefijo` separa las claves de React: los id_extracto del paquete
  // (taller_paquete_extracto) y los de la orden (taller_orden_extracto) salen de
  // tablas distintas y pueden repetirse. Solo lo agregado ("a") se puede quitar.
  const lista = (prefijo, titulo, items) => {
    const quitable = prefijo === "a";
    return (
      <section className="mo-seccion">
        <h4>{titulo}</h4>
        {items.map((e) => (
          <div key={`${prefijo}-${e.id_extracto}`} className="mo-fila">
            <button type="button" className="mo-fila__abrir" onClick={() => ver(e)}>
              <span className="mo-fila__titulo">{e.titulo || e.manual_titulo}</span>
              <span className="mo-fila__meta">
                {e.manual_titulo} · págs. {e.pagina_desde}–{e.pagina_hasta} ({e.paginas})
                {quitable && e.agregado_por_nombre ? ` · ${e.agregado_por_nombre}` : ""}
                {quitable && e.creado_txt ? ` · ${e.creado_txt}` : ""}
              </span>
              {AVISO_MANUAL[e.manual_estado] && <span className="adf-tag amber">{AVISO_MANUAL[e.manual_estado]}</span>}
            </button>
            {quitable && d.puede_agregar && (
              <button type="button" className="adf-icon-btn danger" title="Quitar" disabled={quitando}
                aria-label={`Quitar ${e.titulo || e.manual_titulo}`} onClick={() => quitar(e)}>
                <i className="bi bi-trash"></i>
              </button>
            )}
          </div>
        ))}
      </section>
    );
  };

  return (
    <>
      <div className="adf-modal-backdrop" onClick={(e) => { e.stopPropagation(); onClose(); }}>
        <div className="adf-card adf-modal-card mo" onClick={(e) => e.stopPropagation()}>
          <div className="adf-edit-head">
            <span className="adf-edit-head__title">
              <span className="adf-edit-head__chip"><i className="bi bi-book"></i></span>Manuales de este trabajo
            </span>
            <button type="button" className="adf-btn secondary" onClick={onClose}>Cerrar</button>
          </div>
          <div className="mo-cuerpo">
            <p className="mo-sub">
              {orden.correlativo} · {orden.aeronave_codigo}{insp ? ` · ${insp}` : ""}
            </p>
            {!d && <p className="man-vacio">Cargando…</p>}
            {d && (
              <>
                {d.del_paquete.length > 0 &&
                  lista("p", `Del paquete${insp ? ` de la ${insp}` : ""}${d.congelado ? " (fijado al firmar)" : ""}`, d.del_paquete)}

                {d.inspeccion && !d.del_paquete.length && !d.congelado && (
                  <p className="adf-note">
                    <i className="bi bi-info-circle"></i>
                    {d.paquete_estado === "BORRADOR"
                      ? (d.es_jefe
                        ? `El paquete de la ${insp} de este avión está en borrador: el mecánico no lo ve. Confirmalo en Manuales → Paquetes por inspección.`
                        : `El paquete de la ${insp} de este avión todavía no está listo.`)
                      : d.paquete_estado === "CONFIRMADO"
                        // El backend saca del paquete lo que ya se agregó a mano.
                        ? `Las páginas del paquete de la ${insp} ya están entre las agregadas.`
                        : `Este avión todavía no tiene paquete para la ${insp}.`}
                  </p>
                )}

                {!d.inspeccion && d.puede_agregar && (
                  <div className="mo-traer">
                    <span>¿Es una inspección? Traé sus páginas:</span>
                    <select className="inv-campo" value={tipoTraer} aria-label="Inspección" onChange={(e) => setTipoTraer(e.target.value)}>
                      {TIPOS.map((t) => <option key={t} value={t}>{TIPO_INSPECCION[t]}</option>)}
                    </select>
                    <button type="button" className="adf-btn secondary small" disabled={trabajando} onClick={traer}>
                      Traer las páginas del paquete
                    </button>
                  </div>
                )}

                {d.agregadas.length > 0 && lista("a", "Agregadas en este trabajo", d.agregadas)}
                {!hayPaginas && <p className="man-vacio">Esta orden todavía no tiene páginas de manual.</p>}

                <div className="mo-acciones">
                  {hayPaginas && (
                    <button type="button" className="adf-btn mo-grande" disabled={imprimiendo} onClick={imprimirTodo}>
                      <i className="bi bi-printer"></i>
                      {imprimiendo ? "Preparando el PDF…" : `Abrir e imprimir todo (${d.paginas} págs.)`}
                    </button>
                  )}
                  {d.puede_agregar && (
                    <button type="button" className="adf-btn secondary mo-grande" aria-expanded={eligiendo}
                      onClick={() => setEligiendo((x) => !x)}>
                      <i className="bi bi-plus-lg"></i> Agregar páginas de un manual
                    </button>
                  )}
                </div>

                {eligiendo && (
                  <section className="mo-seccion">
                    <h4>¿De qué manual?</h4>
                    <label className="man-check mo-todos">
                      <input type="checkbox" checked={verTodos} onChange={(e) => setVerTodos(e.target.checked)} /> Ver todos los manuales
                    </label>
                    {cargandoManuales && <p className="man-vacio">Cargando…</p>}
                    {!cargandoManuales && manuales.map((m) => (
                      <button type="button" key={m.id_manual} className="mo-manual"
                        onClick={() => { setEligiendo(false); setVisor({ manual: m, pagina: 1, agregar: true }); }}>
                        {m.titulo}<small>{m.revision || ""}</small>
                      </button>
                    ))}
                    {!cargandoManuales && !manuales.length && (
                      <p className="man-vacio">
                        {verTodos ? "No hay manuales en la biblioteca." : "No hay manuales asignados a este avión. Marcá «Ver todos»."}
                      </p>
                    )}
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {visor && (
        <VisorManualModal manual={visor.manual} paginaInicial={visor.pagina} onClose={() => setVisor(null)}
          accion={visor.agregar
            ? { etiqueta: `Agregar a la orden ${orden.correlativo}`, icono: "bi-plus-lg", pideTitulo: true, ejecutar: agregar }
            : undefined} />
      )}
    </>
  );
}
