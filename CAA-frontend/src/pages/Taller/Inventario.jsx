import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  getRepuestos, crearRepuesto, actualizarRepuesto,
  registrarMovimiento, getDashboardTaller,
} from "../../services/tallerApi";

function num(v, d = 2) { const n = parseFloat(v); return isNaN(n) ? "—" : n.toFixed(d); }

export default function Inventario() {
  const [repuestos, setRepuestos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [soloBajos, setSoloBajos] = useState(false);
  const [edit, setEdit] = useState(null);   // repuesto en edición (o {} para nuevo)
  const [mover, setMover] = useState(null); // repuesto para movimiento

  const cargar = useCallback(async () => {
    try {
      setRepuestos(await getRepuestos(soloBajos ? { solo_bajos: "true" } : {}));
    } catch (e) {
      toast.error(e.response?.data?.message || "Error al cargar inventario");
    } finally { setLoading(false); }
  }, [soloBajos]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <>
      <h2 className="adf-section-title"><i className="bi bi-box-seam me-2"></i>Inventario de repuestos</h2>
      <p className="adf-section-subtitle">Stock, entradas/salidas (kardex) y consumo hacia aeronaves.</p>

      <div className="adf-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", cursor: "pointer" }}>
            <input type="checkbox" checked={soloBajos} onChange={(e) => setSoloBajos(e.target.checked)} />
            Solo bajo mínimo
          </label>
          <button className="adf-btn small" onClick={() => setEdit({})}><i className="bi bi-plus-lg"></i> Nuevo repuesto</button>
        </div>

        {loading ? <p style={{ color: "var(--c-ink-3)" }}>Cargando…</p> : repuestos.length === 0 ? (
          <p style={{ color: "var(--c-ink-3)", fontSize: "0.9rem" }}>Sin repuestos.</p>
        ) : (
          <table className="adf-table">
            <thead>
              <tr><th>Descripción</th><th>Parte N°</th><th>Ubicación</th><th className="amount">Stock</th><th className="amount">Mínimo</th><th className="amount">Costo U.</th><th></th></tr>
            </thead>
            <tbody>
              {repuestos.map((r) => (
                <tr key={r.id_repuesto}>
                  <td>{r.descripcion}{r.serie_no ? <span style={{ color: "var(--c-ink-4)" }}> · S/N {r.serie_no}</span> : ""}</td>
                  <td>{r.parte_no || "—"}</td>
                  <td>{r.ubicacion || "—"}</td>
                  <td className={`amount ${r.stock_bajo ? "neg" : ""}`}>{num(r.stock_actual, 0)} {r.unidad}{r.stock_bajo && <span className="adf-tag red" style={{ marginLeft: 6 }}>Bajo</span>}</td>
                  <td className="amount">{num(r.stock_minimo, 0)}</td>
                  <td className="amount">${num(r.costo_unitario)}</td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <button className="adf-btn small secondary" onClick={() => setMover(r)}>Movimiento</button>
                    <button className="adf-icon-btn" title="Editar" onClick={() => setEdit(r)}><i className="bi bi-pencil"></i></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {edit && <ModalRepuesto repuesto={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); cargar(); }} />}
      {mover && <ModalMovimiento repuesto={mover} onClose={() => setMover(null)} onSaved={() => { setMover(null); cargar(); }} />}
    </>
  );
}

// ── Modal: alta / edición de repuesto ──────────────────────────────────────
function ModalRepuesto({ repuesto, onClose, onSaved }) {
  const esNuevo = !repuesto.id_repuesto;
  const [f, setF] = useState({
    descripcion: repuesto.descripcion || "", parte_no: repuesto.parte_no || "",
    categoria: repuesto.categoria || "", ubicacion: repuesto.ubicacion || "",
    unidad: repuesto.unidad || "UNIDAD", serie_no: repuesto.serie_no || "",
    stock_actual: repuesto.stock_actual ?? "", stock_minimo: repuesto.stock_minimo ?? "",
    costo_unitario: repuesto.costo_unitario ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF({ ...f, [k]: v });

  const guardar = async (e) => {
    e.preventDefault();
    if (!f.descripcion.trim()) return toast.error("Ingresá una descripción");
    setSaving(true);
    try {
      const payload = {
        descripcion: f.descripcion, parte_no: f.parte_no, categoria: f.categoria,
        ubicacion: f.ubicacion, unidad: f.unidad, serie_no: f.serie_no,
        stock_minimo: f.stock_minimo === "" ? null : Number(f.stock_minimo),
        costo_unitario: f.costo_unitario === "" ? null : Number(f.costo_unitario),
      };
      if (esNuevo) {
        payload.stock_actual = f.stock_actual === "" ? null : Number(f.stock_actual);
        await crearRepuesto(payload);
        toast.success("Repuesto creado");
      } else {
        await actualizarRepuesto(repuesto.id_repuesto, payload);
        toast.success("Repuesto actualizado");
      }
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message || "Error al guardar");
    } finally { setSaving(false); }
  };

  return (
    <div className="adf-modal-backdrop" onClick={onClose}>
      <div className="adf-card adf-modal-card" style={{ padding: 0 }} onClick={(e) => e.stopPropagation()}>
        <div className="adf-edit-head">
          <span className="adf-edit-head__title"><span className="adf-edit-head__chip"><i className="bi bi-box-seam"></i></span>{esNuevo ? "Nuevo repuesto" : `Editar: ${repuesto.descripcion}`}</span>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" form="formRep" className="adf-btn" disabled={saving}><i className="bi bi-check"></i>Guardar</button>
            <button type="button" className="adf-btn secondary" onClick={onClose}>Cerrar</button>
          </div>
        </div>
        <div style={{ padding: "0 var(--sp-5) var(--sp-5)" }}>
          <form id="formRep" onSubmit={guardar}>
            <div className="adf-form-grid">
              <div className="adf-form-field"><label>Descripción</label><input value={f.descripcion} onChange={(e) => set("descripcion", e.target.value)} /></div>
              <div className="adf-form-field"><label>N° de parte</label><input value={f.parte_no} onChange={(e) => set("parte_no", e.target.value)} /></div>
              <div className="adf-form-field"><label>Categoría</label><input value={f.categoria} onChange={(e) => set("categoria", e.target.value)} placeholder="Ej. Filtros" /></div>
              <div className="adf-form-field"><label>Ubicación</label><input value={f.ubicacion} onChange={(e) => set("ubicacion", e.target.value)} placeholder="Estante / bin" /></div>
              <div className="adf-form-field"><label>Unidad</label><input value={f.unidad} onChange={(e) => set("unidad", e.target.value)} /></div>
              <div className="adf-form-field"><label>N° de serie</label><input value={f.serie_no} onChange={(e) => set("serie_no", e.target.value)} /></div>
              {esNuevo && <div className="adf-form-field"><label>Stock inicial</label><input type="number" step="0.01" value={f.stock_actual} onChange={(e) => set("stock_actual", e.target.value)} placeholder="0" /></div>}
              <div className="adf-form-field"><label>Stock mínimo</label><input type="number" step="0.01" value={f.stock_minimo} onChange={(e) => set("stock_minimo", e.target.value)} placeholder="0" /></div>
              <div className="adf-form-field"><label>Costo unitario (USD)</label><input type="number" step="0.01" value={f.costo_unitario} onChange={(e) => set("costo_unitario", e.target.value)} placeholder="0.00" /></div>
            </div>
            {!esNuevo && <p className="adf-note" style={{ marginTop: 12 }}>El stock se modifica con movimientos (entrada/salida/ajuste), no desde aquí.</p>}
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Modal: movimiento de inventario ────────────────────────────────────────
function ModalMovimiento({ repuesto, onClose, onSaved }) {
  const [aeronaves, setAeronaves] = useState([]);
  const [f, setF] = useState({
    tipo: "ENTRADA", cantidad: "", costo_unitario: repuesto.costo_unitario ?? "",
    fecha: new Date().toISOString().slice(0, 10), id_aeronave: "", nota: "",
    crear_egreso: false, proveedor: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF({ ...f, [k]: v });

  useEffect(() => {
    getDashboardTaller().then((d) => setAeronaves(d.aeronaves)).catch(() => {});
  }, []);

  const guardar = async (e) => {
    e.preventDefault();
    const c = parseFloat(f.cantidad);
    if (isNaN(c) || c <= 0) return toast.error("Ingresá una cantidad válida");
    setSaving(true);
    try {
      await registrarMovimiento(repuesto.id_repuesto, {
        tipo: f.tipo, cantidad: c,
        costo_unitario: f.costo_unitario === "" ? null : Number(f.costo_unitario),
        fecha: f.fecha || null,
        id_aeronave: f.id_aeronave ? Number(f.id_aeronave) : null,
        nota: f.nota,
        crear_egreso: f.tipo === "SALIDA" && f.crear_egreso,
        proveedor: f.proveedor,
      });
      toast.success("Movimiento registrado");
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message || "Error al registrar");
    } finally { setSaving(false); }
  };

  const esSalida = f.tipo === "SALIDA";

  return (
    <div className="adf-modal-backdrop" onClick={onClose}>
      <div className="adf-card adf-modal-card" style={{ padding: 0, maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="adf-edit-head">
          <span className="adf-edit-head__title"><span className="adf-edit-head__chip"><i className="bi bi-arrow-left-right"></i></span>Movimiento: {repuesto.descripcion}</span>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" form="formMov" className="adf-btn" disabled={saving}><i className="bi bi-check"></i>Registrar</button>
            <button type="button" className="adf-btn secondary" onClick={onClose}>Cerrar</button>
          </div>
        </div>
        <div style={{ padding: "0 var(--sp-5) var(--sp-5)" }}>
          <p style={{ fontSize: "0.85rem", color: "var(--c-ink-3)" }}>Stock actual: <strong>{num(repuesto.stock_actual, 0)} {repuesto.unidad}</strong></p>
          <form id="formMov" onSubmit={guardar}>
            <div className="adf-form-grid">
              <div className="adf-form-field"><label>Tipo</label>
                <select value={f.tipo} onChange={(e) => set("tipo", e.target.value)}>
                  <option value="ENTRADA">Entrada (+)</option>
                  <option value="SALIDA">Salida (−)</option>
                  <option value="AJUSTE">Ajuste (fijar stock)</option>
                </select></div>
              <div className="adf-form-field"><label>{f.tipo === "AJUSTE" ? "Nuevo stock" : "Cantidad"}</label><input type="number" step="0.01" value={f.cantidad} onChange={(e) => set("cantidad", e.target.value)} /></div>
              <div className="adf-form-field"><label>Costo unitario (USD)</label><input type="number" step="0.01" value={f.costo_unitario} onChange={(e) => set("costo_unitario", e.target.value)} /></div>
              <div className="adf-form-field"><label>Fecha</label><input type="date" value={f.fecha} onChange={(e) => set("fecha", e.target.value)} /></div>
              {esSalida && (
                <div className="adf-form-field"><label>Aeronave (consumo)</label>
                  <select value={f.id_aeronave} onChange={(e) => set("id_aeronave", e.target.value)}>
                    <option value="">— Sin aeronave —</option>
                    {aeronaves.map(a => <option key={a.id_aeronave} value={a.id_aeronave}>{a.codigo}</option>)}
                  </select></div>
              )}
            </div>
            <div className="adf-form-field" style={{ marginTop: 10 }}><label>Nota</label><input value={f.nota} onChange={(e) => set("nota", e.target.value)} /></div>
            {esSalida && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--c-line-2)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", cursor: "pointer" }}>
                  <input type="checkbox" checked={f.crear_egreso} onChange={(e) => set("crear_egreso", e.target.checked)} />
                  Registrar egreso en Contabilidad (categoría REPUESTOS)
                </label>
                {f.crear_egreso && (
                  <div className="adf-form-field" style={{ marginTop: 8 }}><label>Proveedor (opcional)</label><input value={f.proveedor} onChange={(e) => set("proveedor", e.target.value)} /></div>
                )}
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
