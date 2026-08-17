import { useState } from "react";
import { toast } from "sonner";
import { crearItem, actualizarItem } from "../../../services/tallerApi";

/**
 * Ficha del ítem. No tiene campo de existencia a propósito: el stock solo se
 * mueve con documentos (entrada / salida / ajuste).
 */
export default function ItemModal({ item, unidades = [], onClose, onGuardado }) {
  const esNuevo = !item.id_repuesto;
  const [f, setF] = useState({
    descripcion: item.descripcion || "",
    parte_no: item.parte_no || "",
    categoria: item.categoria || "",
    ubicacion: item.ubicacion || "",
    unidad: item.unidad || "UN",
    serie_no: item.serie_no || "",
    stock_minimo: item.stock_minimo ?? "",
    costo_unitario: item.costo_unitario ?? "",
    activo: item.activo ?? true,
  });
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const guardar = async (e) => {
    e.preventDefault();
    if (!f.descripcion.trim()) return toast.error("Poné una descripción");
    setGuardando(true);
    try {
      const payload = {
        ...f,
        stock_minimo: f.stock_minimo === "" ? null : Number(f.stock_minimo),
        costo_unitario: f.costo_unitario === "" ? null : Number(f.costo_unitario),
      };
      if (esNuevo) {
        const creado = await crearItem(payload);
        toast.success(`Ítem creado con el código ${creado.codigo}`);
      } else {
        await actualizarItem(item.id_repuesto, payload);
        toast.success("Ítem actualizado");
      }
      onGuardado();
    } catch (err) {
      toast.error(err.response?.data?.message || "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="adf-modal-backdrop" onClick={onClose}>
      <div className="adf-card adf-modal-card" style={{ padding: 0, maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        <div className="adf-edit-head">
          <span className="adf-edit-head__title">
            <span className="adf-edit-head__chip"><i className="bi bi-box-seam"></i></span>
            {esNuevo ? "Nuevo ítem" : `${item.codigo} · ${item.descripcion}`}
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" form="formItem" className="adf-btn" disabled={guardando}>
              <i className="bi bi-check"></i>Guardar
            </button>
            <button type="button" className="adf-btn secondary" onClick={onClose}>Cerrar</button>
          </div>
        </div>
        <div style={{ padding: "0 var(--sp-5) var(--sp-5)" }}>
          <form id="formItem" onSubmit={guardar}>
            <div className="adf-form-grid">
              <div className="adf-form-field" style={{ gridColumn: "1 / -1" }}>
                <label>Descripción</label>
                <input value={f.descripcion} onChange={(e) => set("descripcion", e.target.value)} />
              </div>
              <div className="adf-form-field">
                <label>N° de parte</label>
                <input value={f.parte_no} onChange={(e) => set("parte_no", e.target.value)} />
              </div>
              <div className="adf-form-field">
                <label>Clasificación</label>
                <input value={f.categoria} onChange={(e) => set("categoria", e.target.value)} placeholder="MOTOR, ELECTRICA, EMPAQUE…" />
              </div>
              <div className="adf-form-field">
                <label>Ubicación</label>
                <input value={f.ubicacion} onChange={(e) => set("ubicacion", e.target.value)} placeholder="Estante / bin" />
              </div>
              <div className="adf-form-field">
                <label>Unidad</label>
                <select value={f.unidad} onChange={(e) => set("unidad", e.target.value)}>
                  {(unidades.length ? unidades : ["UN"]).map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="adf-form-field">
                <label>N° de serie</label>
                <input value={f.serie_no} onChange={(e) => set("serie_no", e.target.value)} placeholder="Solo rotables" />
              </div>
              <div className="adf-form-field">
                <label>Existencia mínima</label>
                <input type="number" step="0.01" value={f.stock_minimo} onChange={(e) => set("stock_minimo", e.target.value)} placeholder="0" />
              </div>
              <div className="adf-form-field">
                <label>Último costo conocido (USD)</label>
                <input type="number" step="0.0001" value={f.costo_unitario} onChange={(e) => set("costo_unitario", e.target.value)} placeholder="0.00" />
              </div>
              {!esNuevo && (
                <div className="adf-form-field">
                  <label>Estado</label>
                  <select value={f.activo ? "1" : "0"} onChange={(e) => set("activo", e.target.value === "1")}>
                    <option value="1">Activo</option>
                    <option value="0">Inactivo (no aparece al hacer documentos)</option>
                  </select>
                </div>
              )}
            </div>
            <p className="adf-note" style={{ marginTop: 12 }}>
              {esNuevo
                ? "El código se asigna solo, con el siguiente número libre. La existencia arranca en cero: se carga con una entrada o un ajuste."
                : "La existencia no se edita acá: se mueve con entradas, salidas y ajustes, que quedan en el kardex."}
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
