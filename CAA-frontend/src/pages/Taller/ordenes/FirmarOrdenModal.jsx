import { useEffect, useState } from "react";
import { toast } from "sonner";
import { firmarOrden, getOrden, getPersonalTaller } from "../../../services/tallerApi";
import { hoy } from "../inventario/formato";

const CERTIFICACION = "Certifico que esta aeronave está en condición segura de vuelo.";

/**
 * Firmar y cerrar la orden de trabajo.
 *
 * Firmar es una acción del sistema: el mecánico es el usuario que está adentro y
 * su licencia TMA sale de su ficha. Si no la tiene cargada el servidor responde
 * 403, porque ese número va impreso en la orden y respalda la liberación de la
 * aeronave — no es un dato cosmético.
 */
export default function FirmarOrdenModal({ orden, onClose, onFirmada }) {
  const [f, setF] = useState({ accion_correctiva: "", r_ii: "R II", fecha_firma: hoy(), id_aprendiz: "" });
  const [partes, setPartes] = useState([]);
  const [aprendices, setAprendices] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    getOrden(orden.id_orden)
      .then((d) => {
        if (d.orden.accion_correctiva) set("accion_correctiva", d.orden.accion_correctiva);
        setPartes(d.partes || []);
      })
      .catch(() => {});
    // Solo quien tenga certificado puede ir en esa línea del papel.
    getPersonalTaller()
      .then((r) => setAprendices(r.filter((x) => x.certificado_aprendiz)))
      .catch(() => {});
  }, [orden.id_orden]);

  const guardar = async () => {
    if (!f.accion_correctiva.trim()) return toast.error("Escribí qué se hizo antes de firmar");
    setGuardando(true);
    try {
      const r = await firmarOrden(orden.id_orden, f);
      toast.success(`${r.correlativo} firmada y cerrada`);
      onFirmada();
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudo firmar");
    } finally {
      setGuardando(false);
    }
  };

  const yaCertifica = /condici[oó]n segura de vuelo/i.test(f.accion_correctiva);

  return (
    <div className="adf-modal-backdrop" onClick={onClose}>
      <div className="adf-card adf-modal-card" style={{ padding: 0, maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="adf-edit-head">
          <span className="adf-edit-head__title">
            <span className="adf-edit-head__chip"><i className="bi bi-pen"></i></span>
            Firmar {orden.correlativo}
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="adf-btn" disabled={guardando} onClick={guardar}><i className="bi bi-check"></i>Firmar y cerrar</button>
            <button type="button" className="adf-btn secondary" onClick={onClose}>Cerrar</button>
          </div>
        </div>

        <div style={{ padding: "0 var(--sp-5) var(--sp-5)" }}>
          <p style={{ fontSize: "0.9rem", color: "var(--c-ink-3)" }}>
            <strong>{orden.aeronave_codigo}</strong> · {orden.discrepancia}
          </p>

          <div className="adf-form-field">
            <label>¿Qué se hizo? (acción correctiva)</label>
            <textarea
              rows={7} value={f.accion_correctiva}
              onChange={(e) => set("accion_correctiva", e.target.value)}
              placeholder="Se efectuó inspección, limpieza y lubricación de trenes de aterrizaje… de acuerdo al manual de mantenimiento P/N …"
            />
          </div>

          <div className="adf-form-grid" style={{ marginTop: 12 }}>
            <div className="adf-form-field">
              <label>Fecha de firma</label>
              <input type="date" value={f.fecha_firma} onChange={(e) => set("fecha_firma", e.target.value)} />
            </div>
            <div className="adf-form-field">
              <label>R II</label>
              <input value={f.r_ii} onChange={(e) => set("r_ii", e.target.value)} />
            </div>
          </div>

          {aprendices.length > 0 && (
            <div className="adf-form-field" style={{ marginTop: 12 }}>
              <label>Aprendiz que asistió (opcional)</label>
              <select value={f.id_aprendiz} onChange={(e) => set("id_aprendiz", e.target.value)}>
                <option value="">Ninguno</option>
                {aprendices.map((a) => (
                  <option key={a.id_usuario} value={a.id_usuario}>
                    {a.nombre} · {a.certificado_aprendiz}
                  </option>
                ))}
              </select>
            </div>
          )}

          {partes.length > 0 && (
            <p className="adf-note" style={{ marginTop: 12 }}>
              Se registran <strong>{partes.length}</strong> parte(s) reemplazada(s) con esta orden.
            </p>
          )}

          <p className="adf-note" style={{ marginTop: 12 }}>
            {yaCertifica
              ? "Tu texto ya incluye la certificación."
              : <>Al firmar se agrega al final: <em>“{CERTIFICACION}”</em></>}
            {" "}Después de firmar, la orden <strong>ya no se edita</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}
