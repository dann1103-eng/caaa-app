import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  getUsuariosAlumnos, crearUsuarioAlumno, reasignarAlumnoInstructor,
  getUsuariosPersonal, crearUsuarioPersonal, editarUsuarioPersonal,
  resetPasswordPersonal, getInstructorCursos, setInstructorCursos,
  getInstructoresDisponibles, getLicencias
} from "../../services/administracionApi";

const ROLES_PERSONAL = [
  { v: "ADMINISTRACION", t: "Administración / Contabilidad" },
  { v: "PROGRAMACION",   t: "Programación" },
  { v: "TURNO",          t: "Turno" },
  { v: "INSTRUCTOR",     t: "Instructor" },
  { v: "ADMIN",          t: "Administrador del sistema" },
];

const EMPTY_ALUMNO = {
  username: "", password: "", nombre: "", apellido: "", correo: "",
  id_instructor: "", id_licencia: "", numero_licencia: "", telefono: ""
};
const EMPTY_PERSONAL = {
  username: "", password: "", nombre: "", apellido: "", correo: "",
  rol: "ADMINISTRACION", cargo: "", sueldo_base: "",
  es_servicios_profesionales: false, dui: "", nit: "", isss_num: "", afp_num: ""
};

export default function Usuarios() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") === "personal" ? "personal" : "alumnos");

  const [alumnos, setAlumnos] = useState([]);
  const [personal, setPersonal] = useState([]);
  const [instructores, setInstructores] = useState([]);
  const [licencias, setLicencias] = useState([]);

  const [showAlumnoForm, setShowAlumnoForm] = useState(false);
  const [alumnoForm, setAlumnoForm] = useState(EMPTY_ALUMNO);
  const [showPersonalForm, setShowPersonalForm] = useState(false);
  const [personalForm, setPersonalForm] = useState(EMPTY_PERSONAL);

  // Edición de personal
  const [editP, setEditP] = useState(null);      // fila de personal en edición
  const [editPForm, setEditPForm] = useState({});
  const [pwNueva, setPwNueva] = useState("");
  const [instrCursos, setInstrCursos] = useState([]); // [{id, nombre, asignado}]

  const changeTab = (key) => {
    setTab(key);
    const next = new URLSearchParams(params);
    next.set("tab", key);
    setParams(next, { replace: true });
  };

  const loadAlumnos = async () => {
    try { const r = await getUsuariosAlumnos(); if (r?.ok) setAlumnos(r.data); } catch { /* vacío */ }
  };
  const loadPersonal = async () => {
    try { const r = await getUsuariosPersonal(); if (r?.ok) setPersonal(r.data); } catch { /* vacío */ }
  };
  const loadCatalogos = async () => {
    try {
      const [i, l] = await Promise.all([getInstructoresDisponibles(), getLicencias()]);
      if (i?.ok) setInstructores(i.data);
      if (l?.ok) setLicencias(l.data);
    } catch { /* vacío */ }
  };
  useEffect(() => { loadAlumnos(); loadPersonal(); loadCatalogos(); }, []);

  const handleCrearAlumno = async (e) => {
    e.preventDefault();
    if (!alumnoForm.id_instructor || !alumnoForm.id_licencia) {
      return toast.error("Instructor y licencia son obligatorios");
    }
    try {
      await crearUsuarioAlumno({
        ...alumnoForm,
        id_instructor: Number(alumnoForm.id_instructor),
        id_licencia: Number(alumnoForm.id_licencia)
      });
      toast.success("Alumno creado con su cuenta de acceso");
      setShowAlumnoForm(false);
      setAlumnoForm(EMPTY_ALUMNO);
      loadAlumnos();
    } catch (e) { toast.error(e?.response?.data?.message || "Error"); }
  };

  const handleCrearPersonal = async (e) => {
    e.preventDefault();
    try {
      await crearUsuarioPersonal({ ...personalForm, sueldo_base: Number(personalForm.sueldo_base || 0) });
      toast.success("Personal creado con su cuenta de acceso");
      setShowPersonalForm(false);
      setPersonalForm(EMPTY_PERSONAL);
      loadPersonal();
    } catch (e) { toast.error(e?.response?.data?.message || "Error"); }
  };

  // ── Edición de personal ──
  const openEditP = async (p) => {
    setEditP(p);
    setPwNueva("");
    setInstrCursos([]);
    setEditPForm({
      nombre: p.nombre || "", apellido: p.apellido || "",
      correo: p.correo || "",
      cargo: p.cargo || "",
      sueldo_base: p.sueldo_base ?? "",
      es_servicios_profesionales: !!p.es_servicios_profesionales,
      dui: p.dui || "", nit: p.nit || "", isss_num: p.isss_num || "", afp_num: p.afp_num || "",
      rol: p.rol || "ADMINISTRACION",
      activo: p.activo !== false,
    });
    if (p.id_instructor) {
      try { const r = await getInstructorCursos(p.id_instructor); if (r?.ok) setInstrCursos(r.data); } catch { /* */ }
    }
  };

  const handleGuardarP = async (e) => {
    e.preventDefault();
    try {
      await editarUsuarioPersonal(editP.id_usuario, { ...editPForm, sueldo_base: Number(editPForm.sueldo_base || 0) });
      toast.success("Personal actualizado");
      setEditP(null);
      loadPersonal();
    } catch (e) { toast.error(e?.response?.data?.message || "Error"); }
  };

  const handleResetPw = async () => {
    if (!pwNueva) return toast.error("Escribe la nueva contraseña");
    try {
      await resetPasswordPersonal(editP.id_usuario, pwNueva);
      toast.success("Contraseña reseteada (debe cambiarla en su próximo ingreso)");
      setPwNueva("");
    } catch (e) { toast.error(e?.response?.data?.message || "Error"); }
  };

  const handleReasignar = async (id_alumno, id_instructor) => {
    if (!id_instructor) return;
    try {
      await reasignarAlumnoInstructor(id_alumno, Number(id_instructor));
      toast.success("Alumno reasignado");
      loadAlumnos();
    } catch (e) { toast.error(e?.response?.data?.message || "Error"); }
  };

  const toggleCurso = (id) =>
    setInstrCursos(cs => cs.map(c => c.id === id ? { ...c, asignado: !c.asignado } : c));

  const handleGuardarCursos = async () => {
    try {
      const ids = instrCursos.filter(c => c.asignado).map(c => c.id);
      await setInstructorCursos(editP.id_instructor, ids);
      toast.success("Cursos del instructor actualizados");
    } catch (e) { toast.error(e?.response?.data?.message || "Error"); }
  };

  return (
    <div>
      <h1 className="adf-section-title"><i className="bi bi-person-gear"></i>Usuarios</h1>
      <p className="adf-section-subtitle">
        Administra cuentas de <strong>alumnos</strong> y <strong>personal interno</strong>. Al crear cualquiera
        se genera su login (debe cambiar la contraseña en el primer ingreso).
      </p>

      {/* Selector superior */}
      <div className="adf-card" style={{ display: "flex", gap: 10, padding: "12px 16px" }}>
        <button className={`adf-btn ${tab === "alumnos" ? "" : "secondary"}`} onClick={() => changeTab("alumnos")}>
          <i className="bi bi-mortarboard"></i>Alumnos
        </button>
        <button className={`adf-btn ${tab === "personal" ? "" : "secondary"}`} onClick={() => changeTab("personal")}>
          <i className="bi bi-people-fill"></i>Personal
        </button>
      </div>

      {/* ───────────── ALUMNOS ───────────── */}
      {tab === "alumnos" && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button className="adf-btn" onClick={() => { setAlumnoForm(EMPTY_ALUMNO); setShowAlumnoForm(true); }}>
              <i className="bi bi-plus-circle"></i>Nuevo alumno
            </button>
          </div>

          {showAlumnoForm && (
            <div className="adf-card">
              <h3><i className="bi bi-mortarboard me-2"></i>Nuevo alumno</h3>
              <form onSubmit={handleCrearAlumno}>
                <div className="adf-form-grid">
                  <div className="adf-form-field">
                    <label>Usuario (login)</label>
                    <input required value={alumnoForm.username}
                      onChange={(e) => setAlumnoForm({...alumnoForm, username: e.target.value})} />
                  </div>
                  <div className="adf-form-field">
                    <label>Contraseña inicial</label>
                    <input required value={alumnoForm.password}
                      onChange={(e) => setAlumnoForm({...alumnoForm, password: e.target.value})} />
                  </div>
                  <div className="adf-form-field">
                    <label>Nombre</label>
                    <input required value={alumnoForm.nombre}
                      onChange={(e) => setAlumnoForm({...alumnoForm, nombre: e.target.value})} />
                  </div>
                  <div className="adf-form-field">
                    <label>Apellido</label>
                    <input required value={alumnoForm.apellido}
                      onChange={(e) => setAlumnoForm({...alumnoForm, apellido: e.target.value})} />
                  </div>
                  <div className="adf-form-field">
                    <label>Correo</label>
                    <input type="email" value={alumnoForm.correo}
                      onChange={(e) => setAlumnoForm({...alumnoForm, correo: e.target.value})} />
                  </div>
                  <div className="adf-form-field">
                    <label>Teléfono</label>
                    <input value={alumnoForm.telefono}
                      onChange={(e) => setAlumnoForm({...alumnoForm, telefono: e.target.value})} />
                  </div>
                  <div className="adf-form-field">
                    <label>Instructor asignado</label>
                    <select required value={alumnoForm.id_instructor}
                      onChange={(e) => setAlumnoForm({...alumnoForm, id_instructor: e.target.value})}>
                      <option value="">Selecciona...</option>
                      {instructores.map(i => (
                        <option key={i.id_instructor} value={i.id_instructor}>{i.username}</option>
                      ))}
                    </select>
                  </div>
                  <div className="adf-form-field">
                    <label>Licencia</label>
                    <select required value={alumnoForm.id_licencia}
                      onChange={(e) => setAlumnoForm({...alumnoForm, id_licencia: e.target.value})}>
                      <option value="">Selecciona...</option>
                      {licencias.map(l => (
                        <option key={l.id_licencia} value={l.id_licencia}>{l.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div className="adf-form-field">
                    <label>N° de licencia (opcional)</label>
                    <input value={alumnoForm.numero_licencia}
                      onChange={(e) => setAlumnoForm({...alumnoForm, numero_licencia: e.target.value})} />
                  </div>
                </div>
                <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
                  <button type="submit" className="adf-btn"><i className="bi bi-check"></i>Crear alumno</button>
                  <button type="button" className="adf-btn secondary" onClick={() => setShowAlumnoForm(false)}>Cancelar</button>
                </div>
                <p style={{ fontSize: "0.78rem", color: "var(--c-ink-3)", marginTop: 10 }}>
                  Para documentos, seguros, límites y la cuenta corriente, abre la <strong>Ficha</strong> del alumno tras crearlo.
                </p>
              </form>
            </div>
          )}

          <table className="adf-table">
            <thead>
              <tr>
                <th>Alumno</th><th>Usuario</th><th>Instructor</th><th>Licencia</th><th>Correo</th><th></th>
              </tr>
            </thead>
            <tbody>
              {alumnos.map(a => (
                <tr key={a.id_alumno}>
                  <td><i className="bi bi-person-circle me-2"></i><strong>{a.nombre} {a.apellido}</strong></td>
                  <td>{a.username}</td>
                  <td style={{ color: "var(--c-ink-3)" }}>{a.instructor_username || "—"}</td>
                  <td>{a.licencia_nombre || "—"}{a.numero_licencia ? ` · ${a.numero_licencia}` : ""}</td>
                  <td style={{ color: "var(--c-ink-3)" }}>{a.correo || "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    <Link className="adf-btn small secondary" to={`/administracion/alumnos/${a.id_alumno}`}>
                      <i className="bi bi-folder2-open"></i>Ficha
                    </Link>
                  </td>
                </tr>
              ))}
              {alumnos.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--c-ink-4)", padding: 30 }}>
                  No hay alumnos. Crea el primero con el botón verde.
                </td></tr>
              )}
            </tbody>
          </table>
        </>
      )}

      {/* ───────────── PERSONAL ───────────── */}
      {tab === "personal" && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button className="adf-btn" onClick={() => { setPersonalForm(EMPTY_PERSONAL); setShowPersonalForm(true); }}>
              <i className="bi bi-plus-circle"></i>Nuevo personal
            </button>
          </div>

          {showPersonalForm && (
            <div className="adf-card">
              <h3><i className="bi bi-person-badge me-2"></i>Nuevo personal interno</h3>
              <form onSubmit={handleCrearPersonal}>
                <div className="adf-form-grid">
                  <div className="adf-form-field">
                    <label>Usuario (login)</label>
                    <input required value={personalForm.username}
                      onChange={(e) => setPersonalForm({...personalForm, username: e.target.value})} />
                  </div>
                  <div className="adf-form-field">
                    <label>Contraseña inicial</label>
                    <input required value={personalForm.password}
                      onChange={(e) => setPersonalForm({...personalForm, password: e.target.value})} />
                  </div>
                  <div className="adf-form-field">
                    <label>Nombre</label>
                    <input required value={personalForm.nombre}
                      onChange={(e) => setPersonalForm({...personalForm, nombre: e.target.value})} />
                  </div>
                  <div className="adf-form-field">
                    <label>Apellido</label>
                    <input required value={personalForm.apellido}
                      onChange={(e) => setPersonalForm({...personalForm, apellido: e.target.value})} />
                  </div>
                  <div className="adf-form-field">
                    <label>Correo</label>
                    <input type="email" value={personalForm.correo}
                      onChange={(e) => setPersonalForm({...personalForm, correo: e.target.value})} />
                  </div>
                  <div className="adf-form-field">
                    <label>Rol (acceso)</label>
                    <select value={personalForm.rol}
                      onChange={(e) => setPersonalForm({...personalForm, rol: e.target.value})}>
                      {ROLES_PERSONAL.map(r => <option key={r.v} value={r.v}>{r.t}</option>)}
                    </select>
                  </div>
                  <div className="adf-form-field">
                    <label>Cargo</label>
                    <input value={personalForm.cargo} placeholder="Secretaria, Jefe de operaciones..."
                      onChange={(e) => setPersonalForm({...personalForm, cargo: e.target.value})} />
                  </div>
                  <div className="adf-form-field">
                    <label><i className="bi bi-cash me-1"></i>Sueldo base mensual (USD)</label>
                    <input type="number" step="0.01" min="0" value={personalForm.sueldo_base} placeholder="600.00"
                      onChange={(e) => setPersonalForm({...personalForm, sueldo_base: e.target.value})} />
                  </div>
                  <div className="adf-form-field"><label>DUI</label>
                    <input value={personalForm.dui} onChange={(e) => setPersonalForm({...personalForm, dui: e.target.value})} /></div>
                  <div className="adf-form-field"><label>NIT</label>
                    <input value={personalForm.nit} onChange={(e) => setPersonalForm({...personalForm, nit: e.target.value})} /></div>
                  <div className="adf-form-field"><label>N° ISSS</label>
                    <input value={personalForm.isss_num} onChange={(e) => setPersonalForm({...personalForm, isss_num: e.target.value})} /></div>
                  <div className="adf-form-field"><label>N° AFP</label>
                    <input value={personalForm.afp_num} onChange={(e) => setPersonalForm({...personalForm, afp_num: e.target.value})} /></div>
                </div>

                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px dashed var(--c-line-2)" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.9rem", cursor: "pointer" }}>
                    <input type="checkbox" checked={!!personalForm.es_servicios_profesionales}
                      onChange={(e) => setPersonalForm({...personalForm, es_servicios_profesionales: e.target.checked})} />
                    <span>
                      <strong>Servicios profesionales</strong> — planilla de servicios (retención 10%).
                      <span style={{ color: "var(--c-ink-3)" }}> Desmárcalo para planta (ISR + ISSS + AFP).</span>
                    </span>
                  </label>
                </div>

                <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
                  <button type="submit" className="adf-btn"><i className="bi bi-check"></i>Crear personal</button>
                  <button type="button" className="adf-btn secondary" onClick={() => setShowPersonalForm(false)}>Cancelar</button>
                </div>
                <p style={{ fontSize: "0.78rem", color: "var(--c-ink-3)", marginTop: 10 }}>
                  El sueldo también se puede ajustar luego en <strong>Contabilidad → Tarifas → Empleados</strong>.
                </p>
              </form>
            </div>
          )}

          {editP && (
            <div className="adf-card" style={{ background: "var(--c-warn-50)", borderColor: "oklch(85% 0.080 75)" }}>
              <h3><i className="bi bi-pencil-square me-2" style={{ color: "var(--c-warn-700)" }}></i>Editar: {editP.nombre} {editP.apellido}</h3>
              <form onSubmit={handleGuardarP}>
                <div className="adf-form-grid">
                  <div className="adf-form-field"><label>Nombre</label>
                    <input value={editPForm.nombre} onChange={(e) => setEditPForm({...editPForm, nombre: e.target.value})} /></div>
                  <div className="adf-form-field"><label>Apellido</label>
                    <input value={editPForm.apellido} onChange={(e) => setEditPForm({...editPForm, apellido: e.target.value})} /></div>
                  <div className="adf-form-field"><label>Correo</label>
                    <input type="email" value={editPForm.correo} onChange={(e) => setEditPForm({...editPForm, correo: e.target.value})} /></div>
                  <div className="adf-form-field"><label>Rol de acceso</label>
                    <select value={editPForm.rol} onChange={(e) => setEditPForm({...editPForm, rol: e.target.value})}>
                      {ROLES_PERSONAL.map(r => <option key={r.v} value={r.v}>{r.t}</option>)}
                    </select></div>
                </div>

                {editP.id_empleado ? (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed var(--c-line-2)" }}>
                    <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "var(--c-brand-700)", letterSpacing: 0.4, marginBottom: 10 }}>DATOS DE NÓMINA</div>
                    <div className="adf-form-grid">
                      <div className="adf-form-field"><label>Cargo</label>
                        <input value={editPForm.cargo} onChange={(e) => setEditPForm({...editPForm, cargo: e.target.value})} /></div>
                      <div className="adf-form-field"><label>Sueldo base (USD)</label>
                        <input type="number" step="0.01" min="0" value={editPForm.sueldo_base}
                          onChange={(e) => setEditPForm({...editPForm, sueldo_base: e.target.value})} /></div>
                      <div className="adf-form-field"><label>DUI</label>
                        <input value={editPForm.dui} onChange={(e) => setEditPForm({...editPForm, dui: e.target.value})} /></div>
                      <div className="adf-form-field"><label>NIT</label>
                        <input value={editPForm.nit} onChange={(e) => setEditPForm({...editPForm, nit: e.target.value})} /></div>
                      <div className="adf-form-field"><label>N° ISSS</label>
                        <input value={editPForm.isss_num} onChange={(e) => setEditPForm({...editPForm, isss_num: e.target.value})} /></div>
                      <div className="adf-form-field"><label>N° AFP</label>
                        <input value={editPForm.afp_num} onChange={(e) => setEditPForm({...editPForm, afp_num: e.target.value})} /></div>
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", cursor: "pointer", marginTop: 10 }}>
                      <input type="checkbox" checked={!!editPForm.es_servicios_profesionales}
                        onChange={(e) => setEditPForm({...editPForm, es_servicios_profesionales: e.target.checked})} />
                      Servicios profesionales (retención 10%)
                    </label>
                  </div>
                ) : (
                  <p style={{ fontSize: "0.8rem", color: "var(--c-ink-3)", marginTop: 10 }}>
                    <i className="bi bi-info-circle me-1"></i>
                    {editP.id_instructor
                      ? "El pago de este instructor se configura en Contabilidad → Tarifas → Instructores."
                      : "Este usuario no tiene ficha de nómina (empleado)."}
                  </p>
                )}

                <div style={{ marginTop: 12 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", cursor: "pointer" }}>
                    <input type="checkbox" checked={!!editPForm.activo}
                      onChange={(e) => setEditPForm({...editPForm, activo: e.target.checked})} />
                    Acceso activo
                  </label>
                </div>
                <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
                  <button type="submit" className="adf-btn"><i className="bi bi-check"></i>Guardar</button>
                  <button type="button" className="adf-btn secondary" onClick={() => setEditP(null)}>Cerrar</button>
                </div>
                {editPForm.rol === "INSTRUCTOR" && !editP.id_instructor && (
                  <p style={{ fontSize: "0.8rem", color: "var(--c-warn-700)", marginTop: 8 }}>
                    <i className="bi bi-info-circle me-1"></i>Al guardar con rol Instructor se creará su ficha; reabre la edición para asignarle alumnos y cursos.
                  </p>
                )}
              </form>

              {/* Resetear contraseña */}
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px dashed var(--c-line-2)", display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
                <div className="adf-form-field" style={{ flex: "0 0 240px" }}>
                  <label><i className="bi bi-key me-1"></i>Nueva contraseña</label>
                  <input value={pwNueva} onChange={(e) => setPwNueva(e.target.value)} placeholder="contraseña temporal" />
                </div>
                <button type="button" className="adf-btn secondary" onClick={handleResetPw}>Resetear contraseña</button>
              </div>

              {/* Instructor: alumnos + cursos */}
              {editP.id_instructor && (
                <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px dashed var(--c-line-2)" }}>
                  <h4 style={{ margin: "0 0 8px" }}><i className="bi bi-people me-2"></i>Alumnos de este instructor</h4>
                  <table className="adf-table">
                    <thead><tr><th>Alumno</th><th>Reasignar a otro instructor</th></tr></thead>
                    <tbody>
                      {alumnos.filter(a => a.id_instructor === editP.id_instructor).map(a => (
                        <tr key={a.id_alumno}>
                          <td><strong>{a.nombre} {a.apellido}</strong></td>
                          <td>
                            <select defaultValue="" onChange={(e) => handleReasignar(a.id_alumno, e.target.value)}>
                              <option value="">— Mover a... —</option>
                              {instructores.filter(i => Number(i.id_instructor) !== Number(editP.id_instructor))
                                .map(i => <option key={i.id_instructor} value={i.id_instructor}>{i.username}</option>)}
                            </select>
                          </td>
                        </tr>
                      ))}
                      {alumnos.filter(a => a.id_instructor === editP.id_instructor).length === 0 && (
                        <tr><td colSpan={2} style={{ color: "var(--c-ink-4)", textAlign: "center", padding: 16 }}>Sin alumnos asignados.</td></tr>
                      )}
                    </tbody>
                  </table>

                  <h4 style={{ margin: "16px 0 8px" }}><i className="bi bi-person-plus me-2"></i>Asignar otros alumnos</h4>
                  <table className="adf-table">
                    <thead><tr><th>Alumno</th><th>Instructor actual</th><th></th></tr></thead>
                    <tbody>
                      {alumnos.filter(a => a.id_instructor !== editP.id_instructor).map(a => (
                        <tr key={a.id_alumno}>
                          <td>{a.nombre} {a.apellido}</td>
                          <td style={{ color: "var(--c-ink-3)" }}>{a.instructor_username || "—"}</td>
                          <td style={{ textAlign: "right" }}>
                            <button className="adf-btn small secondary" onClick={() => handleReasignar(a.id_alumno, editP.id_instructor)}>
                              <i className="bi bi-arrow-left-right"></i>Asignar
                            </button>
                          </td>
                        </tr>
                      ))}
                      {alumnos.filter(a => a.id_instructor !== editP.id_instructor).length === 0 && (
                        <tr><td colSpan={3} style={{ color: "var(--c-ink-4)", textAlign: "center", padding: 16 }}>No hay otros alumnos.</td></tr>
                      )}
                    </tbody>
                  </table>

                  <h4 style={{ margin: "16px 0 8px" }}><i className="bi bi-mortarboard-fill me-2"></i>Cursos que imparte (Aula Virtual)</h4>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                    {instrCursos.map(c => (
                      <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", cursor: "pointer" }}>
                        <input type="checkbox" checked={!!c.asignado} onChange={() => toggleCurso(c.id)} />
                        {c.codigo} · {c.nombre}
                      </label>
                    ))}
                    {instrCursos.length === 0 && <span style={{ color: "var(--c-ink-4)" }}>No hay cursos activos.</span>}
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <button className="adf-btn small" onClick={handleGuardarCursos}><i className="bi bi-check"></i>Guardar cursos</button>
                    <span style={{ fontSize: "0.78rem", color: "var(--c-ink-3)", marginLeft: 10 }}>
                      Sin marcar ninguno, el instructor ve todos los cursos (retrocompatibilidad).
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          <table className="adf-table">
            <thead>
              <tr>
                <th>Personal</th><th>Usuario</th><th>Rol</th><th>Alumnos</th>
                <th>Planilla</th><th style={{ textAlign: "right" }}>Sueldo base</th><th></th>
              </tr>
            </thead>
            <tbody>
              {personal.map(p => (
                <tr key={p.id_usuario}>
                  <td><i className="bi bi-person-circle me-2"></i><strong>{p.nombre} {p.apellido}</strong></td>
                  <td>{p.username || <span style={{ color: "var(--c-ink-4)" }}>sin login</span>}</td>
                  <td>{p.rol ? <span className="adf-tag blue">{p.rol}</span> : "—"}</td>
                  <td>{p.id_instructor
                    ? <span className="adf-tag green">{Number(p.num_alumnos || 0)} alumno(s)</span>
                    : <span style={{ color: "var(--c-ink-4)" }}>—</span>}</td>
                  <td>
                    {p.es_servicios_profesionales == null
                      ? <span style={{ color: "var(--c-ink-4)" }}>—</span>
                      : p.es_servicios_profesionales
                        ? <span className="adf-tag green">Servicios 10%</span>
                        : <span className="adf-tag blue">Planta ISR</span>}
                  </td>
                  <td className="amount" style={{ textAlign: "right" }}>
                    {p.id_empleado != null ? `$${Number(p.sueldo_base || 0).toFixed(2)}` : "—"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button className="adf-btn small secondary" onClick={() => openEditP(p)}>
                      <i className="bi bi-pencil"></i>Editar
                    </button>
                  </td>
                </tr>
              ))}
              {personal.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--c-ink-4)", padding: 30 }}>
                  No hay personal registrado. Crea el primero con el botón verde.
                </td></tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
