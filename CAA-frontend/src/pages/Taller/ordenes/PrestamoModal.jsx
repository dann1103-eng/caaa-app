import { useState } from "react";
import { toast } from "sonner";
import { crearPrestamo } from "../../../services/tallerApi";
import ItemPicker from "../inventario/ItemPicker";
import { fmt, hoy } from "../inventario/formato";

const VACIA = { item: null, descripcion: "", cantidad: "" };

/**
 * Registrar un préstamo entre talleres.
 *
 * La dirección es lo primero que se elige, porque decide todo lo demás: si el
 * material sale del estante o entra. En el papel había que deducirla de quién
 * figuraba como solicitante.
 */
export default function PrestamoModal({ onClose, onGuardado }) {
  const [f, setF] = useState({
    direccion: "ENTREGADO", contraparte: "", fecha_entrega: hoy(),
    solicitante: "", entregado_por: "", fecha_compromiso: "", nota: "",
  });
  const [lineas, setLineas] = useState([{ ...VACIA }]);
  const [guardando, setGuardando] = useState(false);
  const [faltantes, setFaltantes] = useState(null);
  const [motivoForzado, setMotivoForzado] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setL = (i, k, v) => setLineas((p) => p.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  const llenas = lineas.filter((l) => (l.item || l.descripcion.trim()) && Number(l.cantidad) > 0);

  const enviar = async (forzar = false) => {
    if (!f.contraparte.trim()) return toast.error("Escribí con qué taller es el préstamo");
    if (!llenas.length) return toast.error("Agregá al menos una cosa prestada");
    if (forzar && !motivoForzado.trim()) return toast.error("Escribí por qué se presta igual");
    setGuardando(true);
    try {
      const r = await crearPrestamo({
        ...f,
        fecha_compromiso: f.fecha_compromiso || null,
        lineas: llenas.map((l) => ({
          id_repuesto: l.item?.id_repuesto || null,
          descripcion: l.item?.descripcion || l.descripcion,
          parte_no: l.item?.parte_no || null,
          unidad: l.item?.unidad || null,
          cantidad: Number(l.cantidad),
        })),
        forzar, motivo_forzado: forzar ? motivoForzado : null,
      });
      toast.success(`Préstamo ${r.correlativo} registrado`);
      onGuardado();
    } catch (e) {
      if (e.response?.status === 409 && e.response.data?.faltantes) {
        setFaltantes(e.response.data.faltantes);
        toast.error(e.response.data.message);
      } else {
        toast.error(e.response?.data?.message || "No se pudo registrar");
      }
    } finally {
      setGuardando(false);
    }
  };

  const presta = f.direccion === "ENTREGADO";

  return (
    <div className="adf-modal-backdrop" onClick={onClose}>
      <div className="adf-card adf-modal-card" style={{ padding: 0, maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
        <div className="adf-edit-head">
          <span className="adf-edit-head__title">
            <span className="adf-edit-head__chip"><i className="bi bi-arrow-left-right"></i></span>
            Registrar préstamo
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="adf-btn" disabled={guardando} onClick={() => enviar(false)}><i className="bi bi-check"></i>Registrar</button>
            <button type="button" className="adf-btn secondary" onClick={onClose}>Cerrar</button>
          </div>
        </div>

        <div style={{ padding: "0 var(--sp-5) var(--sp-5)" }}>
          {/* La dirección primero: decide si el material sale o entra. */}
          <div className="adf-form-field">
            <label>¿En qué dirección?</label>
            <select value={f.direccion} onChange={(e) => set("direccion", e.target.value)}>
              <option value="ENTREGADO">Nosotros prestamos — sale del estante</option>
              <option value="RECIBIDO">Nos prestan a nosotros — entra al estante</option>
            </select>
          </div>

          <div className="adf-form-grid" style={{ marginTop: 12 }}>
            <div className="adf-form-field">
              <label>{presta ? "¿A qué taller?" : "¿De qué taller?"}</label>
              <input value={f.contraparte} onChange={(e) => set("contraparte", e.target.value)} placeholder="ASERSA, Taller Aviónica…" />
            </div>
            <div className="adf-form-field">
              <label>Fecha de entrega</label>
              <input type="date" value={f.fecha_entrega} onChange={(e) => set("fecha_entrega", e.target.value)} />
            </div>
            <div className="adf-form-field">
              <label>Quién lo pide</label>
              <input value={f.solicitante} onChange={(e) => set("solicitante", e.target.value)} />
            </div>
            <div className="adf-form-field">
              <label>Quién lo entrega</label>
              <input value={f.entregado_por} onChange={(e) => set("entregado_por", e.target.value)} />
            </div>
            <div className="adf-form-field">
              <label>¿Cuándo vuelve?</label>
              <input type="date" value={f.fecha_compromiso} onChange={(e) => set("fecha_compromiso", e.target.value)} />
            </div>
          </div>

          <h4 style={{ fontSize: "0.9rem", margin: "var(--sp-4) 0 var(--sp-2)" }}>¿Qué se presta?</h4>
          <div className="adf-table-wrap">
            <table className="adf-table inv-renglones">
              <thead>
                <tr><th style={{ width: "60%" }}>Del catálogo, o escribilo</th><th style={{ width: 120 }} className="amount">Cantidad</th><th style={{ width: 40 }}></th></tr>
              </thead>
              <tbody>
                {lineas.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <ItemPicker
                        valor={l.item}
                        autoFocus={i === 0}
                        onElegir={(it) => {
                          setL(i, "item", it);
                          if (it && i === lineas.length - 1) setLineas((p) => [...p, { ...VACIA }]);
                        }}
                      />
                      {!l.item && (
                        <input
                          style={{ marginTop: 4 }}
                          value={l.descripcion}
                          onChange={(e) => setL(i, "descripcion", e.target.value)}
                          placeholder="…o escribilo (libro de horas, certificado, herramienta suelta)"
                        />
                      )}
                      {l.item && (
                        <div style={{ fontSize: "0.75rem", color: "var(--c-ink-3)", marginTop: 2 }}>
                          Existencia: {fmt(l.item.stock_actual, 0)} {l.item.unidad}
                        </div>
                      )}
                    </td>
                    <td><input type="number" step="0.01" min="0" value={l.cantidad} onChange={(e) => setL(i, "cantidad", e.target.value)} /></td>
                    <td>
                      <button type="button" className="adf-icon-btn" title="Quitar"
                        onClick={() => setLineas((p) => (p.length === 1 ? [{ ...VACIA }] : p.filter((_, j) => j !== i)))}>
                        <i className="bi bi-trash"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="adf-form-field" style={{ marginTop: 12 }}>
            <label>Nota</label>
            <input value={f.nota} onChange={(e) => set("nota", e.target.value)} />
          </div>

          <p className="adf-note" style={{ marginTop: 12 }}>
            Lo que elijas del catálogo <strong>mueve la existencia</strong>. Lo que escribas a mano
            —un libro de horas, un certificado— solo queda registrado.
          </p>

          {faltantes && (
            <div className="inv-faltantes">
              <h4><i className="bi bi-exclamation-triangle"></i> No hay existencia suficiente</h4>
              <ul>
                {faltantes.map((x) => (
                  <li key={x.id_repuesto}>
                    <strong>{x.codigo}</strong> {x.descripcion}: hay {fmt(x.disponible, 0)} {x.unidad},
                    se prestan {fmt(x.solicitado, 0)}
                  </li>
                ))}
              </ul>
              <div className="adf-form-field">
                <label>Motivo para prestarlo igual</label>
                <input value={motivoForzado} onChange={(e) => setMotivoForzado(e.target.value)} />
              </div>
              <button type="button" className="adf-btn danger small" style={{ marginTop: 8 }} disabled={guardando} onClick={() => enviar(true)}>
                Prestar de todos modos
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
