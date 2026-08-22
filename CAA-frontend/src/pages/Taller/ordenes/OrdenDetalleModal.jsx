import { useEffect, useState } from "react";
import EmitirStickersModal from "./EmitirStickersModal";
import { toast } from "sonner";
import {
  getOrden, anularOrden, abrirOrdenPDF, abrirReporteInspeccionPDF, abrirDocumentoPDF,
} from "../../../services/tallerApi";
import { fecha, fmt, META_TIPO } from "../inventario/formato";
import FirmarOrdenModal from "./FirmarOrdenModal";

/**
 * El folder del trabajo: la orden con TODO lo que le cuelga.
 *
 * Es lo que pidió Daniel — "todos los documentos adjuntos a un mantenimiento:
 * requisiciones, OT, reporte, solicitud de taller, e incluso el préstamo si
 * aplicó" — y el equivalente digital del folder que hoy arman a mano.
 */
export default function OrdenDetalleModal({ id, onClose, onCambio }) {
  const [d, setD] = useState(null);
  const [firmando, setFirmando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false);
  const [stickers, setStickers] = useState(false);

  const cargar = () => getOrden(id).then(setD).catch((e) =>
    toast.error(e.response?.data?.message || "No se pudo abrir la orden"));
  useEffect(() => { cargar(); }, [id]);

  const anular = async () => {
    if (!motivo.trim()) return toast.error("Escribí el motivo de la anulación");
    try {
      await anularOrden(id, motivo);
      toast.success("Orden anulada");
      onCambio();
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudo anular");
    }
  };

  const pdf = (fn, arg) => fn(arg).catch(() => toast.error("No se pudo generar el PDF"));
  const o = d?.orden;

  return (
    <div className="adf-modal-backdrop" onClick={onClose}>
      <div className="adf-card adf-modal-card" style={{ padding: 0, maxWidth: 900 }} onClick={(e) => e.stopPropagation()}>
        <div className="adf-edit-head">
          <span className="adf-edit-head__title">
            <span className="adf-edit-head__chip"><i className="bi bi-clipboard2-check"></i></span>
            {o ? o.correlativo : "Cargando…"}
            {o?.estado === "ANULADA" && <span className="adf-tag red" style={{ marginLeft: 8 }}>Anulada</span>}
          </span>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {o && (
              <button className="adf-btn secondary" onClick={() => pdf(abrirOrdenPDF, id)}>
                <i className="bi bi-printer"></i> Imprimir
              </button>
            )}
            {o?.estado === "ABIERTA" && (
              <button className="adf-btn" onClick={() => setFirmando(true)}><i className="bi bi-pen"></i> Firmar</button>
            )}
            {/* Los stickers se pegan cuando el trabajo ya se hizo: una orden
                todavía abierta no tiene nada que certificar en un libro. */}
            {o && o.estado !== "ANULADA" && o.estado !== "ABIERTA" && (
              <button className="adf-btn secondary" onClick={() => setStickers(true)}>
                <i className="bi bi-stickies"></i> Stickers para los libros
              </button>
            )}
            {o && o.estado !== "ANULADA" && !pidiendoMotivo && (
              <button className="adf-btn danger" onClick={() => setPidiendoMotivo(true)}>Anular</button>
            )}
            <button type="button" className="adf-btn secondary" onClick={onClose}>Cerrar</button>
          </div>
        </div>

        <div style={{ padding: "0 var(--sp-5) var(--sp-5)" }}>
          {!o ? <p style={{ color: "var(--c-ink-3)" }}>Cargando…</p> : (
            <>
              <div className="inv-kardex__ficha">
                <Dato label="Avión" valor={`${o.aeronave_codigo}${o.designacion ? ` · ${o.designacion}` : ""}`} />
                <Dato label="Fecha" valor={fecha(o.fecha)} />
                <Dato label="Tacómetro" valor={fmt(o.tacometro)} />
                <Dato label="Piloto / Operador" valor={o.piloto_operador || "—"} />
                <Dato label="Estado" valor={o.estado} />
                {o.fecha_firma && <Dato label="Firmada" valor={fecha(o.fecha_firma)} />}
                {o.mecanico_nombre && (
                  <Dato label="Mecánico" valor={`${o.mecanico_nombre}${o.licencia_tma ? ` · ${o.licencia_tma}` : ""}`} />
                )}
                {o.aprendiz_nombre && <Dato label="Aprendiz" valor={o.aprendiz_nombre} />}
              </div>

              <p style={{ fontSize: "0.9rem" }}><strong>Trabajo / falla:</strong> {o.discrepancia}</p>
              {o.accion_correctiva && (
                <p style={{ fontSize: "0.88rem", textAlign: "justify" }}>
                  <strong>Acción correctiva:</strong> {o.accion_correctiva}
                </p>
              )}
              {o.estado === "ANULADA" && <p className="adf-note">Anulada: {o.motivo_anulacion}</p>}

              {/* Todo el papeleo del trabajo, que es el punto de esta pantalla. */}
              <h4 style={{ fontSize: "0.9rem", margin: "var(--sp-4) 0 var(--sp-2)" }}>Papeles de este trabajo</h4>
              <div className="adf-table-wrap">
                <table className="adf-table">
                  <thead><tr><th>Documento</th><th>Tipo</th><th>Fecha</th><th>Detalle</th><th></th></tr></thead>
                  <tbody>
                    {d.reporte && (
                      <tr>
                        <td className="inv-codigo">{d.reporte.correlativo}</td>
                        <td><span className="adf-tag blue">Reporte de inspección</span></td>
                        <td>{fecha(d.reporte.fecha)}</td>
                        <td>{d.reporte.tipo_inspeccion || "—"}</td>
                        <td>
                          <button className="adf-icon-btn" title="Imprimir"
                            onClick={() => pdf(abrirReporteInspeccionPDF, d.reporte.id_reporte)}>
                            <i className="bi bi-printer"></i>
                          </button>
                        </td>
                      </tr>
                    )}
                    {d.documentos.map((x) => {
                      const m = META_TIPO[x.tipo] || {};
                      return (
                        <tr key={x.id_documento} className={x.estado === "ANULADO" ? "inv-anulado" : ""}>
                          <td className="inv-codigo">{x.correlativo}</td>
                          <td><span className={`adf-tag ${m.tag || ""}`}>{m.label || x.tipo}</span></td>
                          <td>{fecha(x.fecha)}</td>
                          <td>{x.motivo || "—"} · {x.renglones} {x.renglones === 1 ? "renglón" : "renglones"}</td>
                          <td>
                            {["REQUISICION", "SALIDA"].includes(x.tipo) && (
                              <button className="adf-icon-btn" title="Imprimir"
                                onClick={() => pdf(abrirDocumentoPDF, x.id_documento)}>
                                <i className="bi bi-printer"></i>
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {!d.reporte && d.documentos.length === 0 && (
                      <tr><td colSpan={5} style={{ color: "var(--c-ink-3)" }}>
                        Este trabajo todavía no tiene papeles asociados.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {d.partes.length > 0 && (
                <>
                  <h4 style={{ fontSize: "0.9rem", margin: "var(--sp-4) 0 var(--sp-2)" }}>Partes reemplazadas</h4>
                  <div className="adf-table-wrap">
                    <table className="adf-table">
                      <thead>
                        <tr><th className="amount">Cant.</th><th>P/N ON</th><th>S/N ON</th><th>Nombre</th><th>P/N OFF</th><th>S/N OFF</th></tr>
                      </thead>
                      <tbody>
                        {d.partes.map((p) => (
                          <tr key={p.id_parte}>
                            <td className="amount">{fmt(p.cantidad, 0)}</td>
                            <td>{p.pn_on || "—"}</td><td>{p.sn_on || "—"}</td>
                            <td>{p.nombre}</td>
                            <td>{p.pn_off || "—"}</td><td>{p.sn_off || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {pidiendoMotivo && (
                <div className="inv-faltantes" style={{ borderColor: "var(--c-line-2)", background: "var(--c-surface-2)" }}>
                  <h4 style={{ color: "var(--c-ink-1)" }}>Anular {o.correlativo}</h4>
                  <p style={{ fontSize: "0.85rem" }}>
                    Si el trabajo tiene documentos de bodega vigentes, el sistema no deja anularla
                    hasta que los anules primero: son movimientos reales de material.
                  </p>
                  <div className="adf-form-field">
                    <label>Motivo</label>
                    <input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
                  </div>
                  <button className="adf-btn danger small" style={{ marginTop: 8 }} onClick={anular}>
                    Confirmar anulación
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {firmando && o && (
        <FirmarOrdenModal
          orden={o}
          onClose={() => setFirmando(false)}
          onFirmada={() => { setFirmando(false); cargar(); onCambio(); }}
        />
      )}

      {stickers && o && (
        <EmitirStickersModal
          orden={o}
          onClose={() => setStickers(false)}
          onEmitidos={() => { cargar(); onCambio?.(); }}
        />
      )}
    </div>
  );
}

function Dato({ label, valor }) {
  return (
    <div>
      <div className="inv-kpi__label">{label}</div>
      <div style={{ fontSize: "0.95rem" }}>{valor}</div>
    </div>
  );
}
