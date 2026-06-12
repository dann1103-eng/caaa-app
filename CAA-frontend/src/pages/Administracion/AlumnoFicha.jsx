import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import {
  getAlumnoFicha, actualizarAlumnoFicha, getLicencias,
  getDocumentosAlumno, subirDocumentoAlumno, revisarDocumento, getArchivoUrlDoc,
  getCuentaAlumno, getInstructoresDisponibles, getHistorialAlumno,
} from "../../services/administracionApi";
import SaldoBadge from "../../components/SaldoBadge/SaldoBadge";

const TABS = [
  { key: "perfil", label: "Perfil", icon: "bi-person-vcard" },
  { key: "documentos", label: "Documentos y contratos", icon: "bi-folder2-open" },
  { key: "cuenta", label: "Cuenta corriente", icon: "bi-cash-stack" },
  { key: "historial", label: "Historial", icon: "bi-clock-history" },
];

const DOC_ESTADOS = ["PENDIENTE", "ENTREGADO", "VENCIDO", "RECHAZADO"];

function diasBadge(dias) {
  if (dias == null) return null;
  const color = dias < 0 ? "var(--c-danger-700)" : dias <= 30 ? "var(--c-warn-700)" : "var(--c-accent-700)";
  const txt = dias < 0 ? `Vencido hace ${Math.abs(dias)}d` : `${dias}d`;
  return <span style={{ fontSize: "0.72rem", fontWeight: 700, color }}>{txt}</span>;
}

export default function AlumnoFicha() {
  const { id_alumno } = useParams();
  const [tab, setTab] = useState("perfil");
  const [ficha, setFicha] = useState(null);
  const [licencias, setLicencias] = useState([]);
  const [instructores, setInstructores] = useState([]);
  const [docs, setDocs] = useState([]);
  const [cuenta, setCuenta] = useState(null);
  const [historial, setHistorial] = useState(null);
  const [form, setForm] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const load = async () => {
    try {
      const [f, lic, d, c, inst, hist] = await Promise.all([
        getAlumnoFicha(id_alumno),
        getLicencias().catch(() => []),
        getDocumentosAlumno(id_alumno).catch(() => ({ data: [] })),
        getCuentaAlumno(id_alumno).catch(() => ({ data: null })),
        getInstructoresDisponibles().catch(() => ({ data: [] })),
        getHistorialAlumno(id_alumno).catch(() => ({ data: null })),
      ]);
      setFicha(f);
      setForm({
        telefono: f.telefono || "",
        numero_licencia: f.numero_licencia || "",
        id_licencia: f.id_licencia || "",
        id_instructor: f.id_instructor || "",
        soleado: !!f.soleado,
        certificado_medico: f.certificado_medico ? String(f.certificado_medico).slice(0, 10) : "",
        certificado_medico_numero: f.certificado_medico_numero || "",
        seguro_vida: f.seguro_vida || "",
        seguro_vida_vencimiento: f.seguro_vida_vencimiento ? String(f.seguro_vida_vencimiento).slice(0, 10) : "",
        seguro_vida_numero: f.seguro_vida_numero || "",
        limite_vuelos_avion: f.limite_vuelos_avion ?? "",
        limite_vuelos_simulador: f.limite_vuelos_simulador ?? "",
        // Datos fiscales / facturación (viven en usuario)
        correo: f.correo || "",
        direccion: f.direccion || "",
        dui: f.dui || "",
        es_extranjero: !!f.es_extranjero,
        pasaporte: f.pasaporte || "",
        nacionalidad: f.nacionalidad || "",
      });
      setLicencias(Array.isArray(lic) ? lic : []);
      setInstructores(inst?.ok ? inst.data : (Array.isArray(inst) ? inst : []));
      setDocs(d?.data || []);
      setCuenta(c?.data || null);
      setHistorial(hist?.ok ? hist.data : (hist?.data || null));
    } catch (e) {
      toast.error(e?.response?.data?.message || "No se pudo cargar la ficha del alumno");
    }
  };
  useEffect(() => { load(); }, [id_alumno]);

  const guardarPerfil = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      const payload = {
        ...form,
        id_licencia: form.id_licencia ? Number(form.id_licencia) : null,
        id_instructor: form.id_instructor ? Number(form.id_instructor) : null,
        limite_vuelos_avion: form.limite_vuelos_avion === "" ? null : Number(form.limite_vuelos_avion),
        limite_vuelos_simulador: form.limite_vuelos_simulador === "" ? null : Number(form.limite_vuelos_simulador),
      };
      await actualizarAlumnoFicha(id_alumno, payload);
      toast.success("Ficha actualizada");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Error al guardar");
    } finally {
      setGuardando(false);
    }
  };

  const abrirArchivo = async (idDoc) => {
    try {
      const r = await getArchivoUrlDoc(idDoc);
      if (r?.url) window.open(r.url, "_blank");
      else toast.error("Documento sin archivo");
    } catch (e) {
      toast.error(e?.response?.data?.message || "No se pudo abrir el archivo");
    }
  };

  const subir = async (doc, file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("archivo", file);
    fd.append("id_documento_requerido", doc.id);
    try {
      await subirDocumentoAlumno(id_alumno, fd);
      toast.success(`"${doc.nombre}" subido`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Error al subir el archivo");
    }
  };

  const cambiarEstado = async (doc, estado) => {
    if (!doc.id || !doc.id_documento_requerido) return; // sin registro aún
    try {
      await revisarDocumento(doc.id, { estado });
      toast.success("Estado actualizado");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Error");
    }
  };

  if (!ficha || !form) return <p style={{ padding: 24, color: "var(--c-ink-3)" }}>Cargando ficha…</p>;

  return (
    <div>
      <Link to="/administracion/alumnos" className="adf-btn ghost small" style={{ marginBottom: 12 }}>
        <i className="bi bi-arrow-left"></i> Volver a alumnos
      </Link>

      <header style={{ marginBottom: 20 }}>
        <div className="u-label">Ficha de alumno</div>
        <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, color: "var(--c-ink-1)" }}>
          {ficha.nombre} {ficha.apellido}
        </h1>
        <p style={{ color: "var(--c-ink-3)", fontSize: "var(--text-sm)", marginTop: 4 }}>
          <i className="bi bi-envelope me-1"></i>{ficha.correo}
          {ficha.licencia_nombre && <span style={{ marginLeft: 12 }}><i className="bi bi-award me-1"></i>{ficha.licencia_nombre}</span>}
          {ficha.instructor_nombre && <span style={{ marginLeft: 12 }}><i className="bi bi-person-badge me-1"></i>{ficha.instructor_nombre}</span>}
          <span style={{ marginLeft: 12 }}><i className="bi bi-clock-history me-1"></i>{Number(ficha.horas_acumuladas || 0).toFixed(1)} h acumuladas</span>
        </p>
      </header>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t.key}
            className={`adf-btn ${tab === t.key ? "" : "secondary"}`}
            onClick={() => setTab(t.key)}>
            <i className={`bi ${t.icon}`}></i> {t.label}
          </button>
        ))}
      </div>

      {/* ── Perfil ── */}
      {tab === "perfil" && (
        <div className="adf-card">
          <h3><i className="bi bi-person-vcard me-2"></i>Datos del alumno</h3>
          <form onSubmit={guardarPerfil}>
            <div className="adf-form-grid">
              <div className="adf-form-field">
                <label>Teléfono</label>
                <input value={form.telefono} placeholder="7777-7777"
                  onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
              </div>
              <div className="adf-form-field">
                <label><i className="bi bi-person-badge me-1"></i>Instructor asignado</label>
                <select value={form.id_instructor} onChange={(e) => setForm({ ...form, id_instructor: e.target.value })}>
                  <option value="">— Sin asignar —</option>
                  {instructores.map(i => <option key={i.id_instructor} value={i.id_instructor}>{i.username}</option>)}
                </select>
              </div>
              <div className="adf-form-field">
                <label>Licencia (programa)</label>
                <select value={form.id_licencia} onChange={(e) => setForm({ ...form, id_licencia: e.target.value })}>
                  <option value="">—</option>
                  {licencias.map(l => <option key={l.id_licencia} value={l.id_licencia}>{l.nombre}</option>)}
                </select>
              </div>
              <div className="adf-form-field">
                <label>N° de licencia</label>
                <input value={form.numero_licencia}
                  onChange={(e) => setForm({ ...form, numero_licencia: e.target.value })} />
              </div>
              <div className="adf-form-field">
                <label>Certificado médico (vence)</label>
                <input type="date" value={form.certificado_medico}
                  onChange={(e) => setForm({ ...form, certificado_medico: e.target.value })} />
              </div>
              <div className="adf-form-field">
                <label>N° certificado médico</label>
                <input value={form.certificado_medico_numero}
                  onChange={(e) => setForm({ ...form, certificado_medico_numero: e.target.value })} />
              </div>
              <div className="adf-form-field">
                <label>Seguro de vida (compañía)</label>
                <input value={form.seguro_vida}
                  onChange={(e) => setForm({ ...form, seguro_vida: e.target.value })} />
              </div>
              <div className="adf-form-field">
                <label>Seguro de vida (vence)</label>
                <input type="date" value={form.seguro_vida_vencimiento}
                  onChange={(e) => setForm({ ...form, seguro_vida_vencimiento: e.target.value })} />
              </div>
              <div className="adf-form-field">
                <label>N° póliza seguro</label>
                <input value={form.seguro_vida_numero}
                  onChange={(e) => setForm({ ...form, seguro_vida_numero: e.target.value })} />
              </div>
              <div className="adf-form-field">
                <label>Límite vuelos avión / semana</label>
                <input type="number" min="0" max="6" value={form.limite_vuelos_avion}
                  onChange={(e) => setForm({ ...form, limite_vuelos_avion: e.target.value })} />
              </div>
              <div className="adf-form-field">
                <label>Límite simulador / semana</label>
                <input type="number" min="0" max="6" value={form.limite_vuelos_simulador}
                  onChange={(e) => setForm({ ...form, limite_vuelos_simulador: e.target.value })} />
              </div>
              <div className="adf-form-field">
                <label>Estado de vuelo</label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                  <input type="checkbox" checked={form.soleado}
                    onChange={(e) => setForm({ ...form, soleado: e.target.checked })} />
                  Soleado (puede volar solo)
                </label>
              </div>
            </div>

            {/* ── Datos fiscales / facturación ── */}
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px dashed var(--c-line-2)" }}>
              <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "var(--c-brand-700)", letterSpacing: 0.4, marginBottom: 10 }}>
                <i className="bi bi-receipt me-2"></i>DATOS FISCALES / FACTURACIÓN
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", cursor: "pointer", marginBottom: 12 }}>
                <input type="checkbox" checked={!!form.es_extranjero}
                  onChange={(e) => setForm({ ...form, es_extranjero: e.target.checked })} />
                Alumno extranjero (facturar con pasaporte)
              </label>
              <div className="adf-form-grid">
                {form.es_extranjero ? (
                  <>
                    <div className="adf-form-field"><label>N° de pasaporte</label>
                      <input value={form.pasaporte} onChange={(e) => setForm({ ...form, pasaporte: e.target.value })} placeholder="Ej. A12345678" /></div>
                    <div className="adf-form-field"><label>Nacionalidad / País</label>
                      <input value={form.nacionalidad} onChange={(e) => setForm({ ...form, nacionalidad: e.target.value })} placeholder="Ej. Guatemala" /></div>
                  </>
                ) : (
                  <div className="adf-form-field"><label>DUI</label>
                    <input value={form.dui} onChange={(e) => setForm({ ...form, dui: e.target.value })} placeholder="00000000-0" /></div>
                )}
                <div className="adf-form-field"><label>Correo electrónico</label>
                  <input type="email" value={form.correo} onChange={(e) => setForm({ ...form, correo: e.target.value })} /></div>
                <div className="adf-form-field" style={{ gridColumn: "1 / -1" }}><label>Dirección de casa</label>
                  <input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} placeholder="Dirección completa" /></div>
              </div>
            </div>

            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
              <button type="submit" className="adf-btn" disabled={guardando}>
                <i className="bi bi-check2"></i> {guardando ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Documentos ── */}
      {tab === "documentos" && (
        <div className="adf-card">
          <h3><i className="bi bi-folder2-open me-2"></i>Documentos, seguros, certificados y contratos</h3>
          <table className="adf-table">
            <thead>
              <tr>
                <th>Documento</th>
                <th>Autoridad</th>
                <th>Estado</th>
                <th>Vence</th>
                <th>Archivo</th>
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 && (
                <tr><td colSpan={5} style={{ color: "var(--c-ink-3)", padding: 16 }}>Sin documentos en el catálogo.</td></tr>
              )}
              {docs.map((d) => {
                const dias = d.fecha_vencimiento ? Math.ceil((new Date(d.fecha_vencimiento) - new Date()) / 86400000) : null;
                return (
                  <tr key={d.codigo}>
                    <td><strong>{d.nombre}</strong></td>
                    <td><span className="adf-tag">{d.autoridad}</span></td>
                    <td>
                      {d.id ? (
                        <select value={d.estado || "PENDIENTE"} onChange={(e) => cambiarEstado(d, e.target.value)}
                          style={{ fontSize: "0.8rem", padding: "2px 6px" }}>
                          {DOC_ESTADOS.map(s => <option key={s}>{s}</option>)}
                        </select>
                      ) : <span style={{ color: "var(--c-ink-4)", fontSize: "0.8rem" }}>Sin entregar</span>}
                    </td>
                    <td>{d.fecha_vencimiento ? <>{String(d.fecha_vencimiento).slice(0, 10)} {diasBadge(dias)}</> : <span style={{ color: "var(--c-ink-4)" }}>—</span>}</td>
                    <td>
                      {d.archivo_path && (
                        <button className="adf-btn small secondary" onClick={() => abrirArchivo(d.id)}>
                          <i className="bi bi-eye"></i> Ver
                        </button>
                      )}
                      <label className="adf-btn small ghost" style={{ cursor: "pointer", marginLeft: 6 }}>
                        <i className="bi bi-upload"></i> {d.archivo_path ? "Reemplazar" : "Subir"}
                        <input type="file" accept="application/pdf,image/*" style={{ display: "none" }}
                          onChange={(e) => subir(d, e.target.files?.[0])} />
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Cuenta corriente ── */}
      {tab === "cuenta" && (
        <div className="adf-card">
          <h3><i className="bi bi-cash-stack me-2"></i>Cuenta corriente</h3>
          {cuenta ? (
            <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
              <div>
                <div className="u-label">Saldo actual</div>
                <div style={{ marginTop: 6 }}><SaldoBadge saldo={cuenta.saldo_actual_usd} size="lg" /></div>
              </div>
              <Link to={`/administracion/cuentas/${id_alumno}`} className="adf-btn">
                <i className="bi bi-table"></i> Abrir cuenta corriente completa
              </Link>
            </div>
          ) : (
            <p style={{ color: "var(--c-ink-3)" }}>
              Este alumno aún no tiene cuenta corriente.
              <Link to={`/administracion/cuentas/${id_alumno}`} style={{ marginLeft: 8 }}>Abrir cuenta</Link>
            </p>
          )}
        </div>
      )}

      {/* ── Historial ── */}
      {tab === "historial" && (
        <div className="adf-card">
          <h3><i className="bi bi-clock-history me-2"></i>Historial del alumno</h3>
          {!historial ? (
            <p style={{ color: "var(--c-ink-3)" }}>Sin historial disponible.</p>
          ) : (
            <>
              {/* Bitácora de vuelos */}
              <h4 style={{ margin: "6px 0 8px" }}><i className="bi bi-airplane me-2"></i>Bitácora de vuelos</h4>
              <table className="adf-table">
                <thead><tr><th>Fecha</th><th>Aeronave</th><th style={{ textAlign: "right" }}>Horas</th><th>Instructor</th></tr></thead>
                <tbody>
                  {historial.vuelos.map(v => (
                    <tr key={v.id_vuelo}>
                      <td>{v.fecha_vuelo ? String(v.fecha_vuelo).slice(0, 10) : "—"}</td>
                      <td>{v.aeronave_codigo || v.aeronave_modelo || "—"}{v.inasistencia && <span className="adf-tag amber" style={{ marginLeft: 6 }}>inasistencia</span>}</td>
                      <td className="amount" style={{ textAlign: "right" }}>{Number(v.horas || 0).toFixed(1)}</td>
                      <td style={{ color: "var(--c-ink-3)" }}>{v.instructor_username || "—"}</td>
                    </tr>
                  ))}
                  {historial.vuelos.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--c-ink-4)", padding: 14 }}>Sin vuelos completados.</td></tr>}
                </tbody>
              </table>

              {/* Cursos / inscripciones */}
              <h4 style={{ margin: "16px 0 8px" }}><i className="bi bi-mortarboard me-2"></i>Cursos</h4>
              <table className="adf-table">
                <thead><tr><th>Curso</th><th>Estado</th><th>Inicio</th><th>Finalización</th></tr></thead>
                <tbody>
                  {historial.inscripciones.map(ic => (
                    <tr key={ic.id}>
                      <td><strong>{ic.codigo}</strong> · {ic.nombre}</td>
                      <td><span className="adf-tag">{ic.estado}</span></td>
                      <td>{ic.fecha_inicio ? String(ic.fecha_inicio).slice(0, 10) : "—"}</td>
                      <td>{ic.fecha_finalizacion ? String(ic.fecha_finalizacion).slice(0, 10) : "—"}</td>
                    </tr>
                  ))}
                  {historial.inscripciones.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--c-ink-4)", padding: 14 }}>Sin inscripciones.</td></tr>}
                </tbody>
              </table>

              {/* Exámenes / notas */}
              <h4 style={{ margin: "16px 0 8px" }}><i className="bi bi-card-checklist me-2"></i>Exámenes y notas</h4>
              <table className="adf-table">
                <thead><tr><th>Examen</th><th>Tipo</th><th style={{ textAlign: "right" }}>Nota</th><th>Estado</th></tr></thead>
                <tbody>
                  {historial.notas.map(n => (
                    <tr key={n.id}>
                      <td>{n.examen} {n.origen && <span className="adf-tag" style={{ marginLeft: 4 }}>{n.origen}</span>}</td>
                      <td style={{ color: "var(--c-ink-3)" }}>{n.tipo || "—"}</td>
                      <td className="amount" style={{ textAlign: "right", fontWeight: 700,
                        color: n.nota != null && n.nota_aprobacion != null ? (Number(n.nota) >= Number(n.nota_aprobacion) ? "var(--c-accent-700)" : "var(--c-danger-700)") : "var(--c-ink-3)" }}>
                        {n.nota != null ? Number(n.nota).toFixed(1) : "—"}
                      </td>
                      <td>{n.estado || "—"}</td>
                    </tr>
                  ))}
                  {historial.notas.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--c-ink-4)", padding: 14 }}>Sin notas.</td></tr>}
                </tbody>
              </table>

              {/* Facturas + Recibos */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18, marginTop: 16 }}>
                <div>
                  <h4 style={{ margin: "0 0 8px" }}><i className="bi bi-file-earmark-text me-2"></i>Facturas</h4>
                  <table className="adf-table">
                    <thead><tr><th>N°</th><th>Fecha</th><th style={{ textAlign: "right" }}>Total</th><th>Estado</th></tr></thead>
                    <tbody>
                      {historial.facturas.map(f => (
                        <tr key={f.id}>
                          <td>#{f.numero_correlativo}</td>
                          <td>{f.fecha_emision ? String(f.fecha_emision).slice(0, 10) : "—"}</td>
                          <td className="amount" style={{ textAlign: "right" }}>${Number(f.total_usd || 0).toFixed(2)}</td>
                          <td>{f.estado === "ANULADA" ? <span className="adf-tag amber">ANULADA</span> : <span className="adf-tag green">EMITIDA</span>}</td>
                        </tr>
                      ))}
                      {historial.facturas.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--c-ink-4)", padding: 14 }}>Sin facturas.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div>
                  <h4 style={{ margin: "0 0 8px" }}><i className="bi bi-receipt me-2"></i>Recibos / pagos</h4>
                  <table className="adf-table">
                    <thead><tr><th>N°</th><th>Fecha</th><th style={{ textAlign: "right" }}>Monto</th><th>Método</th></tr></thead>
                    <tbody>
                      {historial.recibos.map(r => (
                        <tr key={r.id} style={{ opacity: r.anulado ? 0.5 : 1 }}>
                          <td>#{r.numero_correlativo}</td>
                          <td>{r.fecha ? String(r.fecha).slice(0, 10) : "—"}</td>
                          <td className="amount pos" style={{ textAlign: "right" }}>${Number(r.monto_usd || 0).toFixed(2)}</td>
                          <td style={{ color: "var(--c-ink-3)" }}>{r.metodo}{r.anulado && " (anulado)"}</td>
                        </tr>
                      ))}
                      {historial.recibos.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--c-ink-4)", padding: 14 }}>Sin recibos.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
