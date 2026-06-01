import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import Header from "../../components/Header/Header";
import {
  getAulaCursos, getAulaUnidades,
  getMaterialUnidad, subirMaterialUnidad, getMaterialUrl, eliminarMaterial,
  getEvaluaciones, getAlumnosEvaluacion, registrarNota,
  getSesiones, crearSesion, getAsistencia, registrarAsistencia,
} from "../../services/administracionApi";

const ESTADOS_ASIST = ["PRESENTE", "AUSENTE", "TARDE", "JUSTIFICADO"];
const ESTADOS_NOTA = ["PENDIENTE", "PRESENTADA", "CALIFICADA", "AUSENTE"];

export default function InstructorAulaVirtual() {
  const [cursos, setCursos] = useState([]);
  const [cursoSel, setCursoSel] = useState("");
  const [tab, setTab] = useState("material");

  const [unidades, setUnidades] = useState([]);
  const [matUnidad, setMatUnidad] = useState(null);
  const [mats, setMats] = useState([]);

  const [evals, setEvals] = useState([]);
  const [evalAlumnos, setEvalAlumnos] = useState(null); // {ev, lista}

  const [sesiones, setSesiones] = useState([]);
  const [sesionForm, setSesionForm] = useState({ fecha: new Date().toISOString().slice(0, 10), tema: "", id_unidad: "" });
  const [asistencia, setAsistencia] = useState(null); // {sesion, lista}

  useEffect(() => {
    getAulaCursos().then(r => {
      const cs = r?.data || [];
      setCursos(cs);
      if (cs.length && !cursoSel) setCursoSel(String(cs[0].id));
    }).catch(() => toast.error("No se pudieron cargar los cursos"));
  }, []);

  useEffect(() => {
    if (!cursoSel) return;
    getAulaUnidades({ id_curso: cursoSel }).then(r => setUnidades(r?.data || [])).catch(() => setUnidades([]));
    getEvaluaciones({ id_curso: cursoSel }).then(r => setEvals(r?.data || [])).catch(() => setEvals([]));
    getSesiones({ id_curso: cursoSel }).then(r => setSesiones(r?.data || [])).catch(() => setSesiones([]));
    setMatUnidad(null); setEvalAlumnos(null); setAsistencia(null);
  }, [cursoSel]);

  // ── Material ──
  const abrirMat = async (u) => {
    if (matUnidad === u.id) { setMatUnidad(null); return; }
    setMatUnidad(u.id);
    try { setMats((await getMaterialUnidad(u.id))?.data || []); } catch { setMats([]); }
  };
  const subirMat = async (file) => {
    if (!file || !matUnidad) return;
    const fd = new FormData(); fd.append("archivo", file); fd.append("nombre", file.name);
    try { await subirMaterialUnidad(matUnidad, fd); toast.success("Material subido"); setMats((await getMaterialUnidad(matUnidad))?.data || []); }
    catch (e) { toast.error(e?.response?.data?.message || "Error al subir"); }
  };
  const verMat = async (id) => { try { const r = await getMaterialUrl(id); if (r?.url) window.open(r.url, "_blank"); } catch { toast.error("No se pudo abrir"); } };
  const borrarMat = async (id) => { if (!confirm("¿Eliminar material?")) return; try { await eliminarMaterial(id); setMats(p => p.filter(m => m.id !== id)); } catch { toast.error("Error"); } };

  // ── Evaluaciones ──
  const verAlumnos = async (ev) => {
    try { setEvalAlumnos({ ev, lista: (await getAlumnosEvaluacion(ev.id))?.data || [] }); }
    catch { toast.error("Error al cargar alumnos"); }
  };
  const calificar = async (ea, campo, valor) => {
    const payload = { [campo]: valor };
    if (campo === "nota") payload.estado = "CALIFICADA";
    try {
      await registrarNota(ea.id, payload);
      setEvalAlumnos(prev => ({ ...prev, lista: prev.lista.map(x => x.id === ea.id ? { ...x, ...payload } : x) }));
    } catch (e) { toast.error(e?.response?.data?.message || "Error al calificar"); }
  };

  // ── Asistencia ──
  const crearSes = async () => {
    if (!cursoSel) return;
    try {
      await crearSesion({ id_curso: Number(cursoSel), id_unidad: sesionForm.id_unidad || null, fecha: sesionForm.fecha, tema: sesionForm.tema });
      toast.success("Sesión creada (lista pre-cargada como presentes)");
      setSesionForm({ fecha: new Date().toISOString().slice(0, 10), tema: "", id_unidad: "" });
      setSesiones((await getSesiones({ id_curso: cursoSel }))?.data || []);
    } catch (e) { toast.error(e?.response?.data?.message || "Error"); }
  };
  const abrirAsistencia = async (s) => {
    try { setAsistencia({ sesion: s, lista: (await getAsistencia(s.id))?.data || [] }); }
    catch { toast.error("Error al cargar asistencia"); }
  };
  const marcarAsist = async (a, estado) => {
    try {
      await registrarAsistencia(asistencia.sesion.id, { id_alumno: a.id_alumno, estado, observacion: a.observacion });
      setAsistencia(prev => ({ ...prev, lista: prev.lista.map(x => x.id_alumno === a.id_alumno ? { ...x, estado } : x) }));
    } catch { toast.error("Error"); }
  };

  return (
    <>
      <Header />
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: "#1B365D" }}>
          <i className="bi bi-mortarboard-fill me-2"></i>Aula Virtual — Instructor
        </h1>
        <p style={{ color: "#64748b", marginBottom: 16 }}>Material, calificaciones y asistencia de tus cursos teóricos.</p>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569", marginRight: 8 }}>Curso:</label>
          <select value={cursoSel} onChange={(e) => setCursoSel(e.target.value)} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1" }}>
            {cursos.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
          </select>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {[["material", "Material"], ["evaluaciones", "Evaluaciones"], ["asistencia", "Asistencia"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #cbd5e1", cursor: "pointer",
                background: tab === k ? "#1B365D" : "#fff", color: tab === k ? "#fff" : "#1e293b", fontWeight: 600 }}>
              {l}
            </button>
          ))}
        </div>

        {/* MATERIAL */}
        {tab === "material" && (
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
            {unidades.length === 0 && <p style={{ color: "#64748b" }}>Este curso no tiene unidades.</p>}
            {unidades.map(u => (
              <div key={u.id} style={{ borderBottom: "1px solid #f1f5f9", padding: "10px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong>U{u.numero} — {u.nombre}</strong>
                  <button onClick={() => abrirMat(u)} style={{ border: "1px solid #cbd5e1", background: "#fff", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
                    <i className="bi bi-paperclip"></i> Material
                  </button>
                </div>
                {matUnidad === u.id && (
                  <div style={{ marginTop: 8, paddingLeft: 12 }}>
                    <label style={{ display: "inline-block", color: "#1B365D", cursor: "pointer", marginBottom: 6 }}>
                      <i className="bi bi-upload"></i> Subir archivo
                      <input type="file" accept="application/pdf,image/*" style={{ display: "none" }} onChange={(e) => subirMat(e.target.files?.[0])} />
                    </label>
                    {mats.length === 0 ? <div style={{ color: "#94a3b8", fontSize: "0.85rem" }}>Sin material.</div> :
                      mats.map(m => (
                        <div key={m.id} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                          <button onClick={() => verMat(m.id)} style={{ background: "none", border: "none", color: "#1B365D", cursor: "pointer" }}>
                            <i className="bi bi-file-earmark-arrow-down me-1"></i>{m.nombre}
                          </button>
                          <button onClick={() => borrarMat(m.id)} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer" }}><i className="bi bi-trash"></i></button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* EVALUACIONES */}
        {tab === "evaluaciones" && (
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
            {!evalAlumnos ? (
              evals.length === 0 ? <p style={{ color: "#64748b" }}>Sin evaluaciones en este curso.</p> :
              evals.map(ev => (
                <div key={ev.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f1f5f9", padding: "10px 0" }}>
                  <div>
                    <strong>{ev.nombre}</strong> <span style={{ fontSize: "0.8rem", color: "#64748b" }}>· {ev.tipo}{ev.origen === "AAC" ? " · AAC" : ""}</span>
                    <div style={{ fontSize: "0.78rem", color: "#94a3b8" }}>Aprueba {ev.nota_aprobacion} / {ev.puntos_max} · {ev.total_calificados || 0}/{ev.total_inscritos || 0} calificados</div>
                  </div>
                  <button onClick={() => verAlumnos(ev)} style={{ border: "1px solid #cbd5e1", background: "#fff", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>Calificar</button>
                </div>
              ))
            ) : (
              <div>
                <button onClick={() => setEvalAlumnos(null)} style={{ background: "none", border: "none", color: "#1B365D", cursor: "pointer", marginBottom: 8 }}>
                  <i className="bi bi-arrow-left"></i> Volver
                </button>
                <h3 style={{ fontWeight: 700 }}>{evalAlumnos.ev.nombre}</h3>
                <table style={{ width: "100%", marginTop: 8 }}>
                  <thead><tr style={{ textAlign: "left", color: "#64748b", fontSize: "0.8rem" }}><th>Alumno</th><th>Nota</th><th>Estado</th></tr></thead>
                  <tbody>
                    {evalAlumnos.lista.map(ea => (
                      <tr key={ea.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "6px 0" }}>{ea.alumno_username}</td>
                        <td>
                          <input type="number" step="0.1" defaultValue={ea.nota ?? ""} style={{ width: 70, padding: 4, border: "1px solid #cbd5e1", borderRadius: 4 }}
                            onBlur={(e) => e.target.value !== "" && calificar(ea, "nota", Number(e.target.value))} />
                        </td>
                        <td>
                          <select value={ea.estado || "PENDIENTE"} onChange={(e) => calificar(ea, "estado", e.target.value)} style={{ padding: 4, border: "1px solid #cbd5e1", borderRadius: 4 }}>
                            {ESTADOS_NOTA.map(s => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ASISTENCIA */}
        {tab === "asistencia" && (
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
            {!asistencia ? (
              <>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #f1f5f9" }}>
                  <div><label style={{ fontSize: "0.8rem", display: "block" }}>Fecha</label>
                    <input type="date" value={sesionForm.fecha} onChange={(e) => setSesionForm({ ...sesionForm, fecha: e.target.value })} style={{ padding: 6, border: "1px solid #cbd5e1", borderRadius: 6 }} /></div>
                  <div><label style={{ fontSize: "0.8rem", display: "block" }}>Unidad (opcional)</label>
                    <select value={sesionForm.id_unidad} onChange={(e) => setSesionForm({ ...sesionForm, id_unidad: e.target.value })} style={{ padding: 6, border: "1px solid #cbd5e1", borderRadius: 6 }}>
                      <option value="">—</option>
                      {unidades.map(u => <option key={u.id} value={u.id}>U{u.numero} {u.nombre}</option>)}
                    </select></div>
                  <div style={{ flex: 1, minWidth: 160 }}><label style={{ fontSize: "0.8rem", display: "block" }}>Tema</label>
                    <input value={sesionForm.tema} onChange={(e) => setSesionForm({ ...sesionForm, tema: e.target.value })} placeholder="Tema de la clase" style={{ width: "100%", padding: 6, border: "1px solid #cbd5e1", borderRadius: 6 }} /></div>
                  <button onClick={crearSes} style={{ background: "#1B365D", color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 600, cursor: "pointer" }}>+ Pasar lista</button>
                </div>
                {sesiones.length === 0 ? <p style={{ color: "#64748b" }}>Sin sesiones de clase aún.</p> :
                  sesiones.map(s => (
                    <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f1f5f9", padding: "10px 0" }}>
                      <div><strong>{s.fecha}</strong> {s.tema && `· ${s.tema}`} {s.unidad_numero ? `· U${s.unidad_numero}` : ""}
                        <div style={{ fontSize: "0.78rem", color: "#94a3b8" }}>{s.presentes}/{s.total} presentes</div></div>
                      <button onClick={() => abrirAsistencia(s)} style={{ border: "1px solid #cbd5e1", background: "#fff", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>Pasar lista</button>
                    </div>
                  ))}
              </>
            ) : (
              <div>
                <button onClick={() => setAsistencia(null)} style={{ background: "none", border: "none", color: "#1B365D", cursor: "pointer", marginBottom: 8 }}>
                  <i className="bi bi-arrow-left"></i> Volver
                </button>
                <h3 style={{ fontWeight: 700 }}>{asistencia.sesion.fecha} {asistencia.sesion.tema && `· ${asistencia.sesion.tema}`}</h3>
                {asistencia.lista.length === 0 ? <p style={{ color: "#64748b" }}>No hay alumnos inscritos en este curso.</p> :
                  asistencia.lista.map(a => (
                    <div key={a.id_alumno} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderTop: "1px solid #f1f5f9" }}>
                      <span>{a.alumno_username}</span>
                      <div style={{ display: "flex", gap: 4 }}>
                        {ESTADOS_ASIST.map(es => (
                          <button key={es} onClick={() => marcarAsist(a, es)}
                            style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "2px 8px", fontSize: "0.75rem", cursor: "pointer",
                              background: a.estado === es ? (es === "PRESENTE" ? "#16a34a" : es === "AUSENTE" ? "#dc2626" : "#d97706") : "#fff",
                              color: a.estado === es ? "#fff" : "#475569" }}>
                            {es[0]}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
