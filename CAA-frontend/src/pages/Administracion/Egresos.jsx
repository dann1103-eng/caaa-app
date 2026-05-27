import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { getEgresos, crearEgreso } from "../../services/administracionApi";

const MOCK = [
  { id: 1, categoria: "COMBUSTIBLE",    proveedor: "Aviocomb S.A.",    concepto: "Avgas 100LL - 2000 gal", monto_usd: 4250.00, fecha: "2026-05-12" },
  { id: 2, categoria: "MANTENIMIENTO",  proveedor: "Aerotaller CAA",   concepto: "100h YS-334PE - cambio de aceite y bujías", monto_usd: 880.00, fecha: "2026-05-08" },
  { id: 3, categoria: "NOMINA",         proveedor: "Planilla mensual", concepto: "Nómina instructores abril 2026", monto_usd: 6800.00, fecha: "2026-05-02" },
  { id: 4, categoria: "SERVICIOS",      proveedor: "CAESS",            concepto: "Energía eléctrica - mayo", monto_usd: 320.00, fecha: "2026-05-15" },
  { id: 5, categoria: "SUMINISTROS",    proveedor: "Office Depot",     concepto: "Material didáctico", monto_usd: 145.50, fecha: "2026-05-11" }
];

const CATEGORIAS = ["COMBUSTIBLE","MANTENIMIENTO","NOMINA","SUMINISTROS","PROVEEDOR","SERVICIOS","OTRO"];

export default function Egresos() {
  const [egresos, setEgresos] = useState([]);
  const [usingMock, setUsingMock] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ categoria: "COMBUSTIBLE", proveedor: "", concepto: "", monto_usd: "", fecha: new Date().toISOString().slice(0,10) });

  const load = async () => {
    try {
      const r = await getEgresos(filtro ? { categoria: filtro } : {});
      if (r?.ok) { setEgresos(r.data); setUsingMock(false); } else throw new Error();
    } catch { setEgresos(MOCK.filter(e => !filtro || e.categoria === filtro)); setUsingMock(true); }
  };
  useEffect(() => { load(); }, [filtro]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await crearEgreso({ ...form, monto_usd: Number(form.monto_usd) });
      toast.success("Egreso registrado");
      setShowForm(false);
      setForm({ categoria: "COMBUSTIBLE", proveedor: "", concepto: "", monto_usd: "", fecha: new Date().toISOString().slice(0,10) });
      load();
    } catch (e) { toast.error(e?.response?.data?.message || "Error"); }
  };

  const total = egresos.reduce((s, e) => s + Number(e.monto_usd), 0);

  return (
    <div>
      <h1 className="adf-section-title"><i className="bi bi-cash-stack"></i>Egresos</h1>
      <p className="adf-section-subtitle">
        Registro de pagos a proveedores, combustible, mantenimiento, nómina y servicios.
        {usingMock && <span className="adf-tag amber" style={{ marginLeft: 10 }}>Datos demo</span>}
      </p>

      <div className="adf-card" style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
        <div className="adf-form-field" style={{ flex: "0 0 220px" }}>
          <label>Filtrar categoría</label>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="">Todas</option>
            {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <button className="adf-btn" onClick={() => setShowForm(true)}>
            <i className="bi bi-plus-circle"></i>Nuevo egreso
          </button>
        </div>
      </div>

      {showForm && (
        <div className="adf-card">
          <h3><i className="bi bi-plus-circle me-2"></i>Nuevo egreso</h3>
          <form onSubmit={handleSubmit}>
            <div className="adf-form-grid">
              <div className="adf-form-field">
                <label>Categoría</label>
                <select value={form.categoria} onChange={(e) => setForm({...form, categoria: e.target.value})}>
                  {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="adf-form-field">
                <label>Fecha</label>
                <input type="date" value={form.fecha} onChange={(e) => setForm({...form, fecha: e.target.value})} />
              </div>
              <div className="adf-form-field">
                <label>Proveedor</label>
                <input value={form.proveedor} onChange={(e) => setForm({...form, proveedor: e.target.value})} />
              </div>
              <div className="adf-form-field">
                <label>Monto USD</label>
                <input type="number" step="0.01" min="0.01" required value={form.monto_usd}
                  onChange={(e) => setForm({...form, monto_usd: e.target.value})} />
              </div>
              <div className="adf-form-field" style={{ gridColumn: "1 / -1" }}>
                <label>Concepto</label>
                <input required value={form.concepto} onChange={(e) => setForm({...form, concepto: e.target.value})} />
              </div>
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
              <button type="submit" className="adf-btn"><i className="bi bi-check"></i>Guardar</button>
              <button type="button" className="adf-btn secondary" onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      <table className="adf-table">
        <thead>
          <tr>
            <th>Fecha</th><th>Categoría</th><th>Proveedor</th><th>Concepto</th>
            <th style={{ textAlign: "right" }}>Monto USD</th>
          </tr>
        </thead>
        <tbody>
          {egresos.map(e => (
            <tr key={e.id}>
              <td>{new Date(e.fecha).toLocaleDateString("es-SV")}</td>
              <td><span className="adf-tag blue">{e.categoria}</span></td>
              <td>{e.proveedor || "—"}</td>
              <td style={{ color: "var(--c-ink-3)" }}>{e.concepto}</td>
              <td className="amount neg" style={{ textAlign: "right" }}>${Number(e.monto_usd).toFixed(2)}</td>
            </tr>
          ))}
          <tr style={{ background: "var(--c-surface-2)", fontWeight: 700 }}>
            <td colSpan={4} style={{ textAlign: "right" }}>Total ({egresos.length} egresos)</td>
            <td className="amount neg" style={{ textAlign: "right" }}>${total.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
