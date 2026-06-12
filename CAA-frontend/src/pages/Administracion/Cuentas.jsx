import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { getAlumnosConSaldo, actualizarDatosFiscales } from "../../services/administracionApi";
import SaldoBadge from "../../components/SaldoBadge/SaldoBadge";

const MOCK = [
  { id_alumno: 1, username: "juan.oporto",   correo: "juan@caaa-sv.com",  saldo_actual_usd: 2486.34, ultimo_movimiento_en: "2025-09-17", numero_licencia: "PE-1024" },
  { id_alumno: 2, username: "maria.lopez",   correo: "maria@caaa-sv.com", saldo_actual_usd: 9450.00, ultimo_movimiento_en: "2026-05-15", numero_licencia: "PE-1138" },
  { id_alumno: 3, username: "carlos.solano", correo: "carlos@caaa-sv.com",saldo_actual_usd: -250.00, ultimo_movimiento_en: "2026-05-12", numero_licencia: "PE-1207" },
  { id_alumno: 4, username: "ana.morales",   correo: "ana@caaa-sv.com",   saldo_actual_usd: 10000.00,ultimo_movimiento_en: "2026-04-30", numero_licencia: "PE-1300" }
];

export default function Cuentas() {
  const [data, setData] = useState([]);
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [filtroInstructor, setFiltroInstructor] = useState("");
  const [filtroLicencia, setFiltroLicencia] = useState("");
  const [usingMock, setUsingMock] = useState(false);
  const [expandido, setExpandido] = useState(null); // id_alumno con datos fiscales abiertos
  const [fiscalForm, setFiscalForm] = useState({});
  const [savingFiscal, setSavingFiscal] = useState(false);

  const cargar = async () => {
    try {
      const r = await getAlumnosConSaldo();
      if (r?.ok) setData(r.data);
      else { setData(MOCK); setUsingMock(true); }
    } catch {
      setData(MOCK); setUsingMock(true);
    }
  };

  useEffect(() => { cargar(); }, []);

  const toggleFiscal = (a) => {
    if (expandido === a.id_alumno) { setExpandido(null); return; }
    setExpandido(a.id_alumno);
    setFiscalForm({
      nombre: a.nombre || "", apellido: a.apellido || "",
      dui: a.dui || "", correo: a.correo || "",
      direccion: a.direccion || "", telefono: a.telefono || "",
    });
  };

  const guardarFiscal = async (id_alumno) => {
    setSavingFiscal(true);
    try {
      await actualizarDatosFiscales(id_alumno, fiscalForm);
      toast.success("Datos fiscales guardados");
      await cargar();
      setExpandido(null);
    } catch (e) {
      toast.error(e.response?.data?.message || "Error al guardar");
    } finally { setSavingFiscal(false); }
  };

  // Opciones distintas para los filtros (derivadas de los datos cargados).
  const instructores = [...new Set(data.map(a => a.instructor_username).filter(Boolean))].sort();
  const licencias = [...new Set(data.map(a => a.licencia_nombre).filter(Boolean))].sort();

  const filtrados = data.filter(a => {
    const matchQ = !q || (a.username || "").toLowerCase().includes(q.toLowerCase()) ||
                   (a.correo || "").toLowerCase().includes(q.toLowerCase()) ||
                   (a.numero_licencia || "").toLowerCase().includes(q.toLowerCase());
    if (!matchQ) return false;
    if (filtroInstructor && a.instructor_username !== filtroInstructor) return false;
    if (filtroLicencia && a.licencia_nombre !== filtroLicencia) return false;
    if (filtro === "saldo_bajo") return Number(a.saldo_actual_usd) < 200;
    if (filtro === "saldo_negativo") return Number(a.saldo_actual_usd) < 0;
    if (filtro === "saldo_alto") return Number(a.saldo_actual_usd) >= 1000;
    return true;
  });

  return (
    <div>
      <h1 className="adf-section-title"><i className="bi bi-people"></i>Alumnos</h1>
      <p className="adf-section-subtitle">
        Entrá a la ficha de cada alumno para ver y gestionar su perfil, documentos, contratos y cuenta corriente.
        {usingMock && <span className="adf-tag amber" style={{ marginLeft: 10 }}>Datos demo</span>}
      </p>

      <div className="adf-card">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
          <div className="adf-form-field" style={{ flex: "1 1 280px" }}>
            <label>Buscar</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, correo, licencia..." />
          </div>
          <div className="adf-form-field" style={{ flex: "0 0 180px" }}>
            <label>Saldo</label>
            <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
              <option value="todos">Todos</option>
              <option value="saldo_bajo">Saldo bajo (&lt; $200)</option>
              <option value="saldo_negativo">Saldo negativo</option>
              <option value="saldo_alto">Saldo alto (&gt; $1000)</option>
            </select>
          </div>
          <div className="adf-form-field" style={{ flex: "0 0 180px" }}>
            <label>Instructor</label>
            <select value={filtroInstructor} onChange={(e) => setFiltroInstructor(e.target.value)}>
              <option value="">Todos</option>
              {instructores.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div className="adf-form-field" style={{ flex: "0 0 180px" }}>
            <label>Licencia</label>
            <select value={filtroLicencia} onChange={(e) => setFiltroLicencia(e.target.value)}>
              <option value="">Todas</option>
              {licencias.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div style={{ marginLeft: "auto", color: "var(--c-ink-3)", fontSize: "0.88rem" }}>
            <strong>{filtrados.length}</strong> alumnos
          </div>
        </div>
      </div>

      <table className="adf-table">
        <thead>
          <tr>
            <th>Alumno</th>
            <th>Licencia</th>
            <th>Instructor</th>
            <th>Correo</th>
            <th style={{ textAlign: "right" }}>Saldo</th>
            <th>Último movimiento</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtrados.map(a => (
            <React.Fragment key={a.id_alumno}>
            <tr>
              <td><i className="bi bi-person-circle me-2"></i><strong>{a.username}</strong></td>
              <td>
                <code style={{ color: "var(--c-brand-700)" }}>{a.numero_licencia || "—"}</code>
                {a.licencia_nombre && <span style={{ color: "var(--c-ink-3)", fontSize: "0.8rem", marginLeft: 6 }}>{a.licencia_nombre}</span>}
              </td>
              <td style={{ color: "var(--c-ink-3)" }}>{a.instructor_username || "—"}</td>
              <td style={{ color: "var(--c-ink-3)" }}>{a.correo}</td>
              <td style={{ textAlign: "right" }}><SaldoBadge saldo={a.saldo_actual_usd} /></td>
              <td style={{ color: "var(--c-ink-3)", fontSize: "0.88rem" }}>
                {a.ultimo_movimiento_en ? new Date(a.ultimo_movimiento_en).toLocaleDateString("es-SV") : "—"}
              </td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <button
                  className="adf-btn small secondary"
                  style={{ marginRight: 6 }}
                  onClick={() => toggleFiscal(a)}
                  aria-expanded={expandido === a.id_alumno}
                >
                  <i className={`bi ${expandido === a.id_alumno ? "bi-chevron-up" : "bi-receipt"}`}></i>
                  Ver datos fiscales
                </button>
                <Link className="adf-btn small" to={`/administracion/alumnos/${a.id_alumno}`}>
                  <i className="bi bi-person-vcard"></i>Abrir ficha
                </Link>
              </td>
            </tr>
            {expandido === a.id_alumno && (
              <tr className="adf-fiscal-row">
                <td colSpan={7} style={{ background: "var(--c-surface-2)", padding: 0 }}>
                  <div className="adf-acc__body" style={{ padding: "16px 20px" }}>
                    <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "var(--c-brand-700)", letterSpacing: 0.4, marginBottom: 12 }}>
                      <i className="bi bi-receipt me-2"></i>DATOS FISCALES
                    </div>
                    <div className="adf-form-grid">
                      <div className="adf-form-field"><label>Nombre</label>
                        <input value={fiscalForm.nombre} onChange={(e) => setFiscalForm({ ...fiscalForm, nombre: e.target.value })} /></div>
                      <div className="adf-form-field"><label>Apellido</label>
                        <input value={fiscalForm.apellido} onChange={(e) => setFiscalForm({ ...fiscalForm, apellido: e.target.value })} /></div>
                      <div className="adf-form-field"><label>DUI</label>
                        <input value={fiscalForm.dui} onChange={(e) => setFiscalForm({ ...fiscalForm, dui: e.target.value })} placeholder="00000000-0" /></div>
                      <div className="adf-form-field"><label>Correo electrónico</label>
                        <input type="email" value={fiscalForm.correo} onChange={(e) => setFiscalForm({ ...fiscalForm, correo: e.target.value })} /></div>
                      <div className="adf-form-field"><label>Teléfono</label>
                        <input value={fiscalForm.telefono} onChange={(e) => setFiscalForm({ ...fiscalForm, telefono: e.target.value })} placeholder="0000-0000" /></div>
                      <div className="adf-form-field" style={{ gridColumn: "1 / -1" }}><label>Dirección de casa</label>
                        <input value={fiscalForm.direccion} onChange={(e) => setFiscalForm({ ...fiscalForm, direccion: e.target.value })} placeholder="Dirección completa" /></div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                      <button className="adf-btn secondary small" onClick={() => setExpandido(null)}>Cerrar</button>
                      <button className="adf-btn small" disabled={savingFiscal} onClick={() => guardarFiscal(a.id_alumno)}>
                        <i className="bi bi-check"></i>{savingFiscal ? "Guardando…" : "Guardar"}
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            )}
            </React.Fragment>
          ))}
          {filtrados.length === 0 && (
            <tr><td colSpan={7} style={{ textAlign: "center", padding: 30, color: "var(--c-ink-4)" }}>
              Sin resultados.
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
