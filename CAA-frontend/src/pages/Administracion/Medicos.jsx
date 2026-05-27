import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { getMedicos, crearMedico, actualizarMedico } from "../../services/administracionApi";

const MOCK = [
  { id: 1, especialidad: "CARDIOLOGO",  nombre: "Dr. Juan Francisco Escolán",     telefonos: "2263-4212 / 7938-0217", correo: "sanmia78@yahoo.com",            activo: true },
  { id: 2, especialidad: "CARDIOLOGO",  nombre: "Dr. Manuel Rivera Castaneda",    telefonos: "2555-3700",             correo: "mariveracastaneda@gmail.com",   activo: true },
  { id: 3, especialidad: "CARDIOLOGO",  nombre: "Dr. Fidel Candray",              telefonos: "2235-5881 / 2235-5882", correo: "marcialcabrera@hotmail.com",    activo: true },
  { id: 4, especialidad: "OTORRINO",    nombre: "Dr. Fernando Godoy Aparicio",    telefonos: "2235-0524 / 2225-0122", correo: "godoyyori@yahoo.com",           activo: true },
  { id: 5, especialidad: "OTORRINO",    nombre: "Dr. Juan Caballero",             telefonos: "2525-0900 / 2525-0918", correo: "atencion@audiomed.com.sv",      activo: true },
  { id: 6, especialidad: "OTORRINO",    nombre: "Dra. Alicia Marisol Galán Campos",telefonos:"2304-4090 / 7284-3022", correo: "alexagalan86@gmail.com",        activo: true },
  { id: 7, especialidad: "OTORRINO",    nombre: "Dr. Alex Wilfredo Minero Ortiz", telefonos: "2264-4658 / 2200-3208", correo: "audiolabcentroamerica@gmail.com",activo: true },
  { id: 8, especialidad: "OFTALMOLOGO", nombre: "Dr. Mario Rene Tevez",           telefonos: "2225-3356 / 7934-2562", correo: "mariotevezmolina@gmail.com",    activo: true },
  { id: 9, especialidad: "OFTALMOLOGO", nombre: "Dra. Evelin Regina Portillo de Quezada",telefonos:"2264-4151 / 2264-5241",correo:"evelynportillo@hotmail.com",activo:true },
  { id:10, especialidad: "OFTALMOLOGO", nombre: "Dr. Manuel Cruz Cerna Guzmán",   telefonos: "2225-3079 / 7150-7686", correo: "manuel.ccg@gmail.com",          activo: true },
  { id:11, especialidad: "OFTALMOLOGO", nombre: "Dr. Mario Roberto García Rivas", telefonos: "2519-4949 / 7930-1529", correo: "c@vivasinlentes.com",           activo: true }
];

const ICONS = { CARDIOLOGO: "bi-heart-pulse", OTORRINO: "bi-ear", OFTALMOLOGO: "bi-eye" };
const COLORS= { CARDIOLOGO: "var(--c-danger-700)", OTORRINO: "var(--c-info-700)", OFTALMOLOGO: "var(--c-accent-700)" };

export default function Medicos() {
  const [medicos, setMedicos] = useState([]);
  const [usingMock, setUsingMock] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ especialidad: "CARDIOLOGO", nombre: "", telefonos: "", correo: "" });

  const load = async () => {
    try {
      const r = await getMedicos();
      if (r?.ok) { setMedicos(r.data); setUsingMock(false); } else throw new Error();
    } catch { setMedicos(MOCK); setUsingMock(true); }
  };
  useEffect(() => { load(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await crearMedico(form);
      toast.success("Médico agregado");
      setShowForm(false);
      setForm({ especialidad: "CARDIOLOGO", nombre: "", telefonos: "", correo: "" });
      load();
    } catch (e) { toast.error(e?.response?.data?.message || "Error"); }
  };

  const grupos = ["CARDIOLOGO","OTORRINO","OFTALMOLOGO"].map(esp => ({
    esp,
    medicos: medicos.filter(m => m.especialidad === esp)
  }));

  return (
    <div>
      <h1 className="adf-section-title"><i className="bi bi-clipboard2-pulse"></i>Médicos Autorizados por la AAC</h1>
      <p className="adf-section-subtitle">
        Nómina oficial de especialistas certificados por la Autoridad de Aviación Civil para exámenes de aviador.
        {usingMock && <span className="adf-tag amber" style={{ marginLeft: 10 }}>Datos demo</span>}
      </p>

      <div className="adf-card" style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="adf-btn" onClick={() => setShowForm(true)}>
          <i className="bi bi-plus-circle"></i>Agregar médico
        </button>
      </div>

      {showForm && (
        <div className="adf-card">
          <h3><i className="bi bi-plus-circle me-2"></i>Nuevo médico</h3>
          <form onSubmit={handleSubmit}>
            <div className="adf-form-grid">
              <div className="adf-form-field">
                <label>Especialidad</label>
                <select value={form.especialidad} onChange={(e) => setForm({...form, especialidad: e.target.value})}>
                  <option>CARDIOLOGO</option><option>OTORRINO</option><option>OFTALMOLOGO</option>
                </select>
              </div>
              <div className="adf-form-field">
                <label>Nombre completo</label>
                <input required value={form.nombre} onChange={(e) => setForm({...form, nombre: e.target.value})} />
              </div>
              <div className="adf-form-field">
                <label>Teléfonos</label>
                <input value={form.telefonos} onChange={(e) => setForm({...form, telefonos: e.target.value})} />
              </div>
              <div className="adf-form-field">
                <label>Correo</label>
                <input type="email" value={form.correo} onChange={(e) => setForm({...form, correo: e.target.value})} />
              </div>
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
              <button type="submit" className="adf-btn"><i className="bi bi-check"></i>Guardar</button>
              <button type="button" className="adf-btn secondary" onClick={() => setShowForm(false)}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {grupos.map(g => (
        <div key={g.esp} className="adf-card">
          <h3 style={{ color: COLORS[g.esp] }}>
            <i className={`bi ${ICONS[g.esp]} me-2`}></i>{g.esp}S ({g.medicos.length})
          </h3>
          <table className="adf-table">
            <thead><tr><th>Nombre</th><th>Teléfonos</th><th>Correo</th></tr></thead>
            <tbody>
              {g.medicos.map(m => (
                <tr key={m.id}>
                  <td><strong>{m.nombre}</strong></td>
                  <td style={{ color: "var(--c-ink-3)" }}>{m.telefonos}</td>
                  <td><a href={`mailto:${m.correo}`} style={{ color: "var(--c-accent-700)" }}>{m.correo}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
