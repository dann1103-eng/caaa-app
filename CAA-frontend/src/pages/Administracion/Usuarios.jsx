import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  getUsuariosAlumnos, crearUsuarioAlumno,
  getUsuariosPersonal, crearUsuarioPersonal,
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

          <table className="adf-table">
            <thead>
              <tr>
                <th>Personal</th><th>Usuario</th><th>Rol</th><th>Cargo</th>
                <th>Planilla</th><th style={{ textAlign: "right" }}>Sueldo base</th>
              </tr>
            </thead>
            <tbody>
              {personal.map(p => (
                <tr key={p.id}>
                  <td><i className="bi bi-person-circle me-2"></i><strong>{p.nombre}</strong></td>
                  <td>{p.username || <span style={{ color: "var(--c-ink-4)" }}>sin login</span>}</td>
                  <td>{p.rol ? <span className="adf-tag blue">{p.rol}</span> : "—"}</td>
                  <td style={{ color: "var(--c-ink-3)" }}>{p.cargo || "—"}</td>
                  <td>
                    {p.es_servicios_profesionales
                      ? <span className="adf-tag green">Servicios 10%</span>
                      : <span className="adf-tag blue">Planta ISR</span>}
                  </td>
                  <td className="amount" style={{ textAlign: "right" }}>${Number(p.sueldo_base || 0).toFixed(2)}</td>
                </tr>
              ))}
              {personal.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--c-ink-4)", padding: 30 }}>
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
