import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getCursos,
  getAulaUnidades, crearAulaUnidad, actualizarAulaUnidad, eliminarAulaUnidad,
  getEvaluaciones, crearEvaluacion, getAlumnosEvaluacion, registrarNota,
  getAlumnosConSaldo, getProgresoAlumno, setProgresoAlumno,
  getMaterialUnidad, subirMaterialUnidad, getMaterialUrl, eliminarMaterial
} from "../../services/administracionApi";

const MOCK_CURSOS = [
  { id: 1, codigo: "PP",    nombre: "Piloto Privado" },
  { id: 2, codigo: "IFR",   nombre: "Habilitación por Instrumentos" },
  { id: 3, codigo: "CPL",   nombre: "Piloto Comercial" },
  { id: 4, codigo: "MULTI", nombre: "Piloto Bimotor" },
  { id: 5, codigo: "INST",  nombre: "Piloto Instructor" }
];

const ESTADO_PROG = {
  NO_INICIADA: { color: "gray",  label: "No iniciada" },
  EN_PROGRESO: { color: "blue",  label: "En progreso" },
  COMPLETADA:  { color: "green", label: "Completada" },
  REPROBADA:   { color: "red",   label: "Reprobada" }
};

const TIPOS = ["EXAMEN", "QUIZ", "TAREA", "PRACTICA", "FINAL"];

const EMPTY_UNIDAD = { numero: 1, nombre: "", descripcion: "", horas_estimadas: 1, orden: 0, recursos_url: "" };
const EMPTY_EVAL = {
  id_curso: "", id_unidad: "", nombre: "", tipo: "EXAMEN", origen: "INTERNO",
  fecha_programada: "", puntos_max: 100, nota_aprobacion: 70, descripcion: ""
};

export default function AulaVirtual() {
  const [cursos, setCursos]       = useState([]);
  const [cursoSel, setCursoSel]   = useState(null);
  const [unidades, setUnidades]   = useState([]);
  const [evaluaciones, setEvals]  = useState([]);
  const [alumnos, setAlumnos]     = useState([]);
  const [usingMock, setUsingMock] = useState(false);
  const [tab, setTab] = useState("unidades");

  const [showUnidadForm, setShowUnidadForm] = useState(false);
  const [editingUnidad, setEditingUnidad] = useState(null);
  const [unidadForm, setUnidadForm] = useState(EMPTY_UNIDAD);

  // Material por unidad
  const [matUnidad, setMatUnidad] = useState(null); // id de unidad con panel abierto
  const [mats, setMats] = useState([]);
  const abrirMaterialPanel = async (u) => {
    if (matUnidad === u.id) { setMatUnidad(null); return; }
    setMatUnidad(u.id);
    try { const r = await getMaterialUnidad(u.id); setMats(r?.data || []); }
    catch { setMats([]); }
  };
  const subirMat = async (file) => {
    if (!file || !matUnidad) return;
    const fd = new FormData();
    fd.append("archivo", file);
    fd.append("nombre", file.name);
    try {
      await subirMaterialUnidad(matUnidad, fd);
      toast.success("Material subido");
      const r = await getMaterialUnidad(matUnidad); setMats(r?.data || []);
    } catch (e) { toast.error(e?.response?.data?.message || "Error al subir"); }
  };
  const abrirMatUrl = async (id) => {
    try { const r = await getMaterialUrl(id); if (r?.url) window.open(r.url, "_blank", "noopener,noreferrer"); }
    catch { toast.error("No se pudo abrir"); }
  };
  const borrarMat = async (id) => {
    if (!confirm("¿Eliminar este material?")) return;
    try { await eliminarMaterial(id); setMats(prev => prev.filter(m => m.id !== id)); }
    catch (e) { toast.error("Error al eliminar"); }
  };

  const [showEvalForm, setShowEvalForm] = useState(false);
  const [evalForm, setEvalForm] = useState(EMPTY_EVAL);

  const [evalActiva, setEvalActiva] = useState(null);
  const [alumnosEval, setAlumnosEval] = useState([]);

  const [alumnoSel, setAlumnoSel] = useState(null);
  const [progresoAlumno, setProgresoAlumnoState] = useState([]);

  // ── Carga inicial ──────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [c, a] = await Promise.all([getCursos(), getAlumnosConSaldo()]);
        if (c?.ok) setCursos(c.data); else { setCursos(MOCK_CURSOS); setUsingMock(true); }
        setAlumnos(a?.ok ? a.data : []);
        if ((c?.data || MOCK_CURSOS).length > 0) {
          setCursoSel((c?.data || MOCK_CURSOS)[0].id);
        }
      } catch {
        setCursos(MOCK_CURSOS); setAlumnos([]); setUsingMock(true);
        setCursoSel(MOCK_CURSOS[0].id);
      }
    })();
  }, []);

  useEffect(() => {
    if (cursoSel) { loadUnidades(); loadEvaluaciones(); }
  }, [cursoSel]);

  const loadUnidades = async () => {
    try {
      const r = await getAulaUnidades({ id_curso: cursoSel });
      if (r?.ok) setUnidades(r.data); else throw new Error();
    } catch { setUnidades([]); }
  };
  const loadEvaluaciones = async () => {
    try {
      const r = await getEvaluaciones({ id_curso: cursoSel });
      if (r?.ok) setEvals(r.data); else throw new Error();
    } catch { setEvals([]); }
  };

  // ── Unidades ───────────────────────────────────────────────────────
  const handleSaveUnidad = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        id_curso: cursoSel,
        numero: Number(unidadForm.numero),
        nombre: unidadForm.nombre,
        descripcion: unidadForm.descripcion,
        horas_estimadas: Number(unidadForm.horas_estimadas),
        orden: Number(unidadForm.orden || unidadForm.numero),
        recursos_url: unidadForm.recursos_url
      };
      if (editingUnidad) await actualizarAulaUnidad(editingUnidad.id, payload);
      else               await crearAulaUnidad(payload);
      toast.success(editingUnidad ? "Unidad actualizada" : "Unidad creada");
      setShowUnidadForm(false); setEditingUnidad(null); setUnidadForm(EMPTY_UNIDAD);
      loadUnidades();
    } catch (e) { toast.error(e?.response?.data?.message || "Error"); }
  };

  const editUnidad = (u) => {
    setEditingUnidad(u);
    setUnidadForm({
      numero: u.numero, nombre: u.nombre, descripcion: u.descripcion || "",
      horas_estimadas: u.horas_estimadas || 0, orden: u.orden || u.numero,
      recursos_url: u.recursos_url || ""
    });
    setShowUnidadForm(true);
  };

  const removerUnidad = async (u) => {
    if (!confirm(`¿Desactivar la unidad "${u.nombre}"?`)) return;
    try { await eliminarAulaUnidad(u.id); toast.success("Unidad desactivada"); loadUnidades(); }
    catch (e) { toast.error(e?.response?.data?.message || "Error"); }
  };

  // ── Evaluaciones ───────────────────────────────────────────────────
  const handleSaveEval = async (e) => {
    e.preventDefault();
    try {
      await crearEvaluacion({
        ...evalForm,
        id_curso: cursoSel,
        id_unidad: evalForm.id_unidad || null,
        puntos_max: Number(evalForm.puntos_max),
        nota_aprobacion: Number(evalForm.nota_aprobacion)
      });
      toast.success("Evaluación creada. Todos los alumnos del curso quedaron inscritos.");
      setShowEvalForm(false); setEvalForm(EMPTY_EVAL);
      loadEvaluaciones();
    } catch (e) { toast.error(e?.response?.data?.message || "Error"); }
  };

  const verAlumnosEval = async (ev) => {
    setEvalActiva(ev);
    try {
      const r = await getAlumnosEvaluacion(ev.id);
      setAlumnosEval(r?.ok ? r.data : []);
    } catch { setAlumnosEval([]); }
  };

  const updateNotaAlumno = async (ea, patch) => {
    try {
      await registrarNota(ea.id, patch);
      toast.success("Nota guardada");
      verAlumnosEval(evalActiva);
    } catch (e) { toast.error(e?.response?.data?.message || "Error"); }
  };

  // ── Progreso por alumno ────────────────────────────────────────────
  const cargarProgresoAlumno = async (idAlumno) => {
    setAlumnoSel(idAlumno);
    try {
      const r = await getProgresoAlumno(idAlumno);
      setProgresoAlumnoState(r?.ok ? r.data : []);
    } catch { setProgresoAlumnoState([]); }
  };

  const cambiarEstadoUnidad = async (p, nuevoEstado) => {
    try {
      await setProgresoAlumno({
        id_alumno: alumnoSel, id_unidad: p.id_unidad,
        estado: nuevoEstado, horas_acumuladas: p.horas_acumuladas
      });
      toast.success("Progreso actualizado");
      cargarProgresoAlumno(alumnoSel);
    } catch (e) { toast.error(e?.response?.data?.message || "Error"); }
  };

  return (
    <div>
      <h1 className="adf-section-title"><i className="bi bi-mortarboard-fill"></i>Aula Virtual</h1>
      <p className="adf-section-subtitle">
        Gestión de unidades teóricas, evaluaciones y progreso académico por alumno.
        {usingMock && <span className="adf-tag amber" style={{ marginLeft: 10 }}>Datos demo</span>}
      </p>

      {/* Selector de curso */}
      <div className="adf-card" style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
        <div className="adf-form-field" style={{ flex: "0 0 300px" }}>
          <label>Curso a gestionar</label>
          <select value={cursoSel || ""} onChange={(e) => setCursoSel(Number(e.target.value))}>
            {cursos.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, color: "var(--c-ink-3)", fontSize: "0.88rem" }}>
          <strong>{unidades.length}</strong> unidades · <strong>{evaluaciones.length}</strong> evaluaciones
        </div>
      </div>

      {/* Tabs */}
      <div className="adf-card" style={{ display: "flex", gap: 8, padding: "12px 16px" }}>
        <button className={`adf-btn ${tab === 'unidades' ? '' : 'secondary'}`} onClick={() => setTab('unidades')}>
          <i className="bi bi-book"></i>Unidades
        </button>
        <button className={`adf-btn ${tab === 'eval' ? '' : 'secondary'}`} onClick={() => setTab('eval')}>
          <i className="bi bi-clipboard-check"></i>Evaluaciones
        </button>
        <button className={`adf-btn ${tab === 'prog' ? '' : 'secondary'}`} onClick={() => setTab('prog')}>
          <i className="bi bi-graph-up"></i>Progreso por alumno
        </button>
      </div>

      {/* ────── UNIDADES ────── */}
      {tab === 'unidades' && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button className="adf-btn" onClick={() => { setEditingUnidad(null); setUnidadForm({ ...EMPTY_UNIDAD, numero: unidades.length + 1, orden: unidades.length + 1 }); setShowUnidadForm(true); }}>
              <i className="bi bi-plus-circle"></i>Nueva unidad
            </button>
          </div>

          {showUnidadForm && (
            <div className="adf-card">
              <h3><i className={`bi ${editingUnidad ? 'bi-pencil-square' : 'bi-plus-circle'} me-2`}></i>
                {editingUnidad ? `Editar unidad ${editingUnidad.numero}` : "Nueva unidad"}</h3>
              <form onSubmit={handleSaveUnidad}>
                <div className="adf-form-grid">
                  <div className="adf-form-field">
                    <label>Número</label>
                    <input type="number" min="1" required value={unidadForm.numero}
                      onChange={(e) => setUnidadForm({...unidadForm, numero: e.target.value})} />
                  </div>
                  <div className="adf-form-field" style={{ gridColumn: "span 2" }}>
                    <label>Nombre *</label>
                    <input required value={unidadForm.nombre}
                      placeholder="Ej: Meteorología"
                      onChange={(e) => setUnidadForm({...unidadForm, nombre: e.target.value})} />
                  </div>
                  <div className="adf-form-field" style={{ gridColumn: "1 / -1" }}>
                    <label>Descripción</label>
                    <input value={unidadForm.descripcion}
                      onChange={(e) => setUnidadForm({...unidadForm, descripcion: e.target.value})} />
                  </div>
                  <div className="adf-form-field">
                    <label>Horas estimadas</label>
                    <input type="number" step="0.5" min="0" value={unidadForm.horas_estimadas}
                      onChange={(e) => setUnidadForm({...unidadForm, horas_estimadas: e.target.value})} />
                  </div>
                  <div className="adf-form-field">
                    <label>Orden</label>
                    <input type="number" min="0" value={unidadForm.orden}
                      onChange={(e) => setUnidadForm({...unidadForm, orden: e.target.value})} />
                  </div>
                  <div className="adf-form-field" style={{ gridColumn: "span 2" }}>
                    <label>URL de recursos (opcional)</label>
                    <input value={unidadForm.recursos_url} placeholder="https://..."
                      onChange={(e) => setUnidadForm({...unidadForm, recursos_url: e.target.value})} />
                  </div>
                </div>
                <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
                  <button type="submit" className="adf-btn"><i className="bi bi-check"></i>Guardar</button>
                  <button type="button" className="adf-btn secondary"
                    onClick={() => { setShowUnidadForm(false); setEditingUnidad(null); }}>Cancelar</button>
                </div>
              </form>
            </div>
          )}

          <table className="adf-table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>#</th>
                <th>Nombre de la unidad</th>
                <th style={{ width: 100, textAlign: "right" }}>Horas</th>
                <th style={{ width: 80, textAlign: "right" }}>Orden</th>
                <th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {unidades.map(u => (
                <tr key={u.id}>
                  <td><strong>{u.numero}</strong></td>
                  <td>
                    <strong>{u.nombre}</strong>
                    {u.descripcion && <div style={{ fontSize: "0.8rem", color: "var(--c-ink-3)" }}>{u.descripcion}</div>}
                  </td>
                  <td className="amount" style={{ textAlign: "right" }}>{Number(u.horas_estimadas).toFixed(1)} h</td>
                  <td style={{ textAlign: "right", color: "var(--c-ink-3)" }}>{u.orden}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button className="adf-btn small secondary" title="Material" onClick={() => abrirMaterialPanel(u)}>
                      <i className="bi bi-paperclip"></i>
                    </button>
                    <button className="adf-btn small secondary" style={{ marginLeft: 4 }} onClick={() => editUnidad(u)}>
                      <i className="bi bi-pencil"></i>
                    </button>
                    <button className="adf-btn small danger" style={{ marginLeft: 4 }} onClick={() => removerUnidad(u)}>
                      <i className="bi bi-trash"></i>
                    </button>
                  </td>
                </tr>
              )).flatMap((row, idx) => {
                const u = unidades[idx];
                const out = [row];
                if (matUnidad === u.id) {
                  out.push(
                    <tr key={`mat-${u.id}`}>
                      <td colSpan={5} style={{ background: "var(--c-surface-2)", padding: 14 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <strong style={{ fontSize: "0.9rem" }}><i className="bi bi-paperclip me-1"></i>Material de la unidad {u.numero}</strong>
                          <label className="adf-btn small" style={{ cursor: "pointer" }}>
                            <i className="bi bi-upload"></i> Subir archivo
                            <input type="file" accept="application/pdf,image/*" style={{ display: "none" }}
                              onChange={(e) => subirMat(e.target.files?.[0])} />
                          </label>
                        </div>
                        {mats.length === 0
                          ? <div style={{ color: "var(--c-ink-3)", fontSize: "0.85rem" }}>Sin material todavía.</div>
                          : mats.map(m => (
                            <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
                              <button onClick={() => abrirMatUrl(m.id)} style={{ background: "none", border: "none", color: "var(--c-brand-700)", cursor: "pointer", fontSize: "0.88rem" }}>
                                <i className="bi bi-file-earmark-arrow-down me-1"></i>{m.nombre}
                              </button>
                              <button onClick={() => borrarMat(m.id)} style={{ background: "none", border: "none", color: "var(--c-danger-700)", cursor: "pointer" }}>
                                <i className="bi bi-trash"></i>
                              </button>
                            </div>
                          ))}
                      </td>
                    </tr>
                  );
                }
                return out;
              })}
              {unidades.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: "center", padding: 30, color: "var(--c-ink-4)" }}>
                  Este curso no tiene unidades. Crea la primera con el botón verde.
                </td></tr>
              )}
            </tbody>
          </table>
        </>
      )}

      {/* ────── EVALUACIONES ────── */}
      {tab === 'eval' && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button className="adf-btn" onClick={() => { setEvalForm({...EMPTY_EVAL, id_curso: cursoSel}); setShowEvalForm(true); }}>
              <i className="bi bi-plus-circle"></i>Nueva evaluación
            </button>
          </div>

          {showEvalForm && (
            <div className="adf-card">
              <h3><i className="bi bi-clipboard-check me-2"></i>Nueva evaluación</h3>
              <p style={{ color: "var(--c-ink-3)", fontSize: "0.85rem", marginTop: -10 }}>
                Al crearla, se inscriben automáticamente todos los alumnos activos del curso con estado PENDIENTE.
              </p>
              <form onSubmit={handleSaveEval}>
                <div className="adf-form-grid">
                  <div className="adf-form-field" style={{ gridColumn: "span 2" }}>
                    <label>Nombre *</label>
                    <input required value={evalForm.nombre} placeholder="Ej: Examen unidad 3"
                      onChange={(e) => setEvalForm({...evalForm, nombre: e.target.value})} />
                  </div>
                  <div className="adf-form-field">
                    <label>Tipo</label>
                    <select value={evalForm.tipo} onChange={(e) => setEvalForm({...evalForm, tipo: e.target.value})}>
                      {TIPOS.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="adf-form-field">
                    <label>Origen</label>
                    <select value={evalForm.origen} onChange={(e) => setEvalForm({...evalForm, origen: e.target.value})}>
                      <option value="INTERNO">Interno (escuela)</option>
                      <option value="AAC">Autoridad (AAC / chequeo)</option>
                    </select>
                  </div>
                  <div className="adf-form-field">
                    <label>Unidad</label>
                    <select value={evalForm.id_unidad} onChange={(e) => setEvalForm({...evalForm, id_unidad: e.target.value})}>
                      <option value="">(Sin unidad / integradora)</option>
                      {unidades.map(u => <option key={u.id} value={u.id}>U{u.numero} — {u.nombre}</option>)}
                    </select>
                  </div>
                  <div className="adf-form-field">
                    <label>Fecha programada</label>
                    <input type="date" value={evalForm.fecha_programada}
                      onChange={(e) => setEvalForm({...evalForm, fecha_programada: e.target.value})} />
                  </div>
                  <div className="adf-form-field">
                    <label>Puntos máximos</label>
                    <input type="number" min="1" step="0.1" value={evalForm.puntos_max}
                      onChange={(e) => setEvalForm({...evalForm, puntos_max: e.target.value})} />
                  </div>
                  <div className="adf-form-field">
                    <label>Nota de aprobación</label>
                    <input type="number" min="0" step="0.1" value={evalForm.nota_aprobacion}
                      onChange={(e) => setEvalForm({...evalForm, nota_aprobacion: e.target.value})} />
                  </div>
                  <div className="adf-form-field" style={{ gridColumn: "1 / -1" }}>
                    <label>Descripción</label>
                    <input value={evalForm.descripcion}
                      onChange={(e) => setEvalForm({...evalForm, descripcion: e.target.value})} />
                  </div>
                </div>
                <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
                  <button type="submit" className="adf-btn"><i className="bi bi-check"></i>Crear evaluación</button>
                  <button type="button" className="adf-btn secondary" onClick={() => setShowEvalForm(false)}>Cancelar</button>
                </div>
              </form>
            </div>
          )}

          <table className="adf-table">
            <thead>
              <tr>
                <th>Evaluación</th><th>Tipo</th><th>Unidad</th>
                <th>Fecha</th><th style={{ textAlign: "right" }}>Inscritos</th>
                <th style={{ textAlign: "right" }}>Calificados</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {evaluaciones.map(ev => (
                <tr key={ev.id}>
                  <td><strong>{ev.nombre}</strong>
                    <div style={{ fontSize: "0.78rem", color: "var(--c-ink-3)" }}>Máx {ev.puntos_max} · aprueba {ev.nota_aprobacion}</div></td>
                  <td>
                    <span className="adf-tag blue">{ev.tipo}</span>
                    {ev.origen === 'AAC' && <span className="adf-tag amber" style={{ marginLeft: 4 }}>AAC</span>}
                  </td>
                  <td>{ev.unidad_numero ? `U${ev.unidad_numero}` : "—"}</td>
                  <td>{ev.fecha_programada || "—"}</td>
                  <td style={{ textAlign: "right" }}>{ev.total_inscritos || 0}</td>
                  <td style={{ textAlign: "right" }}>
                    <span className={`adf-tag ${(Number(ev.total_calificados) >= Number(ev.total_inscritos)) ? 'green' : 'amber'}`}>
                      {ev.total_calificados || 0} / {ev.total_inscritos || 0}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button className="adf-btn small secondary" onClick={() => verAlumnosEval(ev)}>
                      <i className="bi bi-list-check"></i>Calificar
                    </button>
                  </td>
                </tr>
              ))}
              {evaluaciones.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: 30, color: "var(--c-ink-4)" }}>
                  No hay evaluaciones programadas en este curso.
                </td></tr>
              )}
            </tbody>
          </table>

          {evalActiva && (
            <div className="adf-card" style={{ background: "var(--c-brand-50)", borderColor: "oklch(85% 0.060 245)" }}>
              <h3>
                <i className="bi bi-list-check me-2"></i>{evalActiva.nombre} — Calificación
              </h3>
              <table className="adf-table">
                <thead>
                  <tr>
                    <th>Alumno</th><th>Estado</th>
                    <th style={{ width: 130 }}>Nota</th>
                    <th style={{ width: 160 }}>Estado</th>
                    <th>Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {alumnosEval.map(ea => (
                    <tr key={ea.id}>
                      <td><i className="bi bi-person me-2"></i>{ea.alumno_username}</td>
                      <td>
                        <span className={`adf-tag ${ea.estado === 'CALIFICADA' ? 'green' : ea.estado === 'PENDIENTE' ? 'amber' : 'gray'}`}>
                          {ea.estado}
                        </span>
                      </td>
                      <td>
                        <input type="number" step="0.1" min="0" max={evalActiva.puntos_max}
                          defaultValue={ea.nota || ""}
                          style={{ width: 100, padding: 6, textAlign: "right", border: "1px solid var(--c-line-2)", borderRadius: 6 }}
                          onBlur={(e) => {
                            const v = e.target.value;
                            if (v !== "" && Number(v) !== Number(ea.nota)) {
                              updateNotaAlumno(ea, { nota: Number(v), estado: 'CALIFICADA', fecha_presentacion: new Date().toISOString().slice(0,10) });
                            }
                          }} />
                      </td>
                      <td>
                        <select defaultValue={ea.estado}
                          onChange={(e) => updateNotaAlumno(ea, { estado: e.target.value })}>
                          <option value="PENDIENTE">PENDIENTE</option>
                          <option value="PRESENTADA">PRESENTADA</option>
                          <option value="CALIFICADA">CALIFICADA</option>
                          <option value="AUSENTE">AUSENTE</option>
                          <option value="ANULADA">ANULADA</option>
                        </select>
                      </td>
                      <td>
                        <input defaultValue={ea.observaciones || ""}
                          style={{ width: "100%", padding: 6, border: "1px solid var(--c-line-2)", borderRadius: 6 }}
                          onBlur={(e) => {
                            if (e.target.value !== (ea.observaciones || "")) {
                              updateNotaAlumno(ea, { observaciones: e.target.value });
                            }
                          }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 12, textAlign: "right" }}>
                <button className="adf-btn secondary" onClick={() => setEvalActiva(null)}>Cerrar calificación</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ────── PROGRESO POR ALUMNO ────── */}
      {tab === 'prog' && (
        <>
          <div className="adf-card">
            <div className="adf-form-field" style={{ maxWidth: 380 }}>
              <label>Alumno</label>
              <select value={alumnoSel || ""} onChange={(e) => cargarProgresoAlumno(Number(e.target.value))}>
                <option value="">Selecciona...</option>
                {alumnos.map(a => <option key={a.id_alumno} value={a.id_alumno}>{a.username}</option>)}
              </select>
            </div>
          </div>

          {alumnoSel && (
            <table className="adf-table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>#</th>
                  <th>Unidad</th>
                  <th>Curso</th>
                  <th style={{ width: 180 }}>Estado</th>
                  <th>Cambiar</th>
                </tr>
              </thead>
              <tbody>
                {progresoAlumno.map(p => {
                  const info = ESTADO_PROG[p.estado] || ESTADO_PROG.NO_INICIADA;
                  return (
                    <tr key={p.id_unidad}>
                      <td><strong>U{p.numero}</strong></td>
                      <td>{p.nombre}</td>
                      <td><span className="adf-tag blue">{p.curso_codigo}</span></td>
                      <td><span className={`adf-tag ${info.color}`}>{info.label}</span></td>
                      <td>
                        <select defaultValue={p.estado}
                          onChange={(e) => cambiarEstadoUnidad(p, e.target.value)}>
                          <option value="NO_INICIADA">No iniciada</option>
                          <option value="EN_PROGRESO">En progreso</option>
                          <option value="COMPLETADA">Completada</option>
                          <option value="REPROBADA">Reprobada</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
                {progresoAlumno.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: "center", padding: 30, color: "var(--c-ink-4)" }}>
                    Este alumno no está inscrito en ningún curso activo, o el curso no tiene unidades.
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
