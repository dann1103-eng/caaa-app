import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getNominaPeriodos, getNominaDetalles, calcularNomina,
  aprobarNomina, pagarNomina, editarNominaDetalle, anularNomina,
  getConfigFiscal, updateConfigFiscal, abrirPlanillaPDF, abrirReciboNominaPDF,
} from "../../services/administracionApi";

const MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const PLANILLA_META = {
  PLANTA:    { label: "Planta (ISR + ISSS + AFP)", color: "blue",  icon: "bi-bank" },
  SERVICIOS: { label: "Servicios prof. (10%)",     color: "green", icon: "bi-briefcase" },
};

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const periodoLabel = (p) =>
  p.mes ? `${MESES[p.mes]} ${p.anio}`
        : `${String(p.periodo_inicio).slice(0, 10)} → ${String(p.periodo_fin).slice(0, 10)}`;

function aplicarTramos(base, tramos) {
  const b = Number(base) || 0;
  if (b <= 0 || !Array.isArray(tramos)) return 0;
  for (const t of tramos) {
    const upper = t.to == null ? Infinity : Number(t.to);
    if (b >= Number(t.from) && b <= upper)
      return r2(Math.max(0, b - Number(t.baseSubtract || 0)) * Number(t.rate || 0) + Number(t.fixed || 0));
  }
  const last = tramos[tramos.length - 1];
  return last ? r2(Math.max(0, b - Number(last.baseSubtract || 0)) * Number(last.rate || 0) + Number(last.fixed || 0)) : 0;
}
function dedPlanta(bruto, cfg) {
  if (!cfg) return { isr: 0, isss: 0, afp: 0 };
  const g = Math.max(0, Number(bruto) || 0);
  const isss = r2(Math.min(g, Number(cfg.isss_tope_usd)) * Number(cfg.isss_empleado_rate));
  const afpBase = cfg.afp_tope_usd != null ? Math.min(g, Number(cfg.afp_tope_usd)) : g;
  const afp = r2(afpBase * Number(cfg.afp_empleado_rate));
  const isr = aplicarTramos(r2(g - isss - afp), cfg.isr_tramos_json);
  return { isr, isss, afp };
}

const now = new Date();

export default function Nomina() {
  const [periodos, setPeriodos] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [activeEstado, setActiveEstado] = useState(null);
  const [activeTipo, setActiveTipo] = useState("SERVICIOS");
  const [detalles, setDetalles] = useState([]);

  const [cfg, setCfg] = useState(null);            // config fiscal vigente (decimales)
  const [showCalc, setShowCalc] = useState(false);
  const [calcForm, setCalcForm] = useState({
    anio: now.getFullYear(), mes: now.getMonth() + 1, tipo_planilla: "SERVICIOS",
  });

  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});

  // ── Configuración fiscal ──
  const [showCfg, setShowCfg] = useState(false);
  const [cfgForm, setCfgForm] = useState(null);

  const loadPeriodos = async () => {
    try { const r = await getNominaPeriodos(); if (r?.ok) setPeriodos(r.data); } catch { /* */ }
  };
  const loadConfig = async () => {
    try {
      const r = await getConfigFiscal();
      if (r?.ok) { setCfg(r.data); setCfgForm(toForm(r.data)); }
    } catch { /* */ }
  };
  const loadDetalles = async (p) => {
    setActiveId(p.id); setActiveEstado(p.estado); setActiveTipo(p.tipo_planilla || "SERVICIOS");
    try { const r = await getNominaDetalles(p.id); setDetalles(r?.ok ? r.data : []); } catch { setDetalles([]); }
  };
  useEffect(() => { loadPeriodos(); loadConfig(); }, []);

  const handleCalcular = async (e) => {
    e.preventDefault();
    try {
      await calcularNomina({ anio: Number(calcForm.anio), mes: Number(calcForm.mes), tipo_planilla: calcForm.tipo_planilla });
      toast.success(`Planilla de ${MESES[calcForm.mes]} ${calcForm.anio} generada. Ajusta antes de aprobar.`);
      setShowCalc(false);
      loadPeriodos();
    } catch (e) { toast.error(e?.response?.data?.message || "Error"); }
  };

  const handleAnular = async (p) => {
    const adv = p.estado === "PAGADA"
      ? "Esta planilla está PAGADA. Anularla revertirá el egreso registrado y los pagos de teoría. "
      : "";
    const motivo = window.prompt(`${adv}Motivo de anulación de "${periodoLabel(p)}":`, "");
    if (motivo === null) return;
    try {
      await anularNomina(p.id, motivo);
      toast.success("Planilla anulada");
      if (activeId === p.id) { setActiveId(null); setDetalles([]); }
      loadPeriodos();
    } catch (e) { toast.error(e?.response?.data?.message || "Error"); }
  };

  const openEditar = (d) => {
    setEditing(d);
    setEditForm({
      horas_voladas: d.horas_voladas ?? 0, tarifa_hora: d.tarifa_hora ?? 0,
      horas_teoricas: d.horas_teoricas ?? 0, tarifa_hora_teoria: d.tarifa_hora_teoria ?? 0,
      salario_mensual: d.salario_mensual ?? 0, bonos: d.bonos ?? 0,
      descuentos: d.descuentos ?? 0, observaciones: d.observaciones ?? "",
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

  // ── Config fiscal: form helpers (DB guarda decimales; UI muestra %) ──
  function toForm(c) {
    return {
      isss_empleado_rate: pct(c.isss_empleado_rate), isss_patrono_rate: pct(c.isss_patrono_rate),
      isss_tope_usd: c.isss_tope_usd ?? "",
      afp_empleado_rate: pct(c.afp_empleado_rate), afp_patrono_rate: pct(c.afp_patrono_rate),
      afp_tope_usd: c.afp_tope_usd ?? "",
      servicios_isr_rate: pct(c.servicios_isr_rate),
      isr_tramos_json: (c.isr_tramos_json || []).map(t => ({
        from: t.from, to: t.to == null ? "" : t.to, rate: pct(t.rate),
        fixed: t.fixed, baseSubtract: t.baseSubtract,
      })),
      notas: c.notas || "",
    };
  }
  function pct(x) { return +(Number(x || 0) * 100).toFixed(4); }
  function unpct(x) { return +(Number(x || 0) / 100).toFixed(6); }

  const setTramo = (i, k, v) =>
    setCfgForm(f => ({ ...f, isr_tramos_json: f.isr_tramos_json.map((t, j) => j === i ? { ...t, [k]: v } : t) }));
  const addTramo = () =>
    setCfgForm(f => ({ ...f, isr_tramos_json: [...f.isr_tramos_json, { from: 0, to: "", rate: 0, fixed: 0, baseSubtract: 0 }] }));
  const delTramo = (i) =>
    setCfgForm(f => ({ ...f, isr_tramos_json: f.isr_tramos_json.filter((_, j) => j !== i) }));

  const handleGuardarConfig = async () => {
    try {
      const payload = {
        isss_empleado_rate: unpct(cfgForm.isss_empleado_rate),
        isss_patrono_rate: unpct(cfgForm.isss_patrono_rate),
        isss_tope_usd: Number(cfgForm.isss_tope_usd || 0),
        afp_empleado_rate: unpct(cfgForm.afp_empleado_rate),
        afp_patrono_rate: unpct(cfgForm.afp_patrono_rate),
        afp_tope_usd: cfgForm.afp_tope_usd === "" ? null : Number(cfgForm.afp_tope_usd),
        servicios_isr_rate: unpct(cfgForm.servicios_isr_rate),
        isr_tramos_json: cfgForm.isr_tramos_json.map(t => ({
          from: Number(t.from || 0), to: t.to === "" || t.to == null ? null : Number(t.to),
          rate: unpct(t.rate), fixed: Number(t.fixed || 0), baseSubtract: Number(t.baseSubtract || 0),
        })),
        notas: cfgForm.notas || null,
      };
      const r = await updateConfigFiscal(payload);
      if (r?.ok) { setCfg(r.data); setCfgForm(toForm(r.data)); toast.success("Configuración fiscal guardada"); }
    } catch (e) { toast.error(e?.response?.data?.message || "Error"); }
  };

  // ── Cálculo en vivo del editor ──
  const esPlanta = activeTipo === "PLANTA";
  const liveBruto =
    Number(editForm.horas_voladas || 0) * Number(editForm.tarifa_hora || 0) +
    Number(editForm.horas_teoricas || 0) * Number(editForm.tarifa_hora_teoria || 0) +
    Number(editForm.salario_mensual || 0) + Number(editForm.bonos || 0);
  const liveDed = esPlanta ? dedPlanta(liveBruto, cfg) : { isr: 0, isss: 0, afp: 0 };
  const liveRet = esPlanta ? 0 : r2(liveBruto * Number(cfg?.servicios_isr_rate || 0.1));
  const liveNeto = liveBruto - liveDed.isr - liveDed.isss - liveDed.afp - liveRet - Number(editForm.descuentos || 0);

  const totalNeto = detalles.reduce((s, d) => s + Number(d.total || 0), 0);
  const totalBruto = detalles.reduce((s, d) => s + Number(d.bruto || 0), 0);
  const totalDed = detalles.reduce((s, d) => s + Number(d.isr || 0) + Number(d.isss || 0) + Number(d.afp || 0) + Number(d.retencion || 0), 0);
  const totalPatronal = detalles.reduce((s, d) => s + Number(d.costo_patronal || 0), 0);

  return (
    <div>
      <h1 className="adf-section-title"><i className="bi bi-people-fill"></i>Nómina</h1>
      <p className="adf-section-subtitle">
        Dos planillas: <strong>Planta</strong> (mensual fijo, ISR + ISSS + AFP) y
        <strong> Servicios profesionales</strong> (retención). Las tasas y tramos se editan en
        <strong> Configuración fiscal</strong>. Se genera por <strong>mes</strong>.
      </p>

      {/* ── Configuración fiscal (colapsable) ── */}
      <div className="adf-acc">
        <button type="button" className="adf-acc__head" onClick={() => setShowCfg(s => !s)}>
          <span className="adf-acc__title"><i className="bi bi-sliders"></i>Configuración fiscal
            {cfg?.vigente_desde && <span className="adf-acc__count" style={{ textTransform: "none" }}>desde {String(cfg.vigente_desde).slice(0, 10)}</span>}
          </span>
          <i className={`bi bi-chevron-down adf-acc__chev ${showCfg ? "open" : ""}`}></i>
        </button>
        {showCfg && cfgForm && (
          <div className="adf-acc__body">
            <div className="adf-form-grid">
              <div className="adf-form-field"><label>ISSS empleado (%)</label>
                <input type="number" step="0.01" value={cfgForm.isss_empleado_rate} onChange={e => setCfgForm({ ...cfgForm, isss_empleado_rate: e.target.value })} /></div>
              <div className="adf-form-field"><label>ISSS patrono (%)</label>
                <input type="number" step="0.01" value={cfgForm.isss_patrono_rate} onChange={e => setCfgForm({ ...cfgForm, isss_patrono_rate: e.target.value })} /></div>
              <div className="adf-form-field"><label>ISSS tope salario (USD)</label>
                <input type="number" step="0.01" value={cfgForm.isss_tope_usd} onChange={e => setCfgForm({ ...cfgForm, isss_tope_usd: e.target.value })} /></div>
              <div className="adf-form-field"><label>AFP empleado (%)</label>
                <input type="number" step="0.01" value={cfgForm.afp_empleado_rate} onChange={e => setCfgForm({ ...cfgForm, afp_empleado_rate: e.target.value })} /></div>
              <div className="adf-form-field"><label>AFP patrono (%)</label>
                <input type="number" step="0.01" value={cfgForm.afp_patrono_rate} onChange={e => setCfgForm({ ...cfgForm, afp_patrono_rate: e.target.value })} /></div>
              <div className="adf-form-field"><label>AFP tope (USD, vacío = sin tope)</label>
                <input type="number" step="0.01" value={cfgForm.afp_tope_usd} onChange={e => setCfgForm({ ...cfgForm, afp_tope_usd: e.target.value })} /></div>
              <div className="adf-form-field"><label>Retención servicios profesionales (%)</label>
                <input type="number" step="0.01" value={cfgForm.servicios_isr_rate} onChange={e => setCfgForm({ ...cfgForm, servicios_isr_rate: e.target.value })} /></div>
            </div>

            <div style={{ marginTop: 16, fontWeight: 700, fontSize: "0.85rem", color: "var(--c-ink-2)" }}>
              Tramos ISR (la base gravable es bruto − ISSS − AFP)
            </div>
            <div className="adf-acc__body" style={{ padding: 0, border: "none" }}>
              <table className="adf-table" style={{ marginTop: 8 }}>
                <thead><tr>
                  <th>Desde (USD)</th><th>Hasta (USD)</th><th>Tasa (%)</th><th>Cuota fija (USD)</th><th>Resta base (USD)</th><th></th>
                </tr></thead>
                <tbody>
                  {cfgForm.isr_tramos_json.map((t, i) => (
                    <tr key={i}>
                      <td><input type="number" step="0.01" value={t.from} onChange={e => setTramo(i, "from", e.target.value)} style={{ width: 110 }} /></td>
                      <td><input type="number" step="0.01" placeholder="∞" value={t.to} onChange={e => setTramo(i, "to", e.target.value)} style={{ width: 110 }} /></td>
                      <td><input type="number" step="0.01" value={t.rate} onChange={e => setTramo(i, "rate", e.target.value)} style={{ width: 90 }} /></td>
                      <td><input type="number" step="0.01" value={t.fixed} onChange={e => setTramo(i, "fixed", e.target.value)} style={{ width: 110 }} /></td>
                      <td><input type="number" step="0.01" value={t.baseSubtract} onChange={e => setTramo(i, "baseSubtract", e.target.value)} style={{ width: 110 }} /></td>
                      <td style={{ textAlign: "right" }}>
                        <button className="adf-btn small secondary" onClick={() => delTramo(i)} title="Quitar tramo"><i className="bi bi-trash"></i></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="adf-btn small secondary" style={{ marginTop: 8 }} onClick={addTramo}><i className="bi bi-plus"></i>Agregar tramo</button>
            </div>

            <div className="adf-form-field" style={{ marginTop: 12 }}>
              <label>Notas</label>
              <input value={cfgForm.notas} onChange={e => setCfgForm({ ...cfgForm, notas: e.target.value })} />
            </div>
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--c-line-1)", display: "flex", gap: 14, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
              <div className="adf-note" style={{ maxWidth: "42rem" }}>
                <i className="bi bi-info-circle"></i>
                <span>Tabla de retención mensual de El Salvador. ISR sobre base = bruto − ISSS − AFP.
                  <strong> Guardar configuración</strong> crea una nueva versión vigente desde hoy (no afecta planillas ya aprobadas).</span>
              </div>
              <button className="adf-btn" onClick={handleGuardarConfig}><i className="bi bi-check"></i>Guardar configuración</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Generar planilla ── */}
      <div className="adf-card" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <h3 style={{ margin: 0 }}><i className="bi bi-calendar3 me-2"></i>Periodos de nómina</h3>
        <button className="adf-btn" onClick={() => setShowCalc(!showCalc)}><i className="bi bi-calculator"></i>Generar planilla</button>
      </div>

      {showCalc && (
        <div className="adf-card">
          <form onSubmit={handleCalcular}>
            <div className="adf-form-grid">
              <div className="adf-form-field">
                <label>Tipo de planilla</label>
                <select value={calcForm.tipo_planilla} onChange={e => setCalcForm({ ...calcForm, tipo_planilla: e.target.value })}>
                  <option value="SERVICIOS">Servicios profesionales (retención)</option>
                  <option value="PLANTA">Planta — mensual fijo (ISR + ISSS + AFP)</option>
                </select>
              </div>
              <div className="adf-form-field">
                <label>Mes</label>
                <select value={calcForm.mes} onChange={e => setCalcForm({ ...calcForm, mes: Number(e.target.value) })}>
                  {MESES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div className="adf-form-field">
                <label>Año</label>
                <input type="number" min="2020" max="2100" value={calcForm.anio}
                  onChange={e => setCalcForm({ ...calcForm, anio: Number(e.target.value) })} />
              </div>
            </div>
            <p style={{ fontSize: "0.85rem", color: "var(--c-ink-3)", marginTop: 10 }}>
              Se genera del 1 al último día del mes. Entran las personas cuyo selector de planilla coincide con el tipo. Edita antes de aprobar.
            </p>
            <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
              <button type="submit" className="adf-btn"><i className="bi bi-check"></i>Generar</button>
              <button type="button" className="adf-btn secondary" onClick={() => setShowCalc(false)}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      <table className="adf-table">
        <thead><tr>
          <th>Periodo</th><th>Planilla</th><th>Estado</th><th>Personas</th>
          <th style={{ textAlign: "right" }}>Neto USD</th><th style={{ textAlign: "right" }}>Costo patronal</th><th></th>
        </tr></thead>
        <tbody>
          {periodos.map(p => {
            const pm = PLANILLA_META[p.tipo_planilla] || PLANILLA_META.SERVICIOS;
            const anulada = p.estado === "ANULADA";
            return (
              <tr key={p.id} style={{ background: activeId === p.id ? "var(--c-surface-2)" : "transparent", opacity: anulada ? 0.6 : 1 }}>
                <td><strong>{periodoLabel(p)}</strong></td>
                <td><span className={`adf-tag ${pm.color}`}><i className={`bi ${pm.icon} me-1`}></i>{pm.label}</span></td>
                <td>
                  {p.estado === "PAGADA" && <span className="adf-tag green">PAGADA</span>}
                  {p.estado === "APROBADA" && <span className="adf-tag blue">APROBADA</span>}
                  {p.estado === "BORRADOR" && <span className="adf-tag amber">BORRADOR</span>}
                  {anulada && <span className="adf-tag">ANULADA</span>}
                </td>
                <td>{p.instructores_count}</td>
                <td className="amount" style={{ textAlign: "right" }}>{money(p.total_periodo)}</td>
                <td className="amount" style={{ textAlign: "right", color: "var(--c-ink-3)" }}>{Number(p.costo_patronal_total) > 0 ? money(p.costo_patronal_total) : "—"}</td>
                <td style={{ textAlign: "right" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                    <button className="adf-icon-btn" onClick={() => loadDetalles(p)} title="Ver detalle"><i className="bi bi-eye"></i></button>
                    <button className="adf-icon-btn" onClick={() => abrirPlanillaPDF(p.id)} title="Descargar PDF"><i className="bi bi-file-earmark-pdf"></i></button>
                    {p.estado === "BORRADOR" && (
                      <button className="adf-btn small" style={{ marginLeft: 4 }}
                        onClick={async () => { await aprobarNomina(p.id); toast.success("Aprobada"); loadPeriodos(); }}>Aprobar</button>
                    )}
                    {p.estado === "APROBADA" && (
                      <button className="adf-btn small" style={{ marginLeft: 4 }}
                        onClick={async () => { await pagarNomina(p.id); toast.success("Pagada (egreso registrado)"); loadPeriodos(); }}>Marcar pagada</button>
                    )}
                    {!anulada && (
                      <button className="adf-icon-btn danger" onClick={() => handleAnular(p)} title="Anular"><i className="bi bi-x-circle"></i></button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {periodos.length === 0 && (
            <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--c-ink-4)", padding: 30 }}>No hay planillas. Genera la primera.</td></tr>
          )}
        </tbody>
      </table>

      {activeId && (
        <div className="adf-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <h3 style={{ margin: 0 }}>
              <i className="bi bi-list-ul me-2"></i>Detalle — {periodoLabel(periodos.find(p => p.id === activeId) || {})}
              <span className={`adf-tag ${PLANILLA_META[activeTipo].color}`} style={{ marginLeft: 10 }}>
                <i className={`bi ${PLANILLA_META[activeTipo].icon} me-1`}></i>{PLANILLA_META[activeTipo].label}
              </span>
            </h3>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: "0.88rem", color: "var(--c-ink-3)" }}>Total neto: <strong style={{ color: "var(--c-brand-700)", fontSize: "1.05rem" }}>{money(totalNeto)}</strong></span>
              <button className="adf-btn small secondary" onClick={() => abrirPlanillaPDF(activeId)}><i className="bi bi-file-earmark-pdf"></i>PDF</button>
            </div>
          </div>

          <div className="adf-table-wrap">
          <table className="adf-table adf-table--wide">
            <thead>
              {esPlanta ? (
                <tr><th>Empleado / Instructor</th><th style={{ textAlign: "right" }}>Bruto</th><th style={{ textAlign: "right" }}>ISR</th>
                  <th style={{ textAlign: "right" }}>ISSS</th><th style={{ textAlign: "right" }}>AFP</th><th style={{ textAlign: "right" }}>Bonos</th>
                  <th style={{ textAlign: "right" }}>Desc.</th><th style={{ textAlign: "right" }}>NETO</th><th style={{ textAlign: "right" }}>C. patronal</th><th></th></tr>
              ) : (
                <tr><th>Instructor / Empleado</th><th style={{ textAlign: "right" }}>H. Vuelo</th><th style={{ textAlign: "right" }}>Teoría</th>
                  <th style={{ textAlign: "right" }}>Bruto</th><th style={{ textAlign: "right" }}>Ret.</th><th style={{ textAlign: "right" }}>Bonos</th>
                  <th style={{ textAlign: "right" }}>Desc.</th><th style={{ textAlign: "right" }}>NETO</th><th></th></tr>
              )}
            </thead>
            <tbody>
              {detalles.map(d => {
                const acciones = (
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                      {activeEstado !== "PAGADA" && activeEstado !== "ANULADA" && (
                        <button className="adf-icon-btn" onClick={() => openEditar(d)} title="Editar"><i className="bi bi-pencil"></i></button>
                      )}
                      <button className="adf-icon-btn" onClick={() => abrirReciboNominaPDF(d.id)} title="Recibo PDF"><i className="bi bi-receipt"></i></button>
                    </div>
                  </td>
                );
                const nombre = (
                  <td><i className="bi bi-person-circle me-2"></i><strong>{d.instructor_username}</strong>
                    {d.empleado_cargo && <span style={{ marginLeft: 6, fontSize: "0.78rem", color: "var(--c-ink-3)" }}>({d.empleado_cargo})</span>}
                    {d.firmado_en && <i className="bi bi-check2-circle" title="Recibo firmado" style={{ marginLeft: 6, color: "var(--c-accent-700)" }}></i>}
                  </td>
                );
                return esPlanta ? (
                  <tr key={d.id}>
                    {nombre}
                    <td className="amount" style={{ textAlign: "right" }}>{money(d.bruto)}</td>
                    <td className="amount neg" style={{ textAlign: "right" }}>-{money(d.isr)}</td>
                    <td className="amount neg" style={{ textAlign: "right" }}>-{money(d.isss)}</td>
                    <td className="amount neg" style={{ textAlign: "right" }}>-{money(d.afp)}</td>
                    <td className="amount pos" style={{ textAlign: "right" }}>+{money(d.bonos)}</td>
                    <td className="amount neg" style={{ textAlign: "right" }}>-{money(d.descuentos)}</td>
                    <td className="amount" style={{ textAlign: "right", fontWeight: 800 }}>{money(d.total)}</td>
                    <td className="amount" style={{ textAlign: "right", color: "var(--c-ink-3)" }}>{money(d.costo_patronal)}</td>
                    {acciones}
                  </tr>
                ) : (
                  <tr key={d.id}>
                    {nombre}
                    <td className="amount" style={{ textAlign: "right" }}>{Number(d.horas_voladas).toFixed(1)}</td>
                    <td className="amount" style={{ textAlign: "right", color: "var(--c-warn-700)" }}>{money(d.monto_teorico)}</td>
                    <td className="amount" style={{ textAlign: "right" }}>{money(d.bruto)}</td>
                    <td className="amount neg" style={{ textAlign: "right" }}>-{money(d.retencion)}</td>
                    <td className="amount pos" style={{ textAlign: "right" }}>+{money(d.bonos)}</td>
                    <td className="amount neg" style={{ textAlign: "right" }}>-{money(d.descuentos)}</td>
                    <td className="amount" style={{ textAlign: "right", fontWeight: 800 }}>{money(d.total)}</td>
                    {acciones}
                  </tr>
                );
              })}
              {detalles.length === 0 && (
                <tr><td colSpan={esPlanta ? 10 : 9} style={{ textAlign: "center", padding: 30, color: "var(--c-ink-4)" }}>No hay detalles en este periodo.</td></tr>
              )}
            </tbody>
          </table>
          </div>

          <div style={{ marginTop: 16, padding: 14, background: "var(--c-surface-2)", borderRadius: 10,
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
            <div style={{ background: "white", padding: 10, borderRadius: 8 }}>
              <div style={{ fontSize: "0.75rem", color: "var(--c-ink-3)" }}>Total bruto</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 800 }}>{money(totalBruto)}</div>
            </div>
            <div style={{ background: "white", padding: 10, borderRadius: 8 }}>
              <div style={{ fontSize: "0.75rem", color: "var(--c-ink-3)" }}>{esPlanta ? "Deducciones (ISR+ISSS+AFP)" : "Retención"}</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--c-danger-700)" }}>-{money(totalDed)}</div>
            </div>
            <div style={{ background: "white", padding: 10, borderRadius: 8 }}>
              <div style={{ fontSize: "0.75rem", color: "var(--c-ink-3)" }}>Total neto a pagar</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--c-brand-700)" }}>{money(totalNeto)}</div>
            </div>
            {esPlanta && (
              <div style={{ background: "white", padding: 10, borderRadius: 8 }}>
                <div style={{ fontSize: "0.75rem", color: "var(--c-ink-3)" }}>Costo patronal total</div>
                <div style={{ fontSize: "1.1rem", fontWeight: 800 }}>{money(totalPatronal)}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {editing && (
        <div className="adf-card">
          <h3><i className="bi bi-pencil-square me-2" style={{ color: "var(--c-brand-700)" }}></i>Editar pago de {editing.instructor_username}</h3>
          <p style={{ color: "var(--c-ink-3)", fontSize: "0.85rem", marginTop: -10 }}>
            Planilla <strong>{PLANILLA_META[activeTipo].label}</strong>. El neto y las deducciones se recalculan al guardar.
          </p>
          <form onSubmit={handleGuardarEdicion}>
            <div className="adf-form-grid">
              <div className="adf-form-field">
                <label style={{ color: "var(--c-info-700)" }}><i className="bi bi-cash me-1"></i>{esPlanta ? "Sueldo / salario mensual" : "Monto base (empleados)"}</label>
                <input type="number" step="0.01" value={editForm.salario_mensual} onChange={e => setEditForm({ ...editForm, salario_mensual: e.target.value })} />
              </div>
              {!esPlanta && (<>
                <div className="adf-form-field"><label style={{ color: "var(--c-accent-700)" }}><i className="bi bi-airplane me-1"></i>Horas voladas</label>
                  <input type="number" step="0.1" value={editForm.horas_voladas} onChange={e => setEditForm({ ...editForm, horas_voladas: e.target.value })} /></div>
                <div className="adf-form-field"><label style={{ color: "var(--c-accent-700)" }}>Tarifa USD/h vuelo</label>
                  <input type="number" step="0.01" value={editForm.tarifa_hora} onChange={e => setEditForm({ ...editForm, tarifa_hora: e.target.value })} /></div>
                <div className="adf-form-field"><label style={{ color: "var(--c-warn-700)" }}><i className="bi bi-book me-1"></i>Horas teóricas</label>
                  <input type="number" step="0.1" value={editForm.horas_teoricas} onChange={e => setEditForm({ ...editForm, horas_teoricas: e.target.value })} /></div>
                <div className="adf-form-field"><label style={{ color: "var(--c-warn-700)" }}>Tarifa USD/h teoría</label>
                  <input type="number" step="0.01" value={editForm.tarifa_hora_teoria} onChange={e => setEditForm({ ...editForm, tarifa_hora_teoria: e.target.value })} /></div>
              </>)}
              <div className="adf-form-field"><label style={{ color: "var(--c-accent-700)" }}>Bonos (+)</label>
                <input type="number" step="0.01" min="0" value={editForm.bonos} onChange={e => setEditForm({ ...editForm, bonos: e.target.value })} /></div>
              <div className="adf-form-field"><label style={{ color: "var(--c-danger-700)" }}>Descuentos (-)</label>
                <input type="number" step="0.01" min="0" value={editForm.descuentos} onChange={e => setEditForm({ ...editForm, descuentos: e.target.value })} /></div>
              <div className="adf-form-field" style={{ gridColumn: "1 / -1" }}><label>Observaciones</label>
                <input value={editForm.observaciones} onChange={e => setEditForm({ ...editForm, observaciones: e.target.value })} /></div>
            </div>

            <div style={{ marginTop: 14, padding: "10px 16px", background: "white", borderRadius: 10, display: "flex", flexWrap: "wrap", gap: 18, fontSize: "0.85rem" }}>
              <span>Bruto: <strong>{money(liveBruto)}</strong></span>
              {esPlanta ? (<>
                <span style={{ color: "var(--c-danger-700)" }}>ISR: -{money(liveDed.isr)}</span>
                <span style={{ color: "var(--c-danger-700)" }}>ISSS: -{money(liveDed.isss)}</span>
                <span style={{ color: "var(--c-danger-700)" }}>AFP: -{money(liveDed.afp)}</span>
              </>) : (
                <span style={{ color: "var(--c-danger-700)" }}>Retención: -{money(liveRet)}</span>
              )}
            </div>
            <div style={{ marginTop: 10, padding: "12px 16px", background: "var(--c-brand-700)", color: "white", borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ opacity: 0.9 }}>Neto a pagar:</span>
              <span style={{ fontSize: "1.4rem", fontWeight: 800 }}>{money(liveNeto)}</span>
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
