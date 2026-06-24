import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getAeronaveTarifas, getAeronavesParaTarifa, upsertAeronaveTarifa,
  getInstructorTarifas, getInstructoresDisponibles, upsertInstructorTarifa,
  getUsuariosPersonal, editarUsuarioPersonal
} from "../../services/administracionApi";
import { fmtFecha } from "../../utils/fechas";

const MOCK_AERONAVES = [
  { id: 1, modelo_aeronave: "Cessna 152",       tarifa_hora_usd: 135.00, vigente_desde: "2026-01-01", vigente_hasta: null },
  { id: 2, modelo_aeronave: "Tomahawk",         tarifa_hora_usd: 135.00, vigente_desde: "2026-01-01", vigente_hasta: null },
  { id: 3, modelo_aeronave: "Cherokee 180",     tarifa_hora_usd: 200.00, vigente_desde: "2026-01-01", vigente_hasta: null },
  { id: 4, modelo_aeronave: "Cherokee Arrow",   tarifa_hora_usd: 220.00, vigente_desde: "2026-01-01", vigente_hasta: null },
  { id: 5, modelo_aeronave: "Bimotor",          tarifa_hora_usd: 600.00, vigente_desde: "2026-01-01", vigente_hasta: null },
  { id: 6, modelo_aeronave: "BATD II",          tarifa_hora_usd:  90.00, vigente_desde: "2026-01-01", vigente_hasta: null },
  { id: 7, modelo_aeronave: "BATD II Bimotor",  tarifa_hora_usd: 105.00, vigente_desde: "2026-01-01", vigente_hasta: null }
];

const MOCK_INST = [
  { id: 1, id_instructor: 1, instructor_nombre: "H. Amaya",   tipo_pago: "MENSUAL_FIJO", salario_mensual_fijo: 800.00, tarifa_hora_vuelo:  0,  tarifa_hora_teoria:  0, vigente_desde: "2026-01-01" },
  { id: 2, id_instructor: 2, instructor_nombre: "C. Cáceres", tipo_pago: "POR_HORA",     salario_mensual_fijo:   0.00, tarifa_hora_vuelo: 32,  tarifa_hora_teoria: 18, vigente_desde: "2026-01-01" },
  { id: 3, id_instructor: 3, instructor_nombre: "J. Burgos",  tipo_pago: "POR_HORA",     salario_mensual_fijo:   0.00, tarifa_hora_vuelo: 30,  tarifa_hora_teoria: 20, vigente_desde: "2026-01-01" },
  { id: 4, id_instructor: 4, instructor_nombre: "S. Muñoz",   tipo_pago: "MIXTO",        salario_mensual_fijo: 500.00, tarifa_hora_vuelo: 18,  tarifa_hora_teoria: 12, vigente_desde: "2026-01-01" }
];

const TIPO_LABEL = {
  MENSUAL_FIJO: { label: "Mensual fijo",      color: "blue",  icon: "bi-cash"        },
  POR_HORA:     { label: "Por hora",          color: "green", icon: "bi-clock-history" },
  MIXTO:        { label: "Mixto",             color: "amber", icon: "bi-gear-wide-connected" }
};

const EMPTY_INST_FORM = {
  id_instructor: "",
  tipo_pago: "POR_HORA",
  salario_mensual_fijo: "",
  tarifa_hora_vuelo: "",
  tarifa_hora_teoria: "",
  es_servicios_profesionales: true,
  vigente_desde: new Date().toISOString().slice(0, 10)
};

const EMPTY_EMP_FORM = {
  cargo: "",
  dui: "",
  nit: "",
  isss_num: "",
  afp_num: "",
  sueldo_base: "",
  es_servicios_profesionales: false
};

const EMPTY_AERO_FORM = {
  id_aeronave: "",
  _modelo: "",            // solo para mostrar el modelo al editar una tarifa existente
  tarifa_hora_usd: "",
  vigente_desde: new Date().toISOString().slice(0, 10)
};

const MOCK_AERONAVES_LISTA = [
  { id_aeronave: 1, codigo: "YS-334-PE", modelo: "CESSNA-152" },
  { id_aeronave: 2, codigo: "YS-333-PE", modelo: "TOMAHAWK" },
  { id_aeronave: 3, codigo: "YS-270-P",  modelo: "CHEROKEE" },
  { id_aeronave: 4, codigo: "YS-127-P",  modelo: "ARROW" }
];

export default function Tarifas() {
  const [aero, setAero] = useState([]);
  const [aeronaves, setAeronaves] = useState([]);
  const [inst, setInst] = useState([]);
  const [instDisp, setInstDisp] = useState([]);
  const [usingMock, setUsingMock] = useState(false);
  const [tab, setTab] = useState("aero");

  const [showAeroForm, setShowAeroForm] = useState(false);
  const [aeroForm, setAeroForm] = useState(EMPTY_AERO_FORM);

  const [showInstForm, setShowInstForm] = useState(false);
  const [instForm, setInstForm] = useState(EMPTY_INST_FORM);
  const [editingInst, setEditingInst] = useState(null);

  const [personal, setPersonal] = useState([]);
  const [showEmpForm, setShowEmpForm] = useState(false);
  const [empForm, setEmpForm] = useState(EMPTY_EMP_FORM);
  const [editingEmp, setEditingEmp] = useState(null);

  const loadPersonal = async () => {
    try {
      const r = await getUsuariosPersonal();
      if (r?.ok) setPersonal(r.data);
    } catch { /* silencioso */ }
  };

  const load = async () => {
    loadPersonal();
    try {
      const [a, av, i, ds] = await Promise.all([getAeronaveTarifas(), getAeronavesParaTarifa(), getInstructorTarifas(), getInstructoresDisponibles()]);
      if (a?.ok && i?.ok) {
        setAero(a.data); setInst(i.data);
        setAeronaves(av?.ok ? av.data : []);
        setInstDisp(ds?.ok ? ds.data : []);
        setUsingMock(false);
      } else throw new Error();
    } catch {
      setAero(MOCK_AERONAVES); setInst(MOCK_INST);
      setAeronaves(MOCK_AERONAVES_LISTA);
      setInstDisp([
        { id_instructor: 1, username: "H. Amaya",   tipo_pago_actual: "MENSUAL_FIJO" },
        { id_instructor: 2, username: "C. Cáceres", tipo_pago_actual: "POR_HORA" },
        { id_instructor: 3, username: "J. Burgos",  tipo_pago_actual: "POR_HORA" },
        { id_instructor: 4, username: "S. Muñoz",   tipo_pago_actual: "MIXTO" },
        { id_instructor: 5, username: "E. Tejada",  tipo_pago_actual: null }
      ]);
      setUsingMock(true);
    }
  };
  useEffect(() => { load(); }, []);

  // ── Aeronave ───────────────────────────────────────────────────────
  const handleSaveAero = async (e) => {
    e.preventDefault();
    if (!aeroForm.id_aeronave || !aeroForm.tarifa_hora_usd) {
      return toast.error("Aeronave y tarifa son requeridos");
    }
    try {
      await upsertAeronaveTarifa({
        id_aeronave: Number(aeroForm.id_aeronave),
        tarifa_hora_usd: Number(aeroForm.tarifa_hora_usd),
        vigente_desde: aeroForm.vigente_desde
      });
      toast.success("Tarifa de aeronave guardada");
      setShowAeroForm(false);
      setAeroForm(EMPTY_AERO_FORM);
      load();
    } catch (e) { toast.error(e?.response?.data?.message || "Error"); }
  };

  const editAeroQuick = (a) => {
    setAeroForm({
      id_aeronave: a.id_aeronave || "",
      _modelo: a.aeronave_codigo ? `${a.aeronave_codigo} — ${a.aeronave_modelo}` : a.modelo_aeronave,
      tarifa_hora_usd: a.tarifa_hora_usd,
      vigente_desde: new Date().toISOString().slice(0, 10)
    });
    setShowAeroForm(true);
  };

  // ── Instructor ─────────────────────────────────────────────────────
  const handleSaveInst = async (e) => {
    e.preventDefault();
    if (!instForm.id_instructor) return toast.error("Selecciona un instructor");

    const tp = instForm.tipo_pago;
    const sal = Number(instForm.salario_mensual_fijo || 0);
    const tv  = Number(instForm.tarifa_hora_vuelo || 0);
    const tt  = Number(instForm.tarifa_hora_teoria || 0);

    if (tp === 'MENSUAL_FIJO' && sal <= 0) return toast.error("El salario mensual debe ser mayor a 0");
    if (tp === 'POR_HORA' && tv <= 0 && tt <= 0) return toast.error("Indica al menos una tarifa por hora");
    if (tp === 'MIXTO' && sal <= 0 && tv <= 0 && tt <= 0) return toast.error("Configura al menos un componente del pago mixto");

    try {
      await upsertInstructorTarifa({
        id_instructor: Number(instForm.id_instructor),
        tipo_pago: tp,
        salario_mensual_fijo: sal,
        tarifa_hora_vuelo: tv,
        tarifa_hora_teoria: tt,
        es_servicios_profesionales: !!instForm.es_servicios_profesionales,
        vigente_desde: instForm.vigente_desde
      });
      toast.success(editingInst ? "Tarifa de instructor actualizada" : "Tarifa de instructor creada");
      setShowInstForm(false);
      setEditingInst(null);
      setInstForm(EMPTY_INST_FORM);
      load();
    } catch (e) { toast.error(e?.response?.data?.message || "Error"); }
  };

  const editInst = (i) => {
    setEditingInst(i);
    setInstForm({
      id_instructor: i.id_instructor,
      tipo_pago: i.tipo_pago || 'POR_HORA',
      salario_mensual_fijo: i.salario_mensual_fijo || "",
      tarifa_hora_vuelo: i.tarifa_hora_vuelo || "",
      tarifa_hora_teoria: i.tarifa_hora_teoria || "",
      es_servicios_profesionales: i.es_servicios_profesionales ?? (i.tipo_pago !== 'MENSUAL_FIJO'),
      vigente_desde: new Date().toISOString().slice(0, 10)
    });
    setShowInstForm(true);
  };

  const newInst = () => {
    setEditingInst(null);
    setInstForm(EMPTY_INST_FORM);
    setShowInstForm(true);
  };

  // ── Personal (nómina) ─────────────────────────────────────────────
  const handleSaveEmp = async (e) => {
    e.preventDefault();
    if (!editingEmp) return;
    const payload = {
      cargo: empForm.cargo || null,
      dui: empForm.dui || null,
      nit: empForm.nit || null,
      isss_num: empForm.isss_num || null,
      afp_num: empForm.afp_num || null,
      sueldo_base: empForm.sueldo_base !== "" ? Number(empForm.sueldo_base) : null,
      es_servicios_profesionales: !!empForm.es_servicios_profesionales
    };
    try {
      await editarUsuarioPersonal(editingEmp.id_usuario, payload);
      toast.success("Datos de nómina actualizados");
      setShowEmpForm(false);
      setEditingEmp(null);
      setEmpForm(EMPTY_EMP_FORM);
      loadPersonal();
    } catch (err) { toast.error(err?.response?.data?.message || "Error"); }
  };

  const editEmp = (p) => {
    setEditingEmp(p);
    setEmpForm({
      cargo: p.cargo || "",
      dui: p.dui || "",
      nit: p.nit || "",
      isss_num: p.isss_num || "",
      afp_num: p.afp_num || "",
      sueldo_base: p.sueldo_base ?? "",
      es_servicios_profesionales: !!(p.es_servicios_profesionales ?? (p.rol !== 'INSTRUCTOR'))
    });
    setShowEmpForm(true);
  };

  return (
    <div>
      <h1 className="adf-section-title"><i className="bi bi-tag"></i>Tarifas</h1>
      <p className="adf-section-subtitle">
        Tarifas por hora de aeronave y modalidad de pago de instructores. Cada cambio queda historiado por fecha.
        {usingMock && <span className="adf-tag amber" style={{ marginLeft: 10 }}>Datos demo</span>}
      </p>

      <div className="adf-card" style={{ display: "flex", gap: 10, padding: "12px 16px" }}>
        <button className={`adf-btn ${tab === 'aero' ? '' : 'secondary'}`} onClick={() => setTab("aero")}>
          <i className="bi bi-airplane"></i>Aeronaves
        </button>
        <button className={`adf-btn ${tab === 'inst' ? '' : 'secondary'}`} onClick={() => setTab("inst")}>
          <i className="bi bi-person-badge"></i>Instructores
        </button>
        <button className={`adf-btn ${tab === 'emp' ? '' : 'secondary'}`} onClick={() => setTab("emp")}>
          <i className="bi bi-people-fill"></i>Empleados (planta)
        </button>
      </div>

      {/* ────────────────── AERONAVES ────────────────── */}
      {tab === "aero" && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button className="adf-btn" onClick={() => { setAeroForm(EMPTY_AERO_FORM); setShowAeroForm(true); }}>
              <i className="bi bi-plus-circle"></i>Nueva tarifa de aeronave
            </button>
          </div>

          {showAeroForm && (
            <div className="adf-card">
              <h3><i className="bi bi-airplane-engines me-2"></i>Tarifa de aeronave</h3>
              <form onSubmit={handleSaveAero}>
                <div className="adf-form-grid">
                  <div className="adf-form-field">
                    <label>Aeronave</label>
                    <select required value={aeroForm.id_aeronave}
                      onChange={(e) => setAeroForm({...aeroForm, id_aeronave: e.target.value})}>
                      <option value="">— Selecciona una aeronave —</option>
                      {aeronaves.map(av => (
                        <option key={av.id_aeronave} value={av.id_aeronave}>
                          {av.codigo} — {av.modelo}
                        </option>
                      ))}
                    </select>
                    {aeroForm._modelo && !aeroForm.id_aeronave && (
                      <p style={{ fontSize: "0.78rem", color: "var(--c-warn-700)", marginTop: 6 }}>
                        Tarifa antigua sin aeronave vinculada ({aeroForm._modelo}). Selecciona la aeronave correspondiente para habilitar el cargo automático.
                      </p>
                    )}
                  </div>
                  <div className="adf-form-field">
                    <label>Tarifa USD/h</label>
                    <input type="number" step="0.01" min="0" required value={aeroForm.tarifa_hora_usd}
                      onChange={(e) => setAeroForm({...aeroForm, tarifa_hora_usd: e.target.value})} />
                  </div>
                  <div className="adf-form-field">
                    <label>Vigente desde</label>
                    <input type="date" value={aeroForm.vigente_desde}
                      onChange={(e) => setAeroForm({...aeroForm, vigente_desde: e.target.value})} />
                  </div>
                </div>
                <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
                  <button type="submit" className="adf-btn"><i className="bi bi-check"></i>Guardar</button>
                  <button type="button" className="adf-btn secondary" onClick={() => setShowAeroForm(false)}>Cancelar</button>
                </div>
                <p style={{ fontSize: "0.78rem", color: "var(--c-ink-3)", marginTop: 10 }}>
                  Al guardar, la tarifa anterior de la misma aeronave se cierra con `vigente_hasta` un día antes del nuevo desde,
                  preservando el historial para vuelos pasados.
                </p>
              </form>
            </div>
          )}

          <table className="adf-table">
            <thead>
              <tr>
                <th>Aeronave</th>
                <th style={{ textAlign: "right" }}>Tarifa USD/h</th>
                <th>Vigente desde</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {aero.map(a => (
                <tr key={a.id}>
                  <td>
                    <i className="bi bi-airplane-engines me-2"></i>
                    <strong>{a.aeronave_codigo ? `${a.aeronave_codigo} — ${a.aeronave_modelo}` : a.modelo_aeronave}</strong>
                    {!a.id_aeronave && (
                      <span title="Tarifa sin aeronave vinculada — el cargo automático no la encontrará"
                        style={{ marginLeft: 8, fontSize: "0.72rem", color: "var(--c-warn-700)" }}>
                        <i className="bi bi-exclamation-triangle"></i> sin vincular
                      </span>
                    )}
                  </td>
                  <td className="amount" style={{ textAlign: "right" }}>${Number(a.tarifa_hora_usd).toFixed(2)}</td>
                  <td style={{ color: "var(--c-ink-3)", fontSize: "0.85rem" }}>{fmtFecha(a.vigente_desde)}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="adf-btn small secondary" onClick={() => editAeroQuick(a)}>
                      <i className="bi bi-pencil"></i>Cambiar tarifa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* ────────────────── INSTRUCTORES ────────────────── */}
      {tab === "inst" && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button className="adf-btn" onClick={newInst}>
              <i className="bi bi-plus-circle"></i>Nueva configuración de instructor
            </button>
          </div>

          {showInstForm && (
            <div className="adf-card">
              <h3>
                <i className="bi bi-person-badge me-2"></i>
                {editingInst ? `Editar tarifa: ${editingInst.instructor_nombre}` : "Nueva configuración de instructor"}
              </h3>
              <form onSubmit={handleSaveInst}>
                <div className="adf-form-grid">
                  <div className="adf-form-field">
                    <label>Instructor</label>
                    <select required value={instForm.id_instructor}
                      disabled={!!editingInst}
                      onChange={(e) => setInstForm({...instForm, id_instructor: e.target.value})}>
                      <option value="">Selecciona...</option>
                      {instDisp.map(d => (
                        <option key={d.id_instructor} value={d.id_instructor}>
                          {d.username} {d.tipo_pago_actual ? `· (${TIPO_LABEL[d.tipo_pago_actual]?.label || d.tipo_pago_actual})` : '· (sin tarifa)'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="adf-form-field">
                    <label>Modalidad de pago</label>
                    <select value={instForm.tipo_pago} onChange={(e) => setInstForm({...instForm, tipo_pago: e.target.value})}>
                      <option value="MENSUAL_FIJO">Mensual fijo</option>
                      <option value="POR_HORA">Por hora (vuelo + teoría)</option>
                      <option value="MIXTO">Mixto (salario + horas)</option>
                    </select>
                  </div>
                  <div className="adf-form-field">
                    <label>Vigente desde</label>
                    <input type="date" value={instForm.vigente_desde}
                      onChange={(e) => setInstForm({...instForm, vigente_desde: e.target.value})} />
                  </div>
                </div>

                {/* Campos condicionales según modalidad */}
                <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px dashed var(--c-line-2)" }}>
                  <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "var(--c-brand-700)", letterSpacing: 0.4, marginBottom: 10 }}>
                    COMPONENTES DEL PAGO
                  </div>

                  <div className="adf-form-grid">
                    {(instForm.tipo_pago === 'MENSUAL_FIJO' || instForm.tipo_pago === 'MIXTO') && (
                      <div className="adf-form-field">
                        <label style={{ color: "var(--c-info-700)" }}>
                          <i className="bi bi-cash me-1"></i>Salario mensual fijo (USD)
                        </label>
                        <input type="number" step="0.01" min="0" value={instForm.salario_mensual_fijo}
                          placeholder="800.00"
                          onChange={(e) => setInstForm({...instForm, salario_mensual_fijo: e.target.value})} />
                      </div>
                    )}

                    {(instForm.tipo_pago === 'POR_HORA' || instForm.tipo_pago === 'MIXTO') && (
                      <>
                        <div className="adf-form-field">
                          <label style={{ color: "var(--c-accent-700)" }}>
                            <i className="bi bi-airplane me-1"></i>Tarifa por hora de VUELO (USD/h)
                          </label>
                          <input type="number" step="0.01" min="0" value={instForm.tarifa_hora_vuelo}
                            placeholder="32.00"
                            onChange={(e) => setInstForm({...instForm, tarifa_hora_vuelo: e.target.value})} />
                        </div>
                        <div className="adf-form-field">
                          <label style={{ color: "var(--c-warn-700)" }}>
                            <i className="bi bi-book me-1"></i>Tarifa por hora de TEORÍA (USD/h)
                          </label>
                          <input type="number" step="0.01" min="0" value={instForm.tarifa_hora_teoria}
                            placeholder="18.00"
                            onChange={(e) => setInstForm({...instForm, tarifa_hora_teoria: e.target.value})} />
                        </div>
                      </>
                    )}
                  </div>

                  {instForm.tipo_pago === 'MIXTO' && (
                    <p style={{ fontSize: "0.78rem", color: "var(--c-ink-3)", marginTop: 8 }}>
                      <i className="bi bi-info-circle me-1"></i>
                      En el modo mixto, el salario fijo se paga mensualmente y se suman los montos por hora voladas / teóricas.
                    </p>
                  )}
                </div>

                <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px dashed var(--c-line-2)" }}>
                  <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "var(--c-brand-700)", letterSpacing: 0.4, marginBottom: 10 }}>
                    PLANILLA
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.9rem", cursor: "pointer" }}>
                    <input type="checkbox" checked={!!instForm.es_servicios_profesionales}
                      onChange={(e) => setInstForm({...instForm, es_servicios_profesionales: e.target.checked})} />
                    <span>
                      <strong>Servicios profesionales</strong> — entra en la planilla de servicios (retención del 10%).
                      <br />
                      <span style={{ fontSize: "0.8rem", color: "var(--c-ink-3)" }}>
                        Desmárcalo para tratarlo como personal de planta (deducciones ISR + ISSS + AFP).
                      </span>
                    </span>
                  </label>
                </div>

                <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
                  <button type="submit" className="adf-btn"><i className="bi bi-check"></i>Guardar configuración</button>
                  <button type="button" className="adf-btn secondary"
                    onClick={() => { setShowInstForm(false); setEditingInst(null); }}>Cancelar</button>
                </div>
              </form>
            </div>
          )}

          <table className="adf-table">
            <thead>
              <tr>
                <th>Instructor</th>
                <th>Modalidad</th>
                <th>Planilla</th>
                <th style={{ textAlign: "right" }}>Mensual fijo</th>
                <th style={{ textAlign: "right" }}>USD / hora vuelo</th>
                <th style={{ textAlign: "right" }}>USD / hora teoría</th>
                <th>Vigente desde</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {inst.map(i => {
                const tl = TIPO_LABEL[i.tipo_pago] || TIPO_LABEL.POR_HORA;
                return (
                  <tr key={i.id}>
                    <td><i className="bi bi-person-circle me-2"></i><strong>{i.instructor_nombre}</strong></td>
                    <td><span className={`adf-tag ${tl.color}`}><i className={`bi ${tl.icon} me-1`}></i>{tl.label}</span></td>
                    <td>
                      {(i.es_servicios_profesionales ?? (i.tipo_pago !== 'MENSUAL_FIJO'))
                        ? <span className="adf-tag green">Servicios 10%</span>
                        : <span className="adf-tag blue">Planta ISR</span>}
                    </td>
                    <td className="amount" style={{ textAlign: "right", color: i.tipo_pago === 'POR_HORA' ? 'var(--c-ink-4)' : 'var(--c-ink-1)' }}>
                      ${Number(i.salario_mensual_fijo || 0).toFixed(2)}
                    </td>
                    <td className="amount" style={{ textAlign: "right", color: i.tipo_pago === 'MENSUAL_FIJO' ? 'var(--c-ink-4)' : 'var(--c-ink-1)' }}>
                      ${Number(i.tarifa_hora_vuelo || 0).toFixed(2)}
                    </td>
                    <td className="amount" style={{ textAlign: "right", color: i.tipo_pago === 'MENSUAL_FIJO' ? 'var(--c-ink-4)' : 'var(--c-ink-1)' }}>
                      ${Number(i.tarifa_hora_teoria || 0).toFixed(2)}
                    </td>
                    <td style={{ color: "var(--c-ink-3)", fontSize: "0.85rem" }}>{fmtFecha(i.vigente_desde)}</td>
                    <td style={{ textAlign: "right" }}>
                      <button className="adf-btn small secondary" onClick={() => editInst(i)}>
                        <i className="bi bi-pencil"></i>Editar
                      </button>
                    </td>
                  </tr>
                );
              })}
              {inst.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--c-ink-4)", padding: 30 }}>
                  No hay tarifas de instructor configuradas. Crea la primera con el botón verde.
                </td></tr>
              )}
            </tbody>
          </table>
        </>
      )}

      {/* ────────────────── PERSONAL / NÓMINA ────────────────── */}
      {tab === "emp" && (
        <>
          <p className="adf-section-subtitle" style={{ marginTop: 4 }}>
            Todo el personal con acceso al sistema. Aquí configuras sus datos de nómina (sueldo, DUI, AFP, ISSS).
            Para <strong>crear o desactivar</strong> usuarios ve a <strong>Usuarios → Personal</strong>.
          </p>

          {showEmpForm && editingEmp && (
            <div className="adf-card">
              <h3>
                <i className="bi bi-person-vcard me-2"></i>
                Datos de nómina — {editingEmp.nombre} {editingEmp.apellido}
                <span className="adf-tag blue" style={{ marginLeft: 10, fontSize: "0.75rem" }}>{editingEmp.rol}</span>
              </h3>
              <form onSubmit={handleSaveEmp}>
                <div className="adf-form-grid">
                  <div className="adf-form-field">
                    <label>Cargo</label>
                    <input value={empForm.cargo} placeholder="Secretaria, Jefe de operaciones..."
                      onChange={(e) => setEmpForm({...empForm, cargo: e.target.value})} />
                  </div>
                  <div className="adf-form-field">
                    <label><i className="bi bi-cash me-1"></i>Sueldo base mensual (USD)</label>
                    <input type="number" step="0.01" min="0" value={empForm.sueldo_base} placeholder="600.00"
                      onChange={(e) => setEmpForm({...empForm, sueldo_base: e.target.value})} />
                  </div>
                  <div className="adf-form-field">
                    <label>DUI</label>
                    <input value={empForm.dui}
                      onChange={(e) => setEmpForm({...empForm, dui: e.target.value})} />
                  </div>
                  <div className="adf-form-field">
                    <label>NIT</label>
                    <input value={empForm.nit}
                      onChange={(e) => setEmpForm({...empForm, nit: e.target.value})} />
                  </div>
                  <div className="adf-form-field">
                    <label>N° ISSS</label>
                    <input value={empForm.isss_num}
                      onChange={(e) => setEmpForm({...empForm, isss_num: e.target.value})} />
                  </div>
                  <div className="adf-form-field">
                    <label>N° AFP</label>
                    <input value={empForm.afp_num}
                      onChange={(e) => setEmpForm({...empForm, afp_num: e.target.value})} />
                  </div>
                </div>
                <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px dashed var(--c-line-2)" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.9rem", cursor: "pointer" }}>
                    <input type="checkbox" checked={!!empForm.es_servicios_profesionales}
                      onChange={(e) => setEmpForm({...empForm, es_servicios_profesionales: e.target.checked})} />
                    <span>
                      <strong>Servicios profesionales</strong> — planilla de servicios (retención del 10%).
                      <br />
                      <span style={{ fontSize: "0.8rem", color: "var(--c-ink-3)" }}>
                        Desmárcalo para personal de planta (deducciones ISR + ISSS + AFP).
                      </span>
                    </span>
                  </label>
                </div>
                <div style={{ marginTop: 18, display: "flex", gap: 10 }}>
                  <button type="submit" className="adf-btn"><i className="bi bi-check"></i>Guardar</button>
                  <button type="button" className="adf-btn secondary"
                    onClick={() => { setShowEmpForm(false); setEditingEmp(null); }}>Cancelar</button>
                </div>
              </form>
            </div>
          )}

          <table className="adf-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Rol</th>
                <th>Cargo</th>
                <th>Planilla</th>
                <th style={{ textAlign: "right" }}>Sueldo base</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {personal.map(p => (
                <tr key={p.id_usuario}>
                  <td><i className="bi bi-person-circle me-2"></i><strong>{p.nombre} {p.apellido}</strong></td>
                  <td><span className="adf-tag blue" style={{ fontSize: "0.75rem" }}>{p.rol}</span></td>
                  <td style={{ color: "var(--c-ink-3)" }}>{p.cargo || "—"}</td>
                  <td>
                    {p.id_empleado
                      ? (p.es_servicios_profesionales
                          ? <span className="adf-tag green">Servicios 10%</span>
                          : <span className="adf-tag blue">Planta ISR</span>)
                      : <span className="adf-tag amber">Sin configurar</span>}
                  </td>
                  <td className="amount" style={{ textAlign: "right" }}>
                    {p.id_empleado ? `$${Number(p.sueldo_base || 0).toFixed(2)}` : "—"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button className="adf-btn small secondary" onClick={() => editEmp(p)}>
                      <i className="bi bi-pencil"></i>Editar nómina
                    </button>
                  </td>
                </tr>
              ))}
              {personal.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--c-ink-4)", padding: 30 }}>
                  No hay personal registrado. Crea usuarios desde <strong>Usuarios → Personal</strong>.
                </td></tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
