import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getNominaPeriodos, getNominaDetalles, calcularNomina,
  aprobarNomina, pagarNomina, editarNominaDetalle
} from "../../services/administracionApi";

const MOCK_PERIODOS = [
  { id: 3, periodo_inicio: "2026-04-01", periodo_fin: "2026-04-30", estado: "PAGADA",   total_periodo: 6800.00, instructores_count: 5, fecha_pago: "2026-05-02" },
  { id: 2, periodo_inicio: "2026-03-01", periodo_fin: "2026-03-31", estado: "PAGADA",   total_periodo: 5950.00, instructores_count: 5, fecha_pago: "2026-04-02" },
  { id: 1, periodo_inicio: "2026-05-01", periodo_fin: "2026-05-31", estado: "BORRADOR", total_periodo: 4200.00, instructores_count: 4, fecha_pago: null }
];

const MOCK_DETALLES = [
  // MENSUAL_FIJO
  { id: 1, instructor_username: "H. Amaya",   tipo_pago: "MENSUAL_FIJO",
    horas_voladas: 38.5, tarifa_hora:  0, monto_vuelo: 0,
    horas_teoricas:  0, tarifa_hora_teoria: 0, monto_teorico: 0,
    salario_mensual: 800.00, bonos: 100, descuentos: 0, total: 900.00 },
  // POR_HORA
  { id: 2, instructor_username: "C. Cáceres", tipo_pago: "POR_HORA",
    horas_voladas: 28.0, tarifa_hora: 32, monto_vuelo: 896.00,
    horas_teoricas: 12.0, tarifa_hora_teoria: 18, monto_teorico: 216.00,
    salario_mensual: 0, bonos: 0, descuentos: 0, total: 1112.00 },
  // POR_HORA
  { id: 3, instructor_username: "J. Burgos",  tipo_pago: "POR_HORA",
    horas_voladas: 22.5, tarifa_hora: 30, monto_vuelo: 675.00,
    horas_teoricas:  8.0, tarifa_hora_teoria: 20, monto_teorico: 160.00,
    salario_mensual: 0, bonos: 0, descuentos: 0, total: 835.00 },
  // MIXTO
  { id: 4, instructor_username: "S. Muñoz",   tipo_pago: "MIXTO",
    horas_voladas: 15.0, tarifa_hora: 18, monto_vuelo: 270.00,
    horas_teoricas:  6.0, tarifa_hora_teoria: 12, monto_teorico:  72.00,
    salario_mensual: 500.00, bonos: 25, descuentos: 0, total: 867.00 }
];

const TIPO_LABEL = {
  MENSUAL_FIJO: { label: "Mensual fijo",  color: "blue",  icon: "bi-cash" },
  POR_HORA:     { label: "Por hora",      color: "green", icon: "bi-clock-history" },
  MIXTO:        { label: "Mixto",         color: "amber", icon: "bi-gear-wide-connected" }
};

export default function Nomina() {
  const [periodos, setPeriodos] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [activeEstado, setActiveEstado] = useState(null);
  const [detalles, setDetalles] = useState([]);
  const [usingMock, setUsingMock] = useState(false);

  const [showCalc, setShowCalc] = useState(false);
  const [calcForm, setCalcForm] = useState({ periodo_inicio: "", periodo_fin: "" });

  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});

  const loadPeriodos = async () => {
    try {
      const r = await getNominaPeriodos();
      if (r?.ok) { setPeriodos(r.data); setUsingMock(false); } else throw new Error();
    } catch { setPeriodos(MOCK_PERIODOS); setUsingMock(true); }
  };
  const loadDetalles = async (id, estado) => {
    setActiveId(id);
    setActiveEstado(estado);
    try {
      const r = await getNominaDetalles(id);
      if (r?.ok) setDetalles(r.data); else setDetalles(MOCK_DETALLES);
    } catch { setDetalles(MOCK_DETALLES); }
  };
  useEffect(() => { loadPeriodos(); }, []);

  const handleCalcular = async (e) => {
    e.preventDefault();
    try {
      await calcularNomina(calcForm);
      toast.success("Nómina calculada. Edita las horas teóricas, bonos o descuentos antes de aprobar.");
      setShowCalc(false);
      loadPeriodos();
    } catch (e) { toast.error(e?.response?.data?.message || "Error"); }
  };

  const openEditar = (d) => {
    setEditing(d);
    setEditForm({
      horas_voladas:       d.horas_voladas ?? 0,
      tarifa_hora:         d.tarifa_hora ?? 0,
      horas_teoricas:      d.horas_teoricas ?? 0,
      tarifa_hora_teoria:  d.tarifa_hora_teoria ?? 0,
      salario_mensual:     d.salario_mensual ?? 0,
      bonos:               d.bonos ?? 0,
      descuentos:          d.descuentos ?? 0,
      observaciones:       d.observaciones ?? ""
    });
  };

  const handleGuardarEdicion = async (e) => {
    e.preventDefault();
    try {
      await editarNominaDetalle(editing.id, editForm);
      toast.success("Detalle actualizado");
      setEditing(null);
      loadDetalles(activeId, activeEstado);
      loadPeriodos();
    } catch (e) { toast.error(e?.response?.data?.message || "Error"); }
  };

  // Cálculo en vivo del total del formulario de edición
  const liveSubtotal =
    Number(editForm.horas_voladas || 0) * Number(editForm.tarifa_hora || 0) +
    Number(editForm.horas_teoricas || 0) * Number(editForm.tarifa_hora_teoria || 0) +
    Number(editForm.salario_mensual || 0);
  const liveTotal = liveSubtotal + Number(editForm.bonos || 0) - Number(editForm.descuentos || 0);

  const totalDetalles = detalles.reduce((s, d) => s + Number(d.total || 0), 0);

  return (
    <div>
      <h1 className="adf-section-title"><i className="bi bi-people-fill"></i>Nómina de Instructores</h1>
      <p className="adf-section-subtitle">
        Cálculo dual: instructores con <strong>salario mensual fijo</strong>, <strong>tarifa por hora</strong> (vuelo + teoría), o ambos.
        Las horas voladas se importan automáticamente desde reportes de vuelo completados.
        {usingMock && <span className="adf-tag amber" style={{ marginLeft: 10 }}>Datos demo</span>}
      </p>

      <div className="adf-card" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <h3 style={{ margin: 0 }}><i className="bi bi-calendar3 me-2"></i>Periodos de nómina</h3>
        <button className="adf-btn" onClick={() => setShowCalc(!showCalc)}>
          <i className="bi bi-calculator"></i>Calcular nuevo periodo
        </button>
      </div>

      {showCalc && (
        <div className="adf-card">
          <form onSubmit={handleCalcular}>
            <p style={{ fontSize: "0.88rem", color: "var(--c-ink-3)", marginTop: 0 }}>
              Al calcular: se crea un nuevo periodo en BORRADOR. Cada instructor con tarifa vigente aparece con sus horas voladas reales del periodo.
              <br />Las horas teóricas inician en cero — edítalas manualmente en cada detalle antes de aprobar.
            </p>
            <div className="adf-form-grid">
              <div className="adf-form-field">
                <label>Periodo inicio</label>
                <input type="date" required value={calcForm.periodo_inicio}
                  onChange={(e) => setCalcForm({...calcForm, periodo_inicio: e.target.value})} />
              </div>
              <div className="adf-form-field">
                <label>Periodo fin</label>
                <input type="date" required value={calcForm.periodo_fin}
                  onChange={(e) => setCalcForm({...calcForm, periodo_fin: e.target.value})} />
              </div>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
              <button type="submit" className="adf-btn"><i className="bi bi-check"></i>Calcular</button>
              <button type="button" className="adf-btn secondary" onClick={() => setShowCalc(false)}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      <table className="adf-table">
        <thead>
          <tr>
            <th>Periodo</th><th>Estado</th><th>Instructores</th>
            <th style={{ textAlign: "right" }}>Total USD</th><th>Pagado</th><th></th>
          </tr>
        </thead>
        <tbody>
          {periodos.map(p => (
            <tr key={p.id} style={{ background: activeId === p.id ? "var(--c-surface-2)" : "transparent" }}>
              <td><strong>{p.periodo_inicio}</strong> → {p.periodo_fin}</td>
              <td>
                {p.estado === 'PAGADA'   && <span className="adf-tag green">PAGADA</span>}
                {p.estado === 'APROBADA' && <span className="adf-tag blue">APROBADA</span>}
                {p.estado === 'BORRADOR' && <span className="adf-tag amber">BORRADOR</span>}
              </td>
              <td>{p.instructores_count} instructores</td>
              <td className="amount" style={{ textAlign: "right" }}>${Number(p.total_periodo).toFixed(2)}</td>
              <td style={{ color: "var(--c-ink-3)", fontSize: "0.85rem" }}>{p.fecha_pago || "—"}</td>
              <td style={{ textAlign: "right" }}>
                <button className="adf-btn small secondary" onClick={() => loadDetalles(p.id, p.estado)}>
                  <i className="bi bi-eye"></i>Ver detalle
                </button>
                {p.estado === 'BORRADOR'
                  ? <button className="adf-btn small" style={{ marginLeft: 6 }}
                            onClick={async () => { await aprobarNomina(p.id); toast.success("Aprobada"); loadPeriodos(); }}>
                      Aprobar
                    </button>
                  : p.estado === 'APROBADA'
                  ? <button className="adf-btn small" style={{ marginLeft: 6 }}
                            onClick={async () => { await pagarNomina(p.id); toast.success("Pagada (egreso registrado)"); loadPeriodos(); }}>
                      Marcar pagada
                    </button>
                  : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {activeId && (
        <div className="adf-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <h3 style={{ margin: 0 }}><i className="bi bi-list-ul me-2"></i>Detalle del periodo #{activeId}</h3>
            <div style={{ fontSize: "0.88rem", color: "var(--c-ink-3)" }}>
              Total del periodo: <strong style={{ color: "var(--c-brand-700)", fontSize: "1.05rem" }}>${totalDetalles.toFixed(2)}</strong>
            </div>
          </div>

          <table className="adf-table" style={{ minWidth: 1000 }}>
            <thead>
              <tr>
                <th>Instructor</th>
                <th>Modalidad</th>
                <th style={{ textAlign: "right" }}>Mensual</th>
                <th style={{ textAlign: "right" }}>H. Vuelo</th>
                <th style={{ textAlign: "right" }}>$/h V.</th>
                <th style={{ textAlign: "right" }}>H. Teoría</th>
                <th style={{ textAlign: "right" }}>$/h T.</th>
                <th style={{ textAlign: "right" }}>Bonos</th>
                <th style={{ textAlign: "right" }}>Desc.</th>
                <th style={{ textAlign: "right" }}>TOTAL</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {detalles.map(d => {
                const tl = TIPO_LABEL[d.tipo_pago] || TIPO_LABEL.POR_HORA;
                return (
                  <tr key={d.id}>
                    <td><i className="bi bi-person-circle me-2"></i><strong>{d.instructor_username}</strong></td>
                    <td><span className={`adf-tag ${tl.color}`}><i className={`bi ${tl.icon} me-1`}></i>{tl.label}</span></td>
                    <td className="amount" style={{ textAlign: "right", color: d.tipo_pago === 'POR_HORA' ? 'var(--c-ink-4)' : 'var(--c-ink-1)' }}>
                      {d.tipo_pago === 'POR_HORA' ? "—" : `$${Number(d.salario_mensual).toFixed(2)}`}
                    </td>
                    <td className="amount" style={{ textAlign: "right" }}>{Number(d.horas_voladas).toFixed(1)}</td>
                    <td className="amount" style={{ textAlign: "right", color: "var(--c-accent-700)" }}>${Number(d.tarifa_hora).toFixed(2)}</td>
                    <td className="amount" style={{ textAlign: "right" }}>{Number(d.horas_teoricas).toFixed(1)}</td>
                    <td className="amount" style={{ textAlign: "right", color: "var(--c-warn-700)" }}>${Number(d.tarifa_hora_teoria).toFixed(2)}</td>
                    <td className="amount pos" style={{ textAlign: "right" }}>+${Number(d.bonos).toFixed(2)}</td>
                    <td className="amount neg" style={{ textAlign: "right" }}>-${Number(d.descuentos).toFixed(2)}</td>
                    <td className="amount" style={{ textAlign: "right", fontWeight: 800, fontSize: "0.95rem" }}>${Number(d.total).toFixed(2)}</td>
                    <td style={{ textAlign: "right" }}>
                      {activeEstado !== 'PAGADA' && (
                        <button className="adf-btn small secondary" onClick={() => openEditar(d)}>
                          <i className="bi bi-pencil"></i>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {detalles.length === 0 && (
                <tr><td colSpan={11} style={{ textAlign: "center", padding: 30, color: "var(--c-ink-4)" }}>
                  No hay detalles en este periodo.
                </td></tr>
              )}
            </tbody>
          </table>

          {/* Resumen por tipo de pago */}
          <div style={{ marginTop: 16, padding: 14, background: "var(--c-surface-2)", borderRadius: 10 }}>
            <div style={{ fontSize: "0.78rem", color: "var(--c-brand-700)", fontWeight: 800, letterSpacing: 0.4, marginBottom: 8 }}>
              RESUMEN POR MODALIDAD
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              {Object.keys(TIPO_LABEL).map(tp => {
                const items = detalles.filter(d => d.tipo_pago === tp);
                const subtotal = items.reduce((s, d) => s + Number(d.total || 0), 0);
                if (items.length === 0) return null;
                const tl = TIPO_LABEL[tp];
                return (
                  <div key={tp} style={{ background: "white", padding: 10, borderRadius: 8 }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--c-ink-3)", marginBottom: 4 }}>
                      <i className={`bi ${tl.icon} me-1`}></i>{tl.label} ({items.length})
                    </div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--c-brand-700)" }}>
                      ${subtotal.toFixed(2)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="adf-card" style={{ background: "var(--c-warn-50)", borderColor: "oklch(85% 0.080 75)" }}>
          <h3>
            <i className="bi bi-pencil-square me-2" style={{ color: "var(--c-warn-700)" }}></i>
            Editar pago de {editing.instructor_username}
          </h3>
          <p style={{ color: "var(--c-ink-3)", fontSize: "0.85rem", marginTop: -10 }}>
            Modalidad: <strong>{TIPO_LABEL[editing.tipo_pago]?.label || editing.tipo_pago}</strong>.
            Ajusta horas teóricas reales del periodo, bonos o descuentos. El total se recalcula al guardar.
          </p>
          <form onSubmit={handleGuardarEdicion}>
            <div className="adf-form-grid">
              {(editing.tipo_pago === 'MENSUAL_FIJO' || editing.tipo_pago === 'MIXTO') && (
                <div className="adf-form-field">
                  <label style={{ color: "var(--c-info-700)" }}><i className="bi bi-cash me-1"></i>Salario mensual</label>
                  <input type="number" step="0.01" value={editForm.salario_mensual}
                    onChange={(e) => setEditForm({...editForm, salario_mensual: e.target.value})} />
                </div>
              )}
              {(editing.tipo_pago === 'POR_HORA' || editing.tipo_pago === 'MIXTO') && (
                <>
                  <div className="adf-form-field">
                    <label style={{ color: "var(--c-accent-700)" }}><i className="bi bi-airplane me-1"></i>Horas voladas</label>
                    <input type="number" step="0.1" value={editForm.horas_voladas}
                      onChange={(e) => setEditForm({...editForm, horas_voladas: e.target.value})} />
                  </div>
                  <div className="adf-form-field">
                    <label style={{ color: "var(--c-accent-700)" }}>Tarifa USD/h vuelo</label>
                    <input type="number" step="0.01" value={editForm.tarifa_hora}
                      onChange={(e) => setEditForm({...editForm, tarifa_hora: e.target.value})} />
                  </div>
                  <div className="adf-form-field">
                    <label style={{ color: "var(--c-warn-700)" }}><i className="bi bi-book me-1"></i>Horas teóricas</label>
                    <input type="number" step="0.1" value={editForm.horas_teoricas}
                      onChange={(e) => setEditForm({...editForm, horas_teoricas: e.target.value})} />
                  </div>
                  <div className="adf-form-field">
                    <label style={{ color: "var(--c-warn-700)" }}>Tarifa USD/h teoría</label>
                    <input type="number" step="0.01" value={editForm.tarifa_hora_teoria}
                      onChange={(e) => setEditForm({...editForm, tarifa_hora_teoria: e.target.value})} />
                  </div>
                </>
              )}
              <div className="adf-form-field">
                <label style={{ color: "var(--c-accent-700)" }}>Bonos (+)</label>
                <input type="number" step="0.01" min="0" value={editForm.bonos}
                  onChange={(e) => setEditForm({...editForm, bonos: e.target.value})} />
              </div>
              <div className="adf-form-field">
                <label style={{ color: "var(--c-danger-700)" }}>Descuentos (-)</label>
                <input type="number" step="0.01" min="0" value={editForm.descuentos}
                  onChange={(e) => setEditForm({...editForm, descuentos: e.target.value})} />
              </div>
              <div className="adf-form-field" style={{ gridColumn: "1 / -1" }}>
                <label>Observaciones</label>
                <input value={editForm.observaciones}
                  onChange={(e) => setEditForm({...editForm, observaciones: e.target.value})} />
              </div>
            </div>

            <div style={{ marginTop: 14, padding: "12px 16px", background: "var(--c-brand-700)", color: "white",
                          borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ opacity: 0.9 }}>Total calculado:</span>
              <span style={{ fontSize: "1.4rem", fontWeight: 800 }}>${liveTotal.toFixed(2)}</span>
            </div>

            <div style={{ marginTop: 14, display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" className="adf-btn secondary" onClick={() => setEditing(null)}>Cancelar</button>
              <button type="submit" className="adf-btn"><i className="bi bi-check"></i>Guardar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
