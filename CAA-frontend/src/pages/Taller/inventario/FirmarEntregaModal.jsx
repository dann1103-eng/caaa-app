import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getDocumento, firmarSolicitud } from "../../../services/tallerApi";
import { fecha, fmt } from "./formato";
import SignaturePad from "../../../components/SignaturePad/SignaturePad";

/**
 * Firmar la entrega — **acá es donde el material sale de bodega**.
 *
 * En el papel, la solicitud se llena cuando el técnico pide y se firma cuando se
 * le entrega. Hasta esa firma no se descontó nada: por eso la existencia se
 * comprueba en este momento y no antes.
 */
export default function FirmarEntregaModal({ solicitud, onClose, onFirmada }) {
  const [d, setD] = useState(null);
  const [f, setF] = useState({ entregado_por: "", entregado_a: "" });
  // Lo que de verdad sale: arranca en lo pedido y bodega lo ajusta.
  const [entrega, setEntrega] = useState({});
  const [faltantes, setFaltantes] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  // El papel CAAA-004-F lleva las dos partes: quien entrega y quien recibe.
  const firmaEntrega = useRef(null);
  const firmaRecibe = useRef(null);

  useEffect(() => {
    getDocumento(solicitud.id_documento)
      .then((r) => {
        setD(r);
        const ini = {};
        for (const l of r.renglones) ini[l.id_mov] = String(Math.abs(Number(l.cantidad)));
        setEntrega(ini);
      })
      .catch(() => toast.error("No se pudo leer la solicitud"));
  }, [solicitud.id_documento]);

  const firmar = async (forzar = false) => {
    if (forzar && !motivo.trim()) return toast.error("Escribí por qué se entrega sin existencia");
    if (firmaEntrega.current?.isEmpty()) return toast.error("Dibujá tu firma de quien entrega");
    setGuardando(true);
    try {
      await firmarSolicitud(solicitud.id_documento, {
        ...f, forzar, motivo_forzado: forzar ? motivo : null,
        lineas: d.renglones.map((l) => ({ id_mov: l.id_mov, cantidad: Number(entrega[l.id_mov] || 0) })),
        firma_entrega: firmaEntrega.current?.toDataURL(),
        firma_recibe: firmaRecibe.current?.toDataURL(),
      });
      toast.success(`${solicitud.correlativo} entregada. El material salió de bodega.`);
      onFirmada();
    } catch (e) {
      if (e.response?.status === 409 && e.response.data?.faltantes) {
        setFaltantes(e.response.data.faltantes);
        toast.error(e.response.data.message);
      } else {
        toast.error(e.response?.data?.message || "No se pudo firmar la entrega");
      }
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="adf-modal-backdrop" onClick={onClose}>
      <div className="adf-card adf-modal-card" style={{ padding: 0, maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        <div className="adf-edit-head">
          <span className="adf-edit-head__title">
            <span className="adf-edit-head__chip"><i className="bi bi-pen"></i></span>
            Entregar {solicitud.correlativo}
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="adf-btn" disabled={guardando || !d} onClick={() => firmar(false)}>
              <i className="bi bi-check"></i>Firmar y entregar
            </button>
            <button type="button" className="adf-btn secondary" onClick={onClose}>Cerrar</button>
          </div>
        </div>

        <div style={{ padding: "0 var(--sp-5) var(--sp-5)" }}>
          {!d ? <p style={{ color: "var(--c-ink-3)" }}>Cargando…</p> : (
            <>
              <p style={{ fontSize: "0.9rem", color: "var(--c-ink-3)" }}>
                {d.documento.aeronave_codigo || "sin avión"}
                {d.documento.orden_trabajo_no ? ` · OT ${d.documento.orden_trabajo_no}` : ""}
                {" · "}{fecha(d.documento.fecha)}
                {d.requisicion_origen && <> · pedido en <strong>{d.requisicion_origen.correlativo}</strong></>}
              </p>
              {d.documento.motivo && <p style={{ fontSize: "0.9rem" }}>{d.documento.motivo}</p>}

              <div className="adf-table-wrap">
                <table className="adf-table">
                  <thead>
                    <tr>
                      <th>Código</th><th>Descripción</th>
                      <th className="amount">Pidió</th><th className="amount">Hay</th>
                      <th className="amount" style={{ width: 110 }}>Entrego</th><th>Unidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.renglones.map((r) => {
                      const pidio = Math.abs(Number(r.cantidad));
                      const hay = Number(r.stock_actual ?? 0);
                      const doy = Number(entrega[r.id_mov] || 0);
                      return (
                        <tr key={r.id_mov} className={doy === 0 ? "inv-anulado" : ""}>
                          <td className="inv-codigo">{r.codigo}</td>
                          <td>{r.descripcion}</td>
                          <td className="amount">{fmt(pidio, 0)}</td>
                          <td className="amount" style={{ color: hay < doy ? "var(--c-danger-500)" : "var(--c-ink-3)" }}>
                            {fmt(hay, 0)}
                          </td>
                          <td>
                            <input
                              type="number" step="0.01" min="0"
                              value={entrega[r.id_mov] ?? ""}
                              onChange={(e) => setEntrega({ ...entrega, [r.id_mov]: e.target.value })}
                            />
                          </td>
                          <td>{r.unidad}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="adf-form-grid" style={{ marginTop: 12 }}>
                <div className="adf-form-field">
                  <label>Entrega (bodega)</label>
                  <input value={f.entregado_por} onChange={(e) => setF({ ...f, entregado_por: e.target.value })} />
                </div>
                <div className="adf-form-field">
                  <label>Recibe (técnico)</label>
                  <input value={f.entregado_a} onChange={(e) => setF({ ...f, entregado_a: e.target.value })} />
                </div>
              </div>

              <div className="adf-form-grid" style={{ marginTop: 12 }}>
                <div className="adf-form-field">
                  <label>Firma de quien entrega</label>
                  <SignaturePad ref={firmaEntrega} width={300} height={110} />
                </div>
                <div className="adf-form-field">
                  <label>Firma de quien recibe (opcional)</label>
                  <SignaturePad ref={firmaRecibe} width={300} height={110} />
                </div>
              </div>

              <p className="adf-note" style={{ marginTop: 12 }}>
                Entregá <strong>lo que de verdad sale</strong>: si pidió 4 y solo hay 2, poné 2.
                Lo que dejes en <strong>0</strong> no se entrega y sale de la solicitud; la
                requisición queda igual, como registro de lo que se había pedido.
                Al firmar, estas cantidades salen del estante. Hasta ahora no se descontó nada.
              </p>

              {faltantes && (
                <div className="inv-faltantes">
                  <h4><i className="bi bi-exclamation-triangle"></i> No hay existencia suficiente</h4>
                  <ul>
                    {faltantes.map((x) => (
                      <li key={x.id_repuesto}>
                        <strong>{x.codigo}</strong> {x.descripcion}: hay {fmt(x.disponible, 0)} {x.unidad},
                        se piden {fmt(x.solicitado, 0)}
                      </li>
                    ))}
                  </ul>
                  <div className="adf-form-field">
                    <label>Motivo para entregar igual</label>
                    <input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                  </div>
                  <button type="button" className="adf-btn danger small" style={{ marginTop: 8 }}
                    disabled={guardando} onClick={() => firmar(true)}>
                    Entregar de todos modos
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
