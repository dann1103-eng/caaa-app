import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getOrden, aprobarOrden, devolverOrden } from "../../../services/tallerApi";
import SignaturePad from "../../../components/SignaturePad/SignaturePad";
import { fecha, hoy, META_TIPO } from "../inventario/formato";

/**
 * La revisión del jefe de taller.
 *
 * Es lo que hace auditable el trabajo: el mecánico certifica lo que hizo y el
 * jefe lo mira antes de que el avión se devuelva al servicio. Se abre con TODO
 * el papeleo junto —lo que hoy el jefe arma a mano en un folder— para que la
 * revisión sea leer, no buscar.
 */
export default function RevisarOrdenModal({ orden, onClose, onResuelta }) {
  const [d, setD] = useState(null);
  const [fechaAp, setFechaAp] = useState(hoy());
  const [nota, setNota] = useState("");
  const [devolviendo, setDevolviendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  // El jefe puede corregir la redacción antes de firmar: es el papel que se
  // imprime y queda archivado.
  const [texto, setTexto] = useState("");
  const firmaRef = useRef(null);

  useEffect(() => {
    getOrden(orden.id_orden)
      .then((r) => { setD(r); setTexto(r.orden.accion_correctiva || ""); })
      .catch(() => toast.error("No se pudo leer la orden"));
  }, [orden.id_orden]);

  const aprobar = async () => {
    if (firmaRef.current?.isEmpty()) return toast.error("Dibujá tu firma para aprobar");
    setGuardando(true);
    try {
      const r = await aprobarOrden(orden.id_orden, {
        fecha_aprobacion: fechaAp,
        firma_jefe: firmaRef.current?.toDataURL(),
        accion_correctiva: texto,
      });
      toast.success(
        r.listo_para_devolver
          ? `${orden.correlativo} aprobada. ${r.listo_para_devolver} queda listo para devolver al servicio y ya se avisó a Operaciones.`
          : `${orden.correlativo} aprobada.`
      );
      onResuelta();
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudo aprobar");
    } finally {
      setGuardando(false);
    }
  };

  const devolver = async () => {
    if (!nota.trim()) return toast.error("Escribí qué hay que corregir");
    setGuardando(true);
    try {
      await devolverOrden(orden.id_orden, nota);
      toast.success(`${orden.correlativo} devuelta al mecánico`);
      onResuelta();
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudo devolver");
    } finally {
      setGuardando(false);
    }
  };

  const o = d?.orden;

  return (
    <div className="adf-modal-backdrop" onClick={onClose}>
      <div className="adf-card adf-modal-card" style={{ padding: 0, maxWidth: 820 }} onClick={(e) => e.stopPropagation()}>
        <div className="adf-edit-head">
          <span className="adf-edit-head__title">
            <span className="adf-edit-head__chip"><i className="bi bi-clipboard-check"></i></span>
            Revisar {orden.correlativo}
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            {!devolviendo && (
              <button className="adf-btn" disabled={guardando || !d} onClick={aprobar}>
                <i className="bi bi-check2-circle"></i>Aprobar con mi firma
              </button>
            )}
            <button type="button" className="adf-btn secondary" onClick={onClose}>Cerrar</button>
          </div>
        </div>

        <div style={{ padding: "0 var(--sp-5) var(--sp-5)" }}>
          {!d ? <p style={{ color: "var(--c-ink-3)" }}>Cargando…</p> : (
            <>
              <div className="adf-form-grid">
                <Dato label="Avión" valor={`${o.aeronave_codigo} · ${o.modelo || ""}`} />
                <Dato label="Tacómetro" valor={o.tacometro != null ? Number(o.tacometro).toFixed(2) : "—"} />
                <Dato label="Firmó" valor={`${o.mecanico_nombre || "—"}${o.licencia_tma ? ` · ${o.licencia_tma}` : ""}`} />
                <Dato label="Fecha de firma" valor={fecha(o.fecha_firma)} />
                <Dato label="Tiempo del trabajo" valor={duracion(o.minutos_trabajo)} />
                {o.aprendiz_nombre && <Dato label="Aprendiz" valor={`${o.aprendiz_nombre} · ${o.certificado_aprendiz || ""}`} />}
                {o.devoluciones > 0 && <Dato label="Devoluciones" valor={`${o.devoluciones} — ya se corrigió`} />}
              </div>

              <Bloque titulo="Trabajo a efectuar / falla">{o.discrepancia}</Bloque>

              {/* Editable: el jefe corrige la redacción antes de firmar. */}
              <div className="adf-form-field" style={{ marginTop: 14 }}>
                <label>Acción correctiva — podés corregirla antes de firmar</label>
                <textarea rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} />
              </div>

              {d.reporte && (
                <p className="adf-note" style={{ marginTop: 12 }}>
                  Entregado por Operaciones con el reporte <strong>{d.reporte.correlativo}</strong>
                  {d.reporte.piloto_nombre ? ` · piloto ${d.reporte.piloto_nombre}` : ""}.
                </p>
              )}

              <h4 style={{ fontSize: "0.9rem", margin: "var(--sp-4) 0 var(--sp-2)" }}>
                Papeleo de bodega ({d.documentos.length})
              </h4>
              {d.documentos.length === 0 ? (
                <p style={{ fontSize: "0.85rem", color: "var(--c-ink-4)" }}>No se pidió material para este trabajo.</p>
              ) : (
                <div className="adf-table-wrap">
                  <table className="adf-table">
                    <thead><tr><th>N°</th><th>Qué</th><th>Fecha</th><th className="amount">Renglones</th></tr></thead>
                    <tbody>
                      {d.documentos.map((x) => {
                        const m = META_TIPO[x.tipo] || {};
                        return (
                          <tr key={x.id_documento} className={x.estado === "ANULADO" ? "inv-anulado" : ""}>
                            <td className="inv-codigo">{x.correlativo}</td>
                            <td><span className={`adf-tag ${m.tag || ""}`}>{m.label || x.tipo}</span></td>
                            <td>{fecha(x.fecha)}</td>
                            <td className="amount">{x.renglones}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {d.partes.length > 0 && (
                <>
                  <h4 style={{ fontSize: "0.9rem", margin: "var(--sp-4) 0 var(--sp-2)" }}>Partes reemplazadas</h4>
                  <div className="adf-table-wrap">
                    <table className="adf-table">
                      <thead><tr><th>Descripción</th><th>P/N ON</th><th>S/N ON</th><th>P/N OFF</th><th>S/N OFF</th></tr></thead>
                      <tbody>
                        {d.partes.map((x) => (
                          <tr key={x.id_parte}>
                            <td>{x.descripcion}</td><td>{x.pn_on || "—"}</td><td>{x.sn_on || "—"}</td>
                            <td>{x.pn_off || "—"}</td><td>{x.sn_off || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {!devolviendo && (
                <div className="adf-form-grid" style={{ marginTop: 14 }}>
                  <div className="adf-form-field">
                    <label>Firma del mecánico</label>
                    {o.firma_mecanico
                      ? <img src={o.firma_mecanico} alt="Firma del mecánico"
                             style={{ maxWidth: 240, border: "1px solid var(--c-line-1)", borderRadius: 6, background: "#fff" }} />
                      : <span style={{ color: "var(--c-ink-4)", fontSize: "0.85rem" }}>Firmó sin dibujar.</span>}
                  </div>
                  <div className="adf-form-field">
                    <label>Tu firma</label>
                    <SignaturePad ref={firmaRef} width={300} height={110} />
                  </div>
                </div>
              )}

              {!devolviendo ? (
                <div className="adf-form-grid" style={{ marginTop: 16 }}>
                  <div className="adf-form-field">
                    <label>Fecha de aprobación</label>
                    <input type="date" value={fechaAp} onChange={(e) => setFechaAp(e.target.value)} />
                  </div>
                  <div className="adf-form-field" style={{ justifyContent: "flex-end" }}>
                    <button type="button" className="adf-btn danger" onClick={() => setDevolviendo(true)}>
                      <i className="bi bi-arrow-counterclockwise"></i>Devolver al mecánico
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 16 }}>
                  <div className="adf-form-field">
                    <label>¿Qué hay que corregir?</label>
                    <textarea rows={3} value={nota} onChange={(e) => setNota(e.target.value)}
                      placeholder="Falta el número de parte de la bujía que se cambió…" />
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                    <button className="adf-btn danger" disabled={guardando} onClick={devolver}>Devolver</button>
                    <button type="button" className="adf-btn secondary" onClick={() => setDevolviendo(false)}>Cancelar</button>
                  </div>
                </div>
              )}

              <p className="adf-note" style={{ marginTop: 12 }}>
                Al aprobar queda tu número de licencia en la orden. Si ya no queda trabajo pendiente
                de este avión, se le avisa a Operaciones que está listo para devolver al servicio —
                <strong> ellos deciden cuándo vuelve a volar</strong>.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** "3 h 20 min" — desde que el mecánico tomó el trabajo hasta que lo firmó. */
const duracion = (min) => {
  if (min == null) return "—";
  const h = Math.floor(min / 60), m = min % 60;
  if (min < 60) return `${m} min`;
  return h >= 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${h} h ${m} min`;
};

const Dato = ({ label, valor }) => (
  <div className="adf-form-field">
    <label>{label}</label>
    <div style={{ fontSize: "0.9rem", paddingTop: 4 }}>{valor || "—"}</div>
  </div>
);

const Bloque = ({ titulo, children }) => (
  <div style={{ marginTop: 14 }}>
    <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "var(--c-brand-700)", letterSpacing: 0.4, marginBottom: 6 }}>
      {titulo.toUpperCase()}
    </div>
    <p style={{ fontSize: "0.9rem", whiteSpace: "pre-wrap", margin: 0 }}>{children || "—"}</p>
  </div>
);
