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
  const verMat = async (id) => { try { const r = await getMaterialUrl(id); if (r?.url) window.open(r.url, "_blank", "noopener,noreferrer"); } catch { toast.error("No se pudo abrir"); } };
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
        <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 800, color: "var(--c-brand-900)" }}>
          <i className="bi bi-mortarboard-fill me-2"></i>Aula Virtual — Instructor
        </h1>
        <p style={{ color: "var(--c-ink-2)", marginBottom: 16 }}>Material, calificaciones y asistencia de tus cursos teóricos.</p>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: "var(--text-xs)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "var(--tracking-wide)", color: "var(--c-ink-3)", marginRight: 8 }}>Curso:</label>
          <select value={cursoSel} onChange={(e) => setCursoSel(e.target.value)} style={{ padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--c-line-2)" }}>
            {cursos.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
          </select>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {[["material", "Material"], ["evaluaciones", "Evaluaciones"], ["asistencia", "Asistencia"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              style={{ padding: "8px 16px", borderRadius: "var(--radius-sm)", border: tab === k ? "1px solid var(--c-brand-700)" : "1px solid var(--c-line-2)", cursor: "pointer",
                background: tab === k ? "var(--c-brand-700)" : "transparent", color: tab === k ? "oklch(99% 0 0)" : "var(--c-ink-1)", fontWeight: 600 }}>
              {l}
            </button>
          ))}
        </div>

        {/* MATERIAL */}
        {tab === "material" && (
          <div style={{ background: "var(--c-surface-1)", border: "1px solid var(--c-line-1)", borderRadius: "var(--radius-md)", padding: 16 }}>
            {unidades.length === 0 && <p style={{ color: "var(--c-ink-2)" }}>Este curso no tiene unidades.</p>}
            {unidades.map(u => (
              <div key={u.id} style={{ borderBottom: "1px solid var(--c-line-1)", padding: "10px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong>U{u.numero} — {u.nombre}</strong>
                  <button onClick={() => abrirMat(u)} style={{ border: "1px solid var(--c-line-2)", background: "transparent", borderRadius: "var(--radius-sm)", padding: "4px 10px", cursor: "pointer", color: "var(--c-ink-1)" }}>
                    <i className="bi bi-paperclip"></i> Material
                  </button>
                </div>
                {matUnidad === u.id && (
                  <div style={{ marginTop: 8, paddingLeft: 12 }}>
                    <label style={{ display: "inline-block", color: "var(--c-brand-700)", cursor: "pointer", marginBottom: 6, fontWeight: 600 }}>
                      <i className="bi bi-upload"></i> Subir archivo
                      <input type="file" accept="application/pdf,image/*" style={{ display: "none" }} onChange={(e) => subirMat(e.target.files?.[0])} />
                    </label>
                    {mats.length === 0 ? <div style={{ color: "var(--c-ink-3)", fontSize: "var(--text-sm)" }}>Sin material.</div> :
                      mats.map(m => (
                        <div key={m.id} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                          <button onClick={() => verMat(m.id)} style={{ background: "none", border: "none", color: "var(--c-brand-700)", cursor: "pointer" }}>
                            <i className="bi bi-file-earmark-arrow-down me-1"></i>{m.nombre}
                          </button>
                          <button onClick={() => borrarMat(m.id)} style={{ background: "none", border: "none", color: "var(--c-danger-700)", cursor: "pointer" }}><i className="bi bi-trash"></i></button>
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
          <div style={{ background: "var(--c-surface-1)", border: "1px solid var(--c-line-1)", borderRadius: "var(--radius-md)", padding: 16 }}>
            {!evalAlumnos ? (
              evals.length === 0 ? <p style={{ color: "var(--c-ink-2)" }}>Sin evaluaciones en este curso.</p> :
              evals.map(ev => (
                <div key={ev.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--c-line-1)", padding: "10px 0" }}>
                  <div>
                    <strong>{ev.nombre}</strong> <span style={{ fontSize: "var(--text-sm)", color: "var(--c-ink-2)" }}>· {ev.tipo}{ev.origen === "AAC" ? " · AAC" : ""}</span>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--c-ink-3)", fontVariantNumeric: "tabular-nums" }}>Aprueba {ev.nota_aprobacion} / {ev.puntos_max} · {ev.total_calificados || 0}/{ev.total_inscritos || 0} calificados</div>
                  </div>
                  <button onClick={() => verAlumnos(ev)} style={{ border: "1px solid var(--c-line-2)", background: "transparent", borderRadius: "var(--radius-sm)", padding: "4px 10px", cursor: "pointer", color: "var(--c-ink-1)" }}>Calificar</button>
                </div>
              ))
            ) : (
              <div>
                <button onClick={() => setEvalAlumnos(null)} style={{ background: "none", border: "none", color: "var(--c-brand-700)", cursor: "pointer", marginBottom: 8 }}>
                  <i className="bi bi-arrow-left"></i> Volver
                </button>
                <h3 style={{ fontWeight: 700, color: "var(--c-ink-1)" }}>{evalAlumnos.ev.nombre}</h3>
                <table style={{ width: "100%", marginTop: 8, fontVariantNumeric: "tabular-nums" }}>
                  <thead><tr style={{ textAlign: "left", color: "var(--c-ink-3)", fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)" }}><th>Alumno</th><th>Nota</th><th>Estado</th></tr></thead>
                  <tbody>
                    {evalAlumnos.lista.map(ea => (
                      <tr key={ea.id} style={{ borderTop: "1px solid var(--c-line-1)" }}>
                        <td style={{ padding: "6px 0" }}>{ea.alumno_username}</td>
                        <td>
                          <input type="number" step="0.1" defaultValue={ea.nota ?? ""} style={{ width: 70, padding: 4, border: "1px solid var(--c-line-2)", borderRadius: "var(--radius-xs)", fontVariantNumeric: "tabular-nums" }}
                            onBlur={(e) => e.target.value !== "" && calificar(ea, "nota", Number(e.target.value))} />
                        </td>
                        <td>
                          <select value={ea.estado || "PENDIENTE"} onChange={(e) => calificar(ea, "estado", e.target.value)} style={{ padding: 4, border: "1px solid var(--c-line-2)", borderRadius: "var(--radius-xs)" }}>
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
          <div style={{ background: "var(--c-surface-1)", border: "1px solid var(--c-line-1)", borderRadius: "var(--radius-md)", padding: 16 }}>
            {!asistencia ? (
              <>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid var(--c-line-1)" }}>
                  <div><label style={{ fontSize: "var(--text-xs)", display: "block", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)", color: "var(--c-ink-3)", fontWeight: 600, marginBottom: 4 }}>Fecha</label>
                    <input type="date" value={sesionForm.fecha} onChange={(e) => setSesionForm({ ...sesionForm, fecha: e.target.value })} style={{ padding: 6, border: "1px solid var(--c-line-2)", borderRadius: "var(--radius-sm)" }} /></div>
                  <div><label style={{ fontSize: "var(--text-xs)", display: "block", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)", color: "var(--c-ink-3)", fontWeight: 600, marginBottom: 4 }}>Unidad (opcional)</label>
                    <select value={sesionForm.id_unidad} onChange={(e) => setSesionForm({ ...sesionForm, id_unidad: e.target.value })} style={{ padding: 6, border: "1px solid var(--c-line-2)", borderRadius: "var(--radius-sm)" }}>
                      <option value="">—</option>
                      {unidades.map(u => <option key={u.id} value={u.id}>U{u.numero} {u.nombre}</option>)}
                    </select></div>
                  <div style={{ flex: 1, minWidth: 160 }}><label style={{ fontSize: "var(--text-xs)", display: "block", textTransform: "uppercase", letterSpacing: "var(--tracking-wide)", color: "var(--c-ink-3)", fontWeight: 600, marginBottom: 4 }}>Tema</label>
                    <input value={sesionForm.tema} onChange={(e) => setSesionForm({ ...sesionForm, tema: e.target.value })} placeholder="Tema de la clase" style={{ width: "100%", padding: 6, border: "1px solid var(--c-line-2)", borderRadius: "var(--radius-sm)" }} /></div>
                  <button onClick={crearSes} style={{ background: "var(--c-brand-700)", color: "oklch(99% 0 0)", border: "none", borderRadius: "var(--radius-sm)", padding: "8px 16px", fontWeight: 600, cursor: "pointer" }}>+ Pasar lista</button>
                </div>
                {sesiones.length === 0 ? <p style={{ color: "var(--c-ink-2)" }}>Sin sesiones de clase aún.</p> :
                  sesiones.map(s => (
                    <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--c-line-1)", padding: "10px 0" }}>
                      <div><strong style={{ fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>{s.fecha}</strong> {s.tema && `· ${s.tema}`} {s.unidad_numero ? `· U${s.unidad_numero}` : ""}
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--c-ink-3)", fontVariantNumeric: "tabular-nums" }}>{s.presentes}/{s.total} presentes</div></div>
                      <button onClick={() => abrirAsistencia(s)} style={{ border: "1px solid var(--c-line-2)", background: "transparent", borderRadius: "var(--radius-sm)", padding: "4px 10px", cursor: "pointer", color: "var(--c-ink-1)" }}>Pasar lista</button>
                    </div>
                  ))}
              </>
            ) : (
              <div>
                <button onClick={() => setAsistencia(null)} style={{ background: "none", border: "none", color: "var(--c-brand-700)", cursor: "pointer", marginBottom: 8 }}>
                  <i className="bi bi-arrow-left"></i> Volver
                </button>
                <h3 style={{ fontWeight: 700, color: "var(--c-ink-1)" }}>{asistencia.sesion.fecha} {asistencia.sesion.tema && `· ${asistencia.sesion.tema}`}</h3>
                {asistencia.lista.length === 0 ? <p style={{ color: "var(--c-ink-2)" }}>No hay alumnos inscritos en este curso.</p> :
                  asistencia.lista.map(a => (
                    <div key={a.id_alumno} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderTop: "1px solid var(--c-line-1)" }}>
                      <span>{a.alumno_username}</span>
                      <div style={{ display: "flex", gap: 4 }}>
                        {ESTADOS_ASIST.map(es => (
                          <button key={es} onClick={() => marcarAsist(a, es)}
                            style={{ border: "1px solid var(--c-line-2)", borderRadius: "var(--radius-sm)", padding: "2px 8px", fontSize: "var(--text-xs)", cursor: "pointer",
                              background: a.estado === es ? (es === "PRESENTE" ? "var(--c-success-500)" : es === "AUSENTE" ? "var(--c-danger-500)" : "var(--c-warn-500)") : "transparent",
                              color: a.estado === es ? "oklch(99% 0 0)" : "var(--c-ink-2)" }}>
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
