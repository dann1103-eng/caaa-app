import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { getConceptosCobro, crearConceptoCobro, actualizarConceptoCobro } from "../../services/administracionApi";

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

export default function ConceptosCobro() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nuevo, setNuevo] = useState({ nombre: "", monto_usd: "", descripcion: "" });
  const [saving, setSaving] = useState(false);

  const cargar = async () => {
    try {
      const r = await getConceptosCobro();
      if (r?.ok) setItems(r.data);
    } catch (e) {
      toast.error(e.response?.data?.message || "Error al cargar");
    } finally { setLoading(false); }
  };
  useEffect(() => { cargar(); }, []);

  const crear = async (e) => {
    e.preventDefault();
    if (!nuevo.nombre.trim() || nuevo.monto_usd === "") return toast.error("Nombre y monto son obligatorios");
    setSaving(true);
    try {
      await crearConceptoCobro({ nombre: nuevo.nombre, monto_usd: Number(nuevo.monto_usd), descripcion: nuevo.descripcion });
      toast.success("Concepto creado");
      setNuevo({ nombre: "", monto_usd: "", descripcion: "" });
      await cargar();
    } catch (e) {
      toast.error(e.response?.data?.message || "Error al crear");
    } finally { setSaving(false); }
  };

  const guardarFila = async (c, campos) => {
    try {
      await actualizarConceptoCobro(c.id, campos);
      await cargar();
    } catch (e) {
      toast.error(e.response?.data?.message || "Error al guardar");
    }
  };

  return (
    <div>
      <div className="adf-card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, color: "var(--c-brand-900)", marginBottom: 4 }}>
          <i className="bi bi-tags me-2" style={{ color: "var(--c-brand-700)" }}></i>Conceptos de cobro
        </div>
        <p style={{ fontSize: "0.85rem", color: "var(--c-ink-3)", margin: "0 0 14px" }}>
          Tipos de cobro configurables con monto por defecto (ej. reposición de examen). Se aplican a la cuenta del alumno desde su ficha → Cuenta corriente, debitando su saldo.
        </p>
        <form onSubmit={crear} className="adf-form-grid">
          <div className="adf-form-field"><label>Nombre del concepto</label>
            <input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Ej. Reposición de examen" /></div>
          <div className="adf-form-field"><label>Monto por defecto (USD)</label>
            <input type="number" step="0.01" min="0" value={nuevo.monto_usd} onChange={(e) => setNuevo({ ...nuevo, monto_usd: e.target.value })} placeholder="0.00" /></div>
          <div className="adf-form-field" style={{ gridColumn: "1 / -1" }}><label>Descripción (opcional)</label>
            <input value={nuevo.descripcion} onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })} /></div>
          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
            <button type="submit" className="adf-btn" disabled={saving}><i className="bi bi-plus-lg"></i>{saving ? "Agregando…" : "Agregar concepto"}</button>
          </div>
        </form>
      </div>

      <div className="adf-card">
        {loading ? <p style={{ color: "var(--c-ink-3)" }}>Cargando…</p> : items.length === 0 ? (
          <p style={{ color: "var(--c-ink-3)", fontSize: "0.9rem" }}>Sin conceptos. Agregá el primero arriba.</p>
        ) : (
          <table className="adf-table">
            <thead>
              <tr><th>Concepto</th><th>Descripción</th><th className="amount">Monto</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} style={{ opacity: c.activo ? 1 : 0.55 }}>
                  <td style={{ fontWeight: 600 }}>{c.nombre}</td>
                  <td style={{ color: "var(--c-ink-3)" }}>{c.descripcion || "—"}</td>
                  <td className="amount">{money(c.monto_usd)}</td>
                  <td>{c.activo ? <span className="adf-tag green">Activo</span> : <span className="adf-tag gray">Inactivo</span>}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <EditarConceptoInline concepto={c} onSave={guardarFila} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function EditarConceptoInline({ concepto, onSave }) {
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState({ nombre: concepto.nombre, monto_usd: concepto.monto_usd, descripcion: concepto.descripcion || "" });

  if (!editando) {
    return (
      <>
        <button className="adf-icon-btn" title="Editar" onClick={() => { setF({ nombre: concepto.nombre, monto_usd: concepto.monto_usd, descripcion: concepto.descripcion || "" }); setEditando(true); }}>
          <i className="bi bi-pencil"></i>
        </button>
        <button className="adf-btn small secondary" style={{ marginLeft: 6 }}
          onClick={() => onSave(concepto, { activo: !concepto.activo })}>
          {concepto.activo ? "Desactivar" : "Activar"}
        </button>
      </>
    );
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <input style={{ width: 150, padding: "4px 8px" }} value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
      <input style={{ width: 80, padding: "4px 8px" }} type="number" step="0.01" value={f.monto_usd} onChange={(e) => setF({ ...f, monto_usd: e.target.value })} />
      <button className="adf-btn small" onClick={async () => { await onSave(concepto, { nombre: f.nombre, monto_usd: Number(f.monto_usd), descripcion: f.descripcion }); setEditando(false); }}>Guardar</button>
      <button className="adf-btn small secondary" onClick={() => setEditando(false)}>×</button>
    </span>
  );
}
