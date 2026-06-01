import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { getCursos, crearCurso, actualizarCurso } from "../../services/administracionApi";

const MOCK = [
  { id: 1, codigo: "PP",    nombre: "Piloto Privado",               gastos_administrativos_usd: 250, costo_teorico_usd: 870, horas_teoricas: 40, total_usd_estimado: 7645,
    componentes: [{ tipo_aeronave: "Cessna 152 / Tomahawk", horas_requeridas: 45, tarifa_hora_usd_referencia: 135 }, { tipo_aeronave: "BATD II", horas_requeridas: 5, tarifa_hora_usd_referencia: 90 }] },
  { id: 2, codigo: "IFR",   nombre: "Habilitación por Instrumentos",gastos_administrativos_usd: 0,   costo_teorico_usd: 955, horas_teoricas: 40, total_usd_estimado: 7905,
    componentes: [{ tipo_aeronave: "Cessna 152 / Tomahawk", horas_requeridas: 30, tarifa_hora_usd_referencia: 135 }, { tipo_aeronave: "Cherokee 180", horas_requeridas: 10, tarifa_hora_usd_referencia: 200 }, { tipo_aeronave: "BATD II", horas_requeridas: 10, tarifa_hora_usd_referencia: 90 }] },
  { id: 3, codigo: "CPL",   nombre: "Piloto Comercial",             gastos_administrativos_usd: 0,   costo_teorico_usd: 720, horas_teoricas: 40, total_usd_estimado: 8745,
    componentes: [{ tipo_aeronave: "Cessna 152 / Tomahawk", horas_requeridas: 25, tarifa_hora_usd_referencia: 135 }, { tipo_aeronave: "Cherokee 180", horas_requeridas: 10, tarifa_hora_usd_referencia: 200 }, { tipo_aeronave: "Cherokee Arrow", horas_requeridas: 10, tarifa_hora_usd_referencia: 220 }, { tipo_aeronave: "BATD II", horas_requeridas: 5, tarifa_hora_usd_referencia: 90 }] },
  { id: 4, codigo: "MULTI", nombre: "Piloto Bimotor",               gastos_administrativos_usd: 0,   costo_teorico_usd: 250, horas_teoricas: 10, total_usd_estimado: 4765,
    componentes: [{ tipo_aeronave: "Bimotor", horas_requeridas: 7, tarifa_hora_usd_referencia: 600 }, { tipo_aeronave: "BATD II Bimotor", horas_requeridas: 3, tarifa_hora_usd_referencia: 105 }] },
  { id: 5, codigo: "INST",  nombre: "Piloto Instructor",            gastos_administrativos_usd: 0,   costo_teorico_usd: 500, horas_teoricas: 40, total_usd_estimado: 4550,
    componentes: [{ tipo_aeronave: "Cessna 152 / Tomahawk", horas_requeridas: 30, tarifa_hora_usd_referencia: 135 }] }
];

const TIPOS_AERONAVE = [
  "Cessna 152 / Tomahawk",
  "Cessna 152",
  "Tomahawk",
  "Cherokee 180",
  "Cherokee Arrow",
  "Bimotor",
  "BATD II",
  "BATD II Bimotor"
];

const EMPTY_COMP = { tipo_aeronave: "", horas_requeridas: 0, tarifa_hora_usd_referencia: 0 };

const EMPTY_FORM = {
  codigo: "",
  nombre: "",
  descripcion: "",
  gastos_administrativos_usd: 0,
  costo_teorico_usd: 0,
  horas_teoricas: 0,
  total_usd_estimado: 0,
  pago_teoria_instructor_usd: 0,
  componentes: [{ ...EMPTY_COMP }]
};

export default function Cursos() {
  const [cursos, setCursos] = useState([]);
  const [usingMock, setUsingMock] = useState(false);
  const [editing, setEditing] = useState(null); // null | curso | "new"
  const [form, setForm] = useState(EMPTY_FORM);

  const load = async () => {
    try {
      const r = await getCursos();
      if (r?.ok) { setCursos(r.data); setUsingMock(false); }
      else { setCursos(MOCK); setUsingMock(true); }
    } catch { setCursos(MOCK); setUsingMock(true); }
  };
  useEffect(() => { load(); }, []);

  const startNew = () => {
    setEditing("new");
    setForm(EMPTY_FORM);
  };

  const startEdit = (curso) => {
    setEditing(curso);
    setForm({
      codigo: curso.codigo,
      nombre: curso.nombre,
      descripcion: curso.descripcion || "",
      gastos_administrativos_usd: Number(curso.gastos_administrativos_usd || 0),
      costo_teorico_usd: Number(curso.costo_teorico_usd || 0),
      horas_teoricas: Number(curso.horas_teoricas || 0),
      total_usd_estimado: Number(curso.total_usd_estimado || 0),
      pago_teoria_instructor_usd: Number(curso.pago_teoria_instructor_usd || 0),
      componentes: (curso.componentes || []).map(c => ({
        tipo_aeronave: c.tipo_aeronave,
        horas_requeridas: Number(c.horas_requeridas),
        tarifa_hora_usd_referencia: Number(c.tarifa_hora_usd_referencia)
      }))
    });
  };

  const updateComp = (idx, patch) => {
    setForm({ ...form, componentes: form.componentes.map((c, i) => i === idx ? { ...c, ...patch } : c) });
  };
  const addComp = () => setForm({ ...form, componentes: [...form.componentes, { ...EMPTY_COMP }] });
  const removeComp = (idx) => setForm({ ...form, componentes: form.componentes.filter((_, i) => i !== idx) });

  // Recalcular total estimado automáticamente
  const recalcTotal = () => {
    const compTotal = form.componentes.reduce((s, c) =>
      s + Number(c.horas_requeridas || 0) * Number(c.tarifa_hora_usd_referencia || 0), 0);
    const total = Number(form.gastos_administrativos_usd || 0)
                + Number(form.costo_teorico_usd || 0)
                + compTotal;
    setForm({ ...form, total_usd_estimado: total.toFixed(2) });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nombre) return toast.error("El nombre es requerido");
    if (editing === "new" && !form.codigo) return toast.error("El código es requerido");

    const payload = {
      ...(editing === "new" ? { codigo: form.codigo.toUpperCase() } : {}),
      nombre: form.nombre,
      descripcion: form.descripcion,
      gastos_administrativos_usd: Number(form.gastos_administrativos_usd || 0),
      costo_teorico_usd: Number(form.costo_teorico_usd || 0),
      horas_teoricas: Number(form.horas_teoricas || 0),
      total_usd_estimado: Number(form.total_usd_estimado || 0),
      pago_teoria_instructor_usd: Number(form.pago_teoria_instructor_usd || 0),
      componentes: form.componentes.filter(c => c.tipo_aeronave).map(c => ({
        tipo_aeronave: c.tipo_aeronave,
        horas_requeridas: Number(c.horas_requeridas || 0),
        tarifa_hora_usd_referencia: Number(c.tarifa_hora_usd_referencia || 0)
      }))
    };

    try {
      if (editing === "new") await crearCurso(payload);
      else                   await actualizarCurso(editing.id, payload);
      toast.success(editing === "new" ? "Curso creado" : "Curso actualizado");
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Error al guardar");
    }
  };

  const compTotalEstimado = form.componentes.reduce((s, c) =>
    s + Number(c.horas_requeridas || 0) * Number(c.tarifa_hora_usd_referencia || 0), 0);
  const totalCalculado = Number(form.gastos_administrativos_usd || 0)
                       + Number(form.costo_teorico_usd || 0)
                       + compTotalEstimado;

  const totalInversion = cursos.reduce((s, c) => s + Number(c.total_usd_estimado || 0), 0);

  return (
    <div>
      <h1 className="adf-section-title"><i className="bi bi-mortarboard"></i>Cursos CAAA</h1>
      <p className="adf-section-subtitle">
        Catálogo de cursos según tarifario oficial CAAA 2026. Editables por Administración.
        {usingMock && <span className="adf-tag amber" style={{ marginLeft: 10 }}>Datos demo</span>}
      </p>

      <div className="adf-card" style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="adf-btn" onClick={startNew}>
          <i className="bi bi-plus-circle"></i>Nuevo curso
        </button>
      </div>

      {editing && (
        <div className="adf-card">
          <h3>
            <i className={`bi ${editing === "new" ? "bi-plus-circle" : "bi-pencil-square"} me-2`}></i>
            {editing === "new" ? "Nuevo curso" : `Editar: ${editing.nombre}`}
          </h3>
          <form onSubmit={handleSubmit}>
            <div className="adf-form-grid">
              <div className="adf-form-field">
                <label>Código *</label>
                <input required value={form.codigo} placeholder="PP / IFR / CPL / MULTI / INST"
                  disabled={editing !== "new"}
                  onChange={(e) => setForm({...form, codigo: e.target.value.toUpperCase()})} />
              </div>
              <div className="adf-form-field" style={{ gridColumn: "span 2" }}>
                <label>Nombre del curso *</label>
                <input required value={form.nombre}
                  onChange={(e) => setForm({...form, nombre: e.target.value})} />
              </div>
              <div className="adf-form-field" style={{ gridColumn: "1 / -1" }}>
                <label>Descripción</label>
                <input value={form.descripcion}
                  onChange={(e) => setForm({...form, descripcion: e.target.value})} />
              </div>
              <div className="adf-form-field">
                <label>Gastos administrativos (USD)</label>
                <input type="number" step="0.01" min="0" value={form.gastos_administrativos_usd}
                  onChange={(e) => setForm({...form, gastos_administrativos_usd: e.target.value})}
                  onBlur={recalcTotal} />
              </div>
              <div className="adf-form-field">
                <label>Horas teóricas</label>
                <input type="number" min="0" value={form.horas_teoricas}
                  onChange={(e) => setForm({...form, horas_teoricas: e.target.value})} />
              </div>
              <div className="adf-form-field">
                <label>Costo teórico (USD)</label>
                <input type="number" step="0.01" min="0" value={form.costo_teorico_usd}
                  onChange={(e) => setForm({...form, costo_teorico_usd: e.target.value})}
                  onBlur={recalcTotal} />
              </div>
              <div className="adf-form-field">
                <label>Pago teoría al instructor (USD)</label>
                <input type="number" step="0.01" min="0" value={form.pago_teoria_instructor_usd}
                  onChange={(e) => setForm({...form, pago_teoria_instructor_usd: e.target.value})} />
                <small style={{ color: "var(--c-ink-3)", fontSize: "0.72rem" }}>Monto fijo que se le paga al instructor cuando un alumno aprueba el examen final de este curso.</small>
              </div>
            </div>

            {/* Componentes prácticos */}
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px dashed var(--c-line-2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <h4 style={{ margin: 0, color: "var(--c-brand-700)", fontSize: "0.95rem" }}>
                  <i className="bi bi-airplane me-2"></i>Componentes prácticos
                </h4>
                <button type="button" className="adf-btn small secondary" onClick={addComp}>
                  <i className="bi bi-plus-circle"></i>Agregar componente
                </button>
              </div>

              <table className="adf-table" style={{ minWidth: 0 }}>
                <thead>
                  <tr>
                    <th>Tipo de aeronave / Sim</th>
                    <th style={{ width: 110, textAlign: "right" }}>Horas requeridas</th>
                    <th style={{ width: 130, textAlign: "right" }}>Tarifa ref. USD/h</th>
                    <th style={{ width: 110, textAlign: "right" }}>Subtotal</th>
                    <th style={{ width: 44 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {form.componentes.map((c, idx) => {
                    const sub = Number(c.horas_requeridas || 0) * Number(c.tarifa_hora_usd_referencia || 0);
                    return (
                      <tr key={idx}>
                        <td>
                          <input list={`tipos-aero-${idx}`} value={c.tipo_aeronave}
                            style={{ width: "100%", padding: 6, border: "1px solid var(--c-line-2)", borderRadius: 6 }}
                            onChange={(e) => updateComp(idx, { tipo_aeronave: e.target.value })} />
                          <datalist id={`tipos-aero-${idx}`}>
                            {TIPOS_AERONAVE.map(t => <option key={t} value={t} />)}
                          </datalist>
                        </td>
                        <td>
                          <input type="number" min="0" step="0.5" value={c.horas_requeridas}
                            style={{ width: "100%", padding: 6, textAlign: "right", border: "1px solid var(--c-line-2)", borderRadius: 6 }}
                            onChange={(e) => updateComp(idx, { horas_requeridas: e.target.value })}
                            onBlur={recalcTotal} />
                        </td>
                        <td>
                          <input type="number" min="0" step="0.01" value={c.tarifa_hora_usd_referencia}
                            style={{ width: "100%", padding: 6, textAlign: "right", border: "1px solid var(--c-line-2)", borderRadius: 6 }}
                            onChange={(e) => updateComp(idx, { tarifa_hora_usd_referencia: e.target.value })}
                            onBlur={recalcTotal} />
                        </td>
                        <td className="amount" style={{ textAlign: "right" }}>${sub.toFixed(2)}</td>
                        <td style={{ textAlign: "center" }}>
                          {form.componentes.length > 1 && (
                            <button type="button" className="adf-btn small danger" onClick={() => removeComp(idx)}>
                              <i className="bi bi-trash"></i>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Total calculado */}
            <div style={{ marginTop: 18, padding: "12px 16px", background: "var(--c-surface-2)", borderRadius: 10,
                          display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div style={{ fontSize: "0.85rem", color: "var(--c-ink-3)" }}>
                Total calculado: <strong>${totalCalculado.toFixed(2)}</strong>
                {" "}(Gastos ${Number(form.gastos_administrativos_usd || 0).toFixed(2)} +
                Teórico ${Number(form.costo_teorico_usd || 0).toFixed(2)} +
                Práctico ${compTotalEstimado.toFixed(2)})
              </div>
              <div className="adf-form-field" style={{ margin: 0, flexDirection: "row", alignItems: "center", gap: 10 }}>
                <label style={{ margin: 0 }}>TOTAL ESTIMADO USD:</label>
                <input type="number" step="0.01" value={form.total_usd_estimado}
                  style={{ width: 140 }}
                  onChange={(e) => setForm({...form, total_usd_estimado: e.target.value})} />
                <button type="button" className="adf-btn small secondary" onClick={recalcTotal} title="Recalcular automáticamente">
                  <i className="bi bi-arrow-clockwise"></i>
                </button>
              </div>
            </div>

            <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" className="adf-btn secondary" onClick={() => setEditing(null)}>Cancelar</button>
              <button type="submit" className="adf-btn">
                <i className="bi bi-check"></i>{editing === "new" ? "Crear curso" : "Guardar cambios"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tarjetas de cursos */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 18 }}>
        {cursos.map(c => (
          <div key={c.id} className="adf-card" style={{ marginBottom: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--c-accent-700)", letterSpacing: 1.2 }}>
                  CÓDIGO {c.codigo}
                </div>
                <h3 style={{ margin: "2px 0 0 0", fontSize: "1.15rem", color: "var(--c-brand-700)" }}>{c.nombre}</h3>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--c-ink-3)", fontWeight: 600 }}>TOTAL</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--c-brand-700)" }}>
                  ${Number(c.total_usd_estimado).toLocaleString()}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--c-line-1)" }}>
              <div style={{ fontSize: "0.78rem", color: "var(--c-ink-3)", fontWeight: 700, marginBottom: 8 }}>COSTOS FIJOS</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", marginBottom: 4 }}>
                <span>Gastos administrativos</span>
                <span>${Number(c.gastos_administrativos_usd).toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem" }}>
                <span>Teórico ({c.horas_teoricas} h)</span>
                <span>${Number(c.costo_teorico_usd).toFixed(2)}</span>
              </div>
            </div>
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--c-line-1)" }}>
              <div style={{ fontSize: "0.78rem", color: "var(--c-ink-3)", fontWeight: 700, marginBottom: 8 }}>COMPONENTES PRÁCTICOS</div>
              {(c.componentes || []).map((p, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", marginBottom: 4 }}>
                  <span>{p.tipo_aeronave}</span>
                  <span style={{ color: "var(--c-ink-3)" }}>
                    {p.horas_requeridas} h × ${Number(p.tarifa_hora_usd_referencia).toFixed(0)}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--c-line-1)", textAlign: "right" }}>
              <button className="adf-btn small secondary" onClick={() => startEdit(c)}>
                <i className="bi bi-pencil"></i>Editar curso
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="adf-card" style={{ marginTop: 22, background: "var(--c-brand-900)", borderColor: "var(--c-brand-900)", color: "oklch(98% 0.010 245)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: "0.85rem", opacity: 0.8 }}>INVERSIÓN TOTAL DE CARRERA</div>
            <div style={{ fontSize: "2rem", fontWeight: 800 }}>${totalInversion.toLocaleString()}</div>
          </div>
          <i className="bi bi-airplane-engines-fill" style={{ fontSize: "3rem", opacity: 0.4 }}></i>
        </div>
      </div>
    </div>
  );
}
