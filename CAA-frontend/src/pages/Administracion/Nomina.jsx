import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getNominaPeriodos, getNominaDetalles, calcularNomina,
  aprobarNomina, pagarNomina, editarNominaDetalle
} from "../../services/administracionApi";

const MOCK_PERIODOS = [
  { id: 3, periodo_inicio: "2026-04-01", periodo_fin: "2026-04-30", estado: "PAGADA",   tipo_planilla: "SERVICIOS", total_periodo: 6800.00, instructores_count: 5, fecha_pago: "2026-05-02" },
  { id: 2, periodo_inicio: "2026-03-01", periodo_fin: "2026-03-31", estado: "PAGADA",   tipo_planilla: "PLANTA",    total_periodo: 5950.00, instructores_count: 3, fecha_pago: "2026-04-02" },
  { id: 1, periodo_inicio: "2026-05-01", periodo_fin: "2026-05-31", estado: "BORRADOR", tipo_planilla: "SERVICIOS", total_periodo: 4200.00, instructores_count: 4, fecha_pago: null }
];

const TIPO_LABEL = {
  MENSUAL_FIJO: { label: "Mensual fijo",  color: "blue",  icon: "bi-cash" },
  POR_HORA:     { label: "Por hora",      color: "green", icon: "bi-clock-history" },
  MIXTO:        { label: "Mixto",         color: "amber", icon: "bi-gear-wide-connected" }
};

const PLANILLA_META = {
  PLANTA:    { label: "Planta (ISR + ISSS + AFP)", color: "blue",  icon: "bi-bank" },
  SERVICIOS: { label: "Servicios prof. (10%)",     color: "green", icon: "bi-briefcase" }
};

// Réplica de la tabla de ISR para vista previa en vivo (igual a utils/deducciones.js).
function deduccionesPlanta(s) {
  s = Number(s) || 0;
  let isr = 0;
  if (s <= 472) isr = 0;
  else if (s <= 895.24) isr = (s - 472) * 0.10;
  else if (s <= 2038.10) isr = 42.35 + (s - 895.24) * 0.20;
  else isr = 271.09 + (s - 2038.10) * 0.30;
  const isss = Math.min(s * 0.03, 30);
  const afp = s * 0.0625;
  return { isr: +isr.toFixed(2), isss: +isss.toFixed(2), afp: +afp.toFixed(2) };
}

export default function Nomina() {
  const [periodos, setPeriodos] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [activeEstado, setActiveEstado] = useState(null);
  const [activeTipo, setActiveTipo] = useState("SERVICIOS");
  const [detalles, setDetalles] = useState([]);
  const [usingMock, setUsingMock] = useState(false);

  const [showCalc, setShowCalc] = useState(false);
  const [calcForm, setCalcForm] = useState({ periodo_inicio: "", periodo_fin: "", tipo_planilla: "SERVICIOS" });

  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});

  const loadPeriodos = async () => {
    try {
      const r = await getNominaPeriodos();
      if (r?.ok) { setPeriodos(r.data); setUsingMock(false); } else throw new Error();
    } catch { setPeriodos(MOCK_PERIODOS); setUsingMock(true); }
  };
  const loadDetalles = async (p) => {
    setActiveId(p.id);
    setActiveEstado(p.estado);
    setActiveTipo(p.tipo_planilla || "SERVICIOS");
    try {
      const r = await getNominaDetalles(p.id);
      if (r?.ok) setDetalles(r.data); else setDetalles([]);
    } catch { setDetalles([]); }
  };
  useEffect(() => { loadPeriodos(); }, []);

  const handleCalcular = async (e) => {
    e.preventDefault();
    try {
      await calcularNomina(calcForm);
      toast.success(`Planilla de ${calcForm.tipo_planilla === 'PLANTA' ? 'planta' : 'servicios'} calculada. Ajusta horas/bonos antes de aprobar.`);
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
      loadDetalles({ id: activeId, estado: activeEstado, tipo_planilla: activeTipo });
      loadPeriodos();
    } catch (e) { toast.error(e?.response?.data?.message || "Error"); }
  };

  // ── Cálculo en vivo del formulario de edición ──
  const esPlanta = activeTipo === "PLANTA";
  const liveBruto =
    Number(editForm.horas_voladas || 0) * Number(editForm.tarifa_hora || 0) +
    Number(editForm.horas_teoricas || 0) * Number(editForm.tarifa_hora_teoria || 0) +
    Number(editForm.salario_mensual || 0);
  const liveDed = esPlanta ? deduccionesPlanta(liveBruto) : { isr: 0, isss: 0, afp: 0 };
  const liveRetencion = esPlanta ? 0 : +(liveBruto * 0.10).toFixed(2);
  const liveNeto = liveBruto - liveDed.isr - liveDed.isss - liveDed.afp - liveRetencion
    + Number(editForm.bonos || 0) - Number(editForm.descuentos || 0);

  const totalDetalles = detalles.reduce((s, d) => s + Number(d.total || 0), 0);
  const totalBruto = detalles.reduce((s, d) => s + Number(d.bruto || 0), 0);
  const totalDeducciones = detalles.reduce((s, d) =>
    s + Number(d.isr || 0) + Number(d.isss || 0) + Number(d.afp || 0) + Number(d.retencion || 0), 0);

  return (
    <div>
      <h1 className="adf-section-title"><i className="bi bi-people-fill"></i>Nómina</h1>
      <p className="adf-section-subtitle">
        Dos planillas separadas: <strong>Planta</strong> (mensual fijo, con ISR + ISSS + AFP) y
        <strong> Servicios profesionales</strong> (retención del 10%). Cada persona se asigna por su
        selector de planilla en Tarifas. Las horas voladas se importan de reportes de vuelo completados.
        {usingMock && <span className="adf-tag amber" style={{ marginLeft: 10 }}>Datos demo</span>}
      </p>

      <div className="adf-card" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <h3 style={{ margin: 0 }}><i className="bi bi-calendar3 me-2"></i>Periodos de nómina</h3>
        <button className="adf-btn" onClick={() => setShowCalc(!showCalc)}>
          <i className="bi bi-calculator"></i>Calcular planilla
        </button>
      </div>

      {showCalc && (
        <div className="adf-card">
          <form onSubmit={handleCalcular}>
            <div className="adf-form-grid">
              <div className="adf-form-field">
                <label>Tipo de planilla</label>
                <select value={calcForm.tipo_planilla}
                  onChange={(e) => setCalcForm({...calcForm, tipo_planilla: e.target.value})}>
                  <option value="SERVICIOS">Servicios profesionales (retención 10%)</option>
                  <option value="PLANTA">Planta — mensual fijo (ISR + ISSS + AFP)</option>
                </select>
              </div>
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
            <p style={{ fontSize: "0.85rem", color: "var(--c-ink-3)", marginTop: 10 }}>
              Se crea un periodo en BORRADOR. Entran las personas (instructores + empleados) cuyo selector
              de planilla coincide con el tipo elegido. Edita horas/bonos/descuentos antes de aprobar.
            </p>
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
            <th>Periodo</th><th>Planilla</th><th>Estado</th><th>Personas</th>
            <th style={{ textAlign: "right" }}>Neto USD</th><th>Pagado</th><th></th>
          </tr>
        </thead>
        <tbody>
          {periodos.map(p => {
            const pm = PLANILLA_META[p.tipo_planilla] || PLANILLA_META.SERVICIOS;
            return (
            <tr key={p.id} style={{ background: activeId === p.id ? "var(--c-surface-2)" : "transparent" }}>
              <td><strong>{p.periodo_inicio}</strong> → {p.periodo_fin}</td>
              <td><span className={`adf-tag ${pm.color}`}><i className={`bi ${pm.icon} me-1`}></i>{pm.label}</span></td>
              <td>
                {p.estado === 'PAGADA'   && <span className="adf-tag green">PAGADA</span>}
                {p.estado === 'APROBADA' && <span className="adf-tag blue">APROBADA</span>}
                {p.estado === 'BORRADOR' && <span className="adf-tag amber">BORRADOR</span>}
              </td>
              <td>{p.instructores_count}</td>
              <td className="amount" style={{ textAlign: "right" }}>${Number(p.total_periodo).toFixed(2)}</td>
              <td style={{ color: "var(--c-ink-3)", fontSize: "0.85rem" }}>{p.fecha_pago || "—"}</td>
              <td style={{ textAlign: "right" }}>
                <button className="adf-btn small secondary" onClick={() => loadDetalles(p)}>
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
          ); })}
        </tbody>
      </table>

      {activeId && (
        <div className="adf-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <h3 style={{ margin: 0 }}>
              <i className="bi bi-list-ul me-2"></i>Detalle del periodo #{activeId}
              <span className={`adf-tag ${PLANILLA_META[activeTipo].color}`} style={{ marginLeft: 10 }}>
                <i className={`bi ${PLANILLA_META[activeTipo].icon} me-1`}></i>{PLANILLA_META[activeTipo].label}
              </span>
            </h3>
            <div style={{ fontSize: "0.88rem", color: "var(--c-ink-3)" }}>
              Total neto: <strong style={{ color: "var(--c-brand-700)", fontSize: "1.05rem" }}>${totalDetalles.toFixed(2)}</strong>
            </div>
          </div>

          <table className="adf-table" style={{ minWidth: 1000 }}>
            <thead>
              {esPlanta ? (
                <tr>
                  <th>Empleado / Instructor</th>
                  <th style={{ textAlign: "right" }}>Bruto</th>
                  <th style={{ textAlign: "right" }}>ISR</th>
                  <th style={{ textAlign: "right" }}>ISSS</th>
                  <th style={{ textAlign: "right" }}>AFP</th>
                  <th style={{ textAlign: "right" }}>Bonos</th>
                  <th style={{ textAlign: "right" }}>Desc.</th>
                  <th style={{ textAlign: "right" }}>NETO</th>
                  <th></th>
                </tr>
              ) : (
                <tr>
                  <th>Instructor / Empleado</th>
                  <th style={{ textAlign: "right" }}>H. Vuelo</th>
                  <th style={{ textAlign: "right" }}>$/h V.</th>
                  <th style={{ textAlign: "right" }}>Teoría</th>
                  <th style={{ textAlign: "right" }}>Bruto</th>
                  <th style={{ textAlign: "right" }}>Ret. 10%</th>
                  <th style={{ textAlign: "right" }}>Bonos</th>
                  <th style={{ textAlign: "right" }}>Desc.</th>
                  <th style={{ textAlign: "right" }}>NETO</th>
                  <th></th>
                </tr>
              )}
            </thead>
            <tbody>
              {detalles.map(d => {
                const editBtn = activeEstado !== 'PAGADA' && (
                  <button className="adf-btn small secondary" onClick={() => openEditar(d)}>
                    <i className="bi bi-pencil"></i>
                  </button>
                );
                const nombre = (
                  <td>
                    <i className="bi bi-person-circle me-2"></i>
                    <strong>{d.instructor_username}</strong>
                    {d.empleado_cargo && <span style={{ marginLeft: 6, fontSize: "0.78rem", color: "var(--c-ink-3)" }}>({d.empleado_cargo})</span>}
                  </td>
                );
                return esPlanta ? (
                  <tr key={d.id}>
                    {nombre}
                    <td className="amount" style={{ textAlign: "right" }}>${Number(d.bruto).toFixed(2)}</td>
                    <td className="amount neg" style={{ textAlign: "right" }}>-${Number(d.isr).toFixed(2)}</td>
                    <td className="amount neg" style={{ textAlign: "right" }}>-${Number(d.isss).toFixed(2)}</td>
                    <td className="amount neg" style={{ textAlign: "right" }}>-${Number(d.afp).toFixed(2)}</td>
                    <td className="amount pos" style={{ textAlign: "right" }}>+${Number(d.bonos).toFixed(2)}</td>
                    <td className="amount neg" style={{ textAlign: "right" }}>-${Number(d.descuentos).toFixed(2)}</td>
                    <td className="amount" style={{ textAlign: "right", fontWeight: 800 }}>${Number(d.total).toFixed(2)}</td>
                    <td style={{ textAlign: "right" }}>{editBtn}</td>
                  </tr>
                ) : (
                  <tr key={d.id}>
                    {nombre}
                    <td className="amount" style={{ textAlign: "right" }}>{Number(d.horas_voladas).toFixed(1)}</td>
                    <td className="amount" style={{ textAlign: "right", color: "var(--c-accent-700)" }}>${Number(d.tarifa_hora).toFixed(2)}</td>
                    <td className="amount" style={{ textAlign: "right", color: "var(--c-warn-700)" }}>${Number(d.monto_teorico).toFixed(2)}</td>
                    <td className="amount" style={{ textAlign: "right" }}>${Number(d.bruto).toFixed(2)}</td>
                    <td className="amount neg" style={{ textAlign: "right" }}>-${Number(d.retencion).toFixed(2)}</td>
                    <td className="amount pos" style={{ textAlign: "right" }}>+${Number(d.bonos).toFixed(2)}</td>
                    <td className="amount neg" style={{ textAlign: "right" }}>-${Number(d.descuentos).toFixed(2)}</td>
                    <td className="amount" style={{ textAlign: "right", fontWeight: 800 }}>${Number(d.total).toFixed(2)}</td>
                    <td style={{ textAlign: "right" }}>{editBtn}</td>
                  </tr>
                );
              })}
              {detalles.length === 0 && (
                <tr><td colSpan={esPlanta ? 9 : 10} style={{ textAlign: "center", padding: 30, color: "var(--c-ink-4)" }}>
                  No hay detalles en este periodo.
                </td></tr>
              )}
            </tbody>
          </table>

          <div style={{ marginTop: 16, padding: 14, background: "var(--c-surface-2)", borderRadius: 10,
                        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <div style={{ background: "white", padding: 10, borderRadius: 8 }}>
              <div style={{ fontSize: "0.75rem", color: "var(--c-ink-3)" }}>Total bruto</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 800 }}>${totalBruto.toFixed(2)}</div>
            </div>
            <div style={{ background: "white", padding: 10, borderRadius: 8 }}>
              <div style={{ fontSize: "0.75rem", color: "var(--c-ink-3)" }}>{esPlanta ? "Deducciones (ISR+ISSS+AFP)" : "Retención 10%"}</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--c-danger-700)" }}>-${totalDeducciones.toFixed(2)}</div>
            </div>
            <div style={{ background: "white", padding: 10, borderRadius: 8 }}>
              <div style={{ fontSize: "0.75rem", color: "var(--c-ink-3)" }}>Total neto a pagar</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--c-brand-700)" }}>${totalDetalles.toFixed(2)}</div>
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
            Planilla <strong>{PLANILLA_META[activeTipo].label}</strong>. El neto y las deducciones se recalculan al guardar.
          </p>
          <form onSubmit={handleGuardarEdicion}>
            <div className="adf-form-grid">
              <div className="adf-form-field">
                <label style={{ color: "var(--c-info-700)" }}>
                  <i className="bi bi-cash me-1"></i>{esPlanta ? "Sueldo / salario mensual" : "Monto base (empleados)"}
                </label>
                <input type="number" step="0.01" value={editForm.salario_mensual}
                  onChange={(e) => setEditForm({...editForm, salario_mensual: e.target.value})} />
              </div>
              {!esPlanta && (
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

            {/* Desglose en vivo */}
            <div style={{ marginTop: 14, padding: "10px 16px", background: "white", borderRadius: 10,
                          display: "flex", flexWrap: "wrap", gap: 18, fontSize: "0.85rem" }}>
              <span>Bruto: <strong>${liveBruto.toFixed(2)}</strong></span>
              {esPlanta ? (
                <>
                  <span style={{ color: "var(--c-danger-700)" }}>ISR: -${liveDed.isr.toFixed(2)}</span>
                  <span style={{ color: "var(--c-danger-700)" }}>ISSS: -${liveDed.isss.toFixed(2)}</span>
                  <span style={{ color: "var(--c-danger-700)" }}>AFP: -${liveDed.afp.toFixed(2)}</span>
                </>
              ) : (
                <span style={{ color: "var(--c-danger-700)" }}>Retención 10%: -${liveRetencion.toFixed(2)}</span>
              )}
            </div>

            <div style={{ marginTop: 10, padding: "12px 16px", background: "var(--c-brand-700)", color: "white",
                          borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ opacity: 0.9 }}>Neto a pagar:</span>
              <span style={{ fontSize: "1.4rem", fontWeight: 800 }}>${liveNeto.toFixed(2)}</span>
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
