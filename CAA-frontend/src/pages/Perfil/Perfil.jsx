import { useEffect, useState } from "react";
import { getPerfil, cambiarPassword, cambiarCorreo, updatePerfilInfo, updatePerfilAlumno, refreshToken } from "../../services/usuarioApi";
import {
  getMiInfo, getMiCuenta, getMiExtracto, getMisDocumentos,
  getMiDocumentoArchivoUrl, getMiHistorial,
} from "../../services/alumnoApi";
import { getMiFichaInstructor, getMiHistorialInstructor, firmarMiReciboNomina, abrirMiReciboNomina } from "../../services/instructorApi";
import { toast } from "sonner";
import Header from "../../components/Header/Header";
import { useNavigate } from "react-router-dom";
import "./Perfil.css";

// ── Helpers de formato ──────────────────────────────────────────────
const fmtUSD = (n) => `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("es-SV", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }) : "—";

export default function Perfil() {
  const [perfil, setPerfil] = useState(null);
  const [originalData, setOriginalData] = useState(null);

  const [username, setUsername] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

  const [correo, setCorreo] = useState("");
  const [correoMsg, setCorreoMsg] = useState("");

  // Datos específicos de alumno (editables)
  const [telefono, setTelefono]           = useState("");
  const [numeroLicencia, setNumeroLicencia] = useState("");
  const [certMedico, setCertMedico]       = useState("");
  const [certMedicoNumero, setCertMedicoNumero] = useState("");
  const [seguroVigencia, setSeguroVigencia] = useState("");
  const [seguroNumero, setSeguroNumero]     = useState("");
  const [alumnoMsg, setAlumnoMsg]         = useState("");

  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [errors, setErrors] = useState([]);
  const [passMsg, setPassMsg] = useState("");

  const [saving, setSaving] = useState(false);

  // ── Pestañas + datos de ficha (solo lectura) ──
  const [tab, setTab] = useState("cuenta");
  const [miInfo, setMiInfo]       = useState(null);   // alumno: instructor/licencia/límites
  const [docs, setDocs]           = useState([]);     // alumno: documentos
  const [cuenta, setCuenta]       = useState(null);   // alumno: saldo
  const [extracto, setExtracto]   = useState([]);     // alumno: movimientos
  const [historial, setHistorial] = useState(null);   // alumno: vuelos/cursos/notas/facturas/recibos
  const [insFicha, setInsFicha]   = useState(null);   // instructor: datos/nómina/cursos/alumnos
  const [insHist, setInsHist]     = useState(null);   // instructor: planillas/horas/clases/etc.

  const navigate = useNavigate();

  const goDashboard = (rol) => {
    if (rol === "ALUMNO") navigate("/alumno/dashboard");
    else if (rol === "PROGRAMACION") navigate("/programacion/dashboard");
    else if (rol === "INSTRUCTOR") navigate("/instructor");
    else if (rol === "TURNO") navigate("/turno");
    else if (rol === "ADMINISTRACION") navigate("/administracion/dashboard");
    else if (rol === "TALLER") navigate("/taller/dashboard");
    else navigate("/admin/dashboard");
  };

  const refreshPerfil = async () => {
    try {
      const p = await getPerfil();
      setPerfil(p);
      setOriginalData(p);

      setUsername(p.username || "");
      setCorreo(p.correo || "");
      if (p.rol === "ALUMNO") {
        setTelefono(p.telefono || "");
        setNumeroLicencia(p.numero_licencia || "");
        setCertMedico(p.certificado_medico ? p.certificado_medico.slice(0, 10) : "");
        setCertMedicoNumero(p.certificado_medico_numero || "");
        setSeguroVigencia(p.seguro_vida_vencimiento ? p.seguro_vida_vencimiento.slice(0, 10) : "");
        setSeguroNumero(p.seguro_vida_numero || "");
      }
      return p;
    } catch (e) {
      console.error("Error al cargar perfil:", e);
    }
  };

  useEffect(() => {
    refreshPerfil();
  }, []);

  // Cargar la ficha (solo lectura) según el rol, una vez conocido el perfil.
  useEffect(() => {
    if (!perfil) return;
    if (perfil.rol === "ALUMNO") {
      getMiInfo().then(setMiInfo).catch(() => {});
      getMisDocumentos().then((r) => setDocs(r.data || [])).catch(() => {});
      getMiCuenta().then((r) => setCuenta(r.data)).catch(() => {});
      getMiExtracto().then((r) => setExtracto(r.data || [])).catch(() => {});
      getMiHistorial().then((r) => setHistorial(r.data)).catch(() => {});
    } else if (perfil.rol === "INSTRUCTOR") {
      getMiFichaInstructor().then((r) => setInsFicha(r.data)).catch(() => {});
      getMiHistorialInstructor().then((r) => setInsHist(r.data)).catch(() => {});
    }
  }, [perfil?.rol]); // eslint-disable-line react-hooks/exhaustive-deps

  const firmarRecibo = async (idDet) => {
    try {
      await firmarMiReciboNomina(idDet);
      toast.success("Recibo firmado");
      const r = await getMiHistorialInstructor();
      setInsHist(r.data);
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudo firmar");
    }
  };

  const verDocumento = async (id) => {
    try {
      const r = await getMiDocumentoArchivoUrl(id);
      if (r?.url) window.open(r.url, "_blank", "noopener");
      else toast.error("Documento sin archivo");
    } catch {
      toast.error("No se pudo abrir el documento");
    }
  };

  const handleGuardarDatosAlumno = async () => {
    if (saving) return;
    try {
      setSaving(true);
      setAlumnoMsg("");
      const r = await updatePerfilAlumno({
        telefono,
        numero_licencia: numeroLicencia,
        certificado_medico: certMedico || null,
        certificado_medico_numero: certMedicoNumero || null,
        seguro_vida_vencimiento: seguroVigencia || null,
        seguro_vida_numero: seguroNumero || null,
      });
      setAlumnoMsg(r.message);
      await refreshPerfil();

      const { token: newToken, user: freshUser } = await refreshToken();
      localStorage.setItem("token", newToken);
      localStorage.setItem("user", JSON.stringify(freshUser));

      if (!freshUser.must_complete_profile) {
        toast.success("¡Perfil completado! Redirigiendo...", { id: "redir-msg" });
        setTimeout(() => goDashboard(freshUser.rol), 1500);
      }
    } catch (e) {
      setAlumnoMsg(e.response?.data?.message || "Error al actualizar");
    } finally {
      setSaving(false);
    }
  };

  const validarPassword = (value) => {
    const errs = [];
    if (value.length < 8) errs.push("Mínimo 8 caracteres");
    if (!/[A-Z]/.test(value)) errs.push("Al menos una letra mayúscula");
    if (!/\d/.test(value)) errs.push("Al menos un número");
    setErrors(errs);
  };

  const handlePhoneChange = (e) => {
    let value = e.target.value.replace(/\D/g, "");
    if (value.length > 8) value = value.slice(0, 8);
    if (value.length > 4) {
      value = value.slice(0, 4) + "-" + value.slice(4);
    }
    setTelefono(value);
  };

  const handleSeguroNumeroChange = (e) => {
    const value = e.target.value.replace(/\D/g, "");
    if (value.length <= 5) {
      setSeguroNumero(value);
    }
  };

  const handleCertMedicoNumeroChange = (e) => {
    const value = e.target.value.replace(/\D/g, "");
    if (value.length <= 5) {
      setCertMedicoNumero(value);
    }
  };

  const handleGuardarInfo = async () => {
    if (saving) return;
    try {
      setSaving(true);
      setInfoMsg("");
      const r = await updatePerfilInfo(username);
      setInfoMsg(r.message);

      const p = await refreshPerfil();
      const user = JSON.parse(localStorage.getItem("user"));
      if (user) {
        user.username = p.username;
        localStorage.setItem("user", JSON.stringify(user));
      }
      toast.success("Nombre de usuario actualizado", { id: "info-msg" });
    } catch (e) {
      setInfoMsg(e.response?.data?.message || "Error al actualizar");
    } finally {
      setSaving(false);
    }
  };

  const handleGuardarCorreo = async () => {
    if (saving) return;
    try {
      setSaving(true);
      setCorreoMsg("");
      const r = await cambiarCorreo(correo);
      setCorreoMsg(r.message);

      await refreshPerfil();

      const { token: newToken, user: freshUser } = await refreshToken();
      localStorage.setItem("token", newToken);
      localStorage.setItem("user", JSON.stringify(freshUser));

      toast.success("Correo actualizado correctamente ✅", { id: "correo-msg" });

      if (!freshUser.must_complete_profile) {
        toast.info("¡Perfil completado! Redirigiendo...", { id: "redir-msg" });
        setTimeout(() => goDashboard(freshUser.rol), 1500);
      }
    } catch (e) {
      setCorreoMsg(e.response?.data?.message || "Error al actualizar correo");
    } finally {
      setSaving(false);
    }
  };

  const handleGuardarPassword = async () => {
    if (saving) return;
    try {
      setSaving(true);
      setPassMsg("");
      const r = await cambiarPassword(password);
      setPassMsg(r.message);

      await refreshPerfil();

      const { token: newToken, user: freshUser } = await refreshToken();
      localStorage.setItem("token", newToken);
      localStorage.setItem("user", JSON.stringify(freshUser));

      toast.success("Contraseña actualizada correctamente ✅", { id: "pass-msg" });

      setPassword("");
      setErrors([]);

      if (!freshUser.must_complete_profile) {
        toast.info("¡Perfil completado! Redirigiendo...", { id: "redir-msg" });
        setTimeout(() => goDashboard(freshUser.rol), 1500);
      }
    } catch (e) {
      setPassMsg(e.response?.data?.message || "Error al cambiar contraseña");
    } finally {
      setSaving(false);
    }
  };

  if (!perfil) return <p className="perfil-loading">Cargando…</p>;

  const requiereCambioPass = perfil.must_change_password === true;
  const requiereCorreo = perfil.must_set_email === true || !perfil.correo;

  const requiereDocs = perfil.rol === "ALUMNO" && (
    !perfil.numero_licencia || perfil.numero_licencia.trim() === "" ||
    !perfil.certificado_medico ||
    !perfil.certificado_medico_numero || perfil.certificado_medico_numero.trim() === "" ||
    !perfil.seguro_vida_numero || perfil.seguro_vida_numero.trim() === ""
  );

  const requiereAlgo = requiereCambioPass || requiereCorreo || requiereDocs;

  // Advertencia certificado médico (≤ 30 días)
  const diasCert = certMedico
    ? Math.ceil((new Date(certMedico) - new Date()) / (1000 * 60 * 60 * 24))
    : null;
  const certPorVencer = diasCert !== null && diasCert <= 30;

  const diasSeguro = seguroVigencia
    ? Math.ceil((new Date(seguroVigencia) - new Date()) / (1000 * 60 * 60 * 24))
    : null;
  const seguroVencido = diasSeguro !== null && diasSeguro < 0;
  const seguroProximo = diasSeguro !== null && diasSeguro >= 0 && diasSeguro <= 30;
  const seguroColor = seguroVencido ? 'var(--c-danger-700)' : seguroProximo ? 'var(--c-warn-700)' : 'var(--c-success-700)';

  // Botones activos solo si hay cambios y son válidos
  const infoChanged = username !== originalData?.username && username.trim().length > 0;
  const correoChanged = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
  const passReady = password.length > 0 && errors.length === 0;

  const tabs =
    perfil.rol === "ALUMNO"
      ? [
          { k: "cuenta", label: "Cuenta" },
          { k: "datos", label: "Datos de vuelo" },
          { k: "documentos", label: "Documentos" },
          { k: "cuenta-corriente", label: "Cuenta corriente" },
          { k: "historial", label: "Historial" },
        ]
      : perfil.rol === "INSTRUCTOR"
      ? [
          { k: "cuenta", label: "Cuenta" },
          { k: "ficha", label: "Datos y nómina" },
          { k: "historial", label: "Historial" },
        ]
      : [{ k: "cuenta", label: "Cuenta" }];

  // ── Bloques reutilizables ──
  const SeccionCuenta = (
    <>
      <section className="perfil-section">
        <h3>Información Personal</h3>
        <div className="perfil-kv">
          <div className="perfil-field-group">
            <label className="perfil-label">Nombre</label>
            <input className="perfil-input" type="text" value={perfil.nombre} readOnly />
          </div>
          <div className="perfil-field-group">
            <label className="perfil-label">Apellido</label>
            <input className="perfil-input" type="text" value={perfil.apellido} readOnly />
          </div>
          <div className="perfil-field-group">
            <label className="perfil-label">Nombre de usuario</label>
            <input className="perfil-input" type="text" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
        </div>
        <div className="perfil-actions" style={{ marginTop: "20px" }}>
          <button className="btn-primary" onClick={handleGuardarInfo} disabled={!infoChanged || saving}>
            {saving ? "Guardando..." : "Actualizar nombre de usuario"}
          </button>
          {infoMsg && <span className={infoMsg.includes("✅") ? "msg" : "msg error"}>{infoMsg}</span>}
        </div>
      </section>

      <section className="perfil-section">
        <h3>Contacto</h3>
        {requiereCorreo && <p className="perfil-note">Debes registrar un correo válido para continuar.</p>}
        <div className="perfil-field-group">
          <label className="perfil-label">Correo electrónico</label>
          <input className="perfil-input" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="ejemplo@correo.com" />
        </div>
        <div className="perfil-actions" style={{ marginTop: "20px" }}>
          <button className="btn-secondary" onClick={handleGuardarCorreo} disabled={!correoChanged || saving}>
            {saving ? "Guardando..." : "Guardar correo"}
          </button>
          {correoMsg && <span className={correoMsg.includes("✅") ? "msg" : "msg error"}>{correoMsg}</span>}
        </div>
      </section>

      <section className="perfil-section full">
        <h3>Seguridad</h3>
        {requiereCambioPass && <p className="perfil-note">Por seguridad, debes cambiar la contraseña inicial.</p>}
        <div className="perfil-field-group">
          <label className="perfil-label">Nueva contraseña</label>
          <div className="password-input-wrapper">
            <input
              className="perfil-input"
              type={showPass ? "text" : "password"}
              placeholder="Mín. 8 caracteres, 1 mayús, 1 num."
              value={password}
              onChange={(e) => { setPassword(e.target.value); validarPassword(e.target.value); }}
            />
            <button className="password-toggle-btn" type="button" onClick={() => setShowPass(!showPass)} title={showPass ? "Ocultar" : "Mostrar"}>
              {showPass ? "👁️‍🗨️" : "👁️"}
            </button>
          </div>
        </div>
        <ul className="password-rules">
          {password && (
            <>
              <li className={password.length >= 8 ? "ok" : ""}>Mínimo 8 caracteres</li>
              <li className={/[A-Z]/.test(password) ? "ok" : ""}>Al menos una letra mayúscula</li>
              <li className={/\d/.test(password) ? "ok" : ""}>Al menos un número</li>
            </>
          )}
        </ul>
        <div className="perfil-actions">
          <button className="btn-primary" onClick={handleGuardarPassword} disabled={!passReady || saving}>
            {saving ? "Cambiando..." : "Cambiar contraseña"}
          </button>
          {passMsg && <span className={passMsg.includes("✅") ? "msg" : "msg error"}>{passMsg}</span>}
        </div>
      </section>
    </>
  );

  const SeccionDatosAlumno = (
    <>
      <section className="perfil-section full">
        <h3>Datos de vuelo</h3>
        {certPorVencer && (
          <div className={`perfil-cert-warning ${diasCert < 0 ? "perfil-cert-warning--vencido" : ""}`}>
            {diasCert < 0
              ? `Tu certificado médico venció hace ${Math.abs(diasCert)} días.`
              : `Tu certificado médico vence en ${diasCert} día${diasCert === 1 ? "" : "s"}.`}
          </div>
        )}
        <div className="perfil-kv">
          <div className="perfil-field-group">
            <label className="perfil-label">Teléfono</label>
            <input className="perfil-input" type="tel" value={telefono} onChange={handlePhoneChange} placeholder="Ej. 7777-8888" maxLength={9} />
          </div>
          <div className="perfil-field-group">
            <label className="perfil-label">N° de licencia {requiereAlgo && <span style={{ color: 'red' }}>*</span>}</label>
            <input className="perfil-input" type="text" value={numeroLicencia} onChange={(e) => setNumeroLicencia(e.target.value)} placeholder="Ej. PPL-00123" />
          </div>
          <div className="perfil-field-group">
            <label className="perfil-label">N° de certificado médico {requiereAlgo && <span style={{ color: 'red' }}>*</span>}</label>
            <input className="perfil-input" type="text" value={certMedicoNumero} onChange={handleCertMedicoNumeroChange} placeholder="Máx 5 dígitos" />
          </div>
          <div className="perfil-field-group">
            <label className="perfil-label">Venc. certificado médico {requiereAlgo && <span style={{ color: 'red' }}>*</span>}</label>
            <input className={`perfil-input ${certPorVencer ? "perfil-input--alerta" : ""}`} type="date" value={certMedico} onChange={(e) => setCertMedico(e.target.value)} />
          </div>
          <div className="perfil-field-group">
            <label className="perfil-label">N° de Póliza / Seguro {requiereAlgo && <span style={{ color: 'red' }}>*</span>}</label>
            <input className="perfil-input" type="text" value={seguroNumero} onChange={handleSeguroNumeroChange} placeholder="Máx 5 dígitos" />
          </div>
          <div className="perfil-field-group">
            <label className="perfil-label">Vigencia del seguro</label>
            <input className={`perfil-input ${seguroVencido ? "perfil-input--alerta" : ""}`} type="date" value={seguroVigencia} onChange={(e) => setSeguroVigencia(e.target.value)} />
            {seguroVigencia && (
              <span style={{ fontSize: '0.8rem', marginTop: '4px', fontWeight: '500', display: 'block', color: seguroColor }}>
                {seguroVencido ? "Vencido" : `Vence el ${new Date(seguroVigencia + "T00:00:00").toLocaleDateString('es-SV', { day: '2-digit', month: '2-digit', year: 'numeric' })}`}
              </span>
            )}
          </div>
        </div>
        <div className="perfil-actions" style={{ marginTop: "20px" }}>
          <button className="btn-primary" onClick={handleGuardarDatosAlumno} disabled={saving}>
            {saving ? "Guardando..." : "Guardar datos personales"}
          </button>
          {alumnoMsg && <span className={alumnoMsg.includes("✅") ? "msg" : "msg error"}>{alumnoMsg}</span>}
        </div>
      </section>

      {/* Datos gestionados por Administración (solo lectura) */}
      <section className="perfil-section full">
        <h3>Programa y asignación <span className="perfil-ro-tag">solo lectura</span></h3>
        <div className="perfil-kv">
          <div className="perfil-field-group">
            <label className="perfil-label">Instructor asignado</label>
            <input className="perfil-input" readOnly value={miInfo ? `${miInfo.instructor_nombre || ""} ${miInfo.instructor_apellido || ""}`.trim() || "—" : "…"} />
          </div>
          <div className="perfil-field-group">
            <label className="perfil-label">Licencia / programa</label>
            <input className="perfil-input" readOnly value={miInfo?.licencia || "—"} />
          </div>
          <div className="perfil-field-group">
            <label className="perfil-label">Condición de vuelo</label>
            <div className={`perfil-soleado-badge ${perfil.soleado ? "perfil-soleado-badge--on" : "perfil-soleado-badge--off"}`}>
              {perfil.soleado ? "Solo" : "Dual"}
            </div>
          </div>
          <div className="perfil-field-group">
            <label className="perfil-label">Límite vuelos · avión / sim (semana)</label>
            <input className="perfil-input" readOnly value={miInfo ? `${miInfo.limite_vuelos_avion ?? 3} / ${miInfo.limite_vuelos_simulador ?? 3}` : "…"} />
          </div>
        </div>
      </section>
    </>
  );

  const estadoChip = (estado) => {
    const map = {
      ENTREGADO: "ok", APROBADO: "ok", PAGADA: "ok", COMPLETADO: "ok",
      PENDIENTE: "warn", PENDIENTE_ALUMNO: "warn", EN_CURSO: "warn", BORRADOR: "warn",
      VENCIDO: "bad", RECHAZADO: "bad", ANULADA: "bad",
    };
    return <span className={`perfil-chip perfil-chip--${map[estado] || "neutral"}`}>{estado || "—"}</span>;
  };

  const SeccionDocumentos = (
    <section className="perfil-section full">
      <h3>Documentos y contratos <span className="perfil-ro-tag">solo lectura</span></h3>
      <div className="perfil-ro-table-wrap">
        <table className="perfil-ro-table">
          <thead>
            <tr><th>Documento</th><th>Autoridad</th><th>Estado</th><th>Vence</th><th>Archivo</th></tr>
          </thead>
          <tbody>
            {docs.length === 0 ? (
              <tr><td colSpan={5} className="perfil-ro-empty">No hay documentos.</td></tr>
            ) : docs.map((d) => (
              <tr key={d.codigo || d.id}>
                <td>{d.nombre}</td>
                <td>{d.autoridad || "—"}</td>
                <td>{estadoChip(d.estado || "PENDIENTE")}</td>
                <td>{fmtDate(d.fecha_vencimiento)}</td>
                <td>
                  {d.archivo_path ? (
                    <button className="perfil-link-btn" onClick={() => verDocumento(d.id)}>
                      <i className="bi bi-eye"></i> Ver
                    </button>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  const SeccionCuentaCorriente = (
    <section className="perfil-section full">
      <h3>Cuenta corriente <span className="perfil-ro-tag">solo lectura</span></h3>
      <div className="perfil-saldo">
        <span className="perfil-saldo-lbl">Saldo actual</span>
        <span className={`perfil-saldo-num ${Number(cuenta?.saldo_actual_usd) < 0 ? "perfil-saldo-num--neg" : ""}`}>
          {cuenta ? fmtUSD(cuenta.saldo_actual_usd) : "…"}
        </span>
      </div>
      <div className="perfil-ro-table-wrap">
        <table className="perfil-ro-table">
          <thead>
            <tr><th>Fecha</th><th>Descripción</th><th className="num">Monto</th><th className="num">Saldo</th></tr>
          </thead>
          <tbody>
            {extracto.length === 0 ? (
              <tr><td colSpan={4} className="perfil-ro-empty">Sin movimientos.</td></tr>
            ) : extracto.map((m) => (
              <tr key={m.id}>
                <td>{fmtDate(m.fecha)}</td>
                <td>{m.descripcion}{m.nota ? ` · ${m.nota}` : ""}</td>
                <td className={`num ${Number(m.monto_usd) < 0 ? "neg" : "pos"}`}>{fmtUSD(m.monto_usd)}</td>
                <td className="num">{fmtUSD(m.saldo_resultante_usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  const SeccionHistorialAlumno = (
    <>
      <section className="perfil-section full">
        <h3>Bitácora de vuelos</h3>
        <div className="perfil-ro-table-wrap">
          <table className="perfil-ro-table">
            <thead><tr><th>Fecha</th><th>Aeronave</th><th className="num">Horas</th><th>Instructor</th></tr></thead>
            <tbody>
              {!historial?.vuelos?.length ? (
                <tr><td colSpan={4} className="perfil-ro-empty">Sin vuelos completados.</td></tr>
              ) : historial.vuelos.map((v) => (
                <tr key={v.id_vuelo}>
                  <td>{fmtDate(v.fecha_vuelo)}</td>
                  <td>{v.aeronave_codigo || "—"}</td>
                  <td className="num">{v.inasistencia ? "Inasist." : Number(v.horas).toFixed(1)}</td>
                  <td>{v.instructor_username || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="perfil-section full">
        <h3>Cursos</h3>
        <div className="perfil-ro-table-wrap">
          <table className="perfil-ro-table">
            <thead><tr><th>Curso</th><th>Estado</th><th>Inicio</th><th>Fin</th></tr></thead>
            <tbody>
              {!historial?.inscripciones?.length ? (
                <tr><td colSpan={4} className="perfil-ro-empty">Sin inscripciones.</td></tr>
              ) : historial.inscripciones.map((c) => (
                <tr key={c.id}>
                  <td>{c.codigo} · {c.nombre}</td>
                  <td>{estadoChip(c.estado)}</td>
                  <td>{fmtDate(c.fecha_inicio)}</td>
                  <td>{fmtDate(c.fecha_finalizacion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="perfil-section full">
        <h3>Exámenes y notas</h3>
        <div className="perfil-ro-table-wrap">
          <table className="perfil-ro-table">
            <thead><tr><th>Examen</th><th>Tipo</th><th>Origen</th><th className="num">Nota</th><th>Estado</th></tr></thead>
            <tbody>
              {!historial?.notas?.length ? (
                <tr><td colSpan={5} className="perfil-ro-empty">Sin notas.</td></tr>
              ) : historial.notas.map((n) => (
                <tr key={n.id}>
                  <td>{n.examen}</td>
                  <td>{n.tipo}</td>
                  <td>{n.origen}</td>
                  <td className={`num ${n.nota != null && n.nota_aprobacion != null ? (Number(n.nota) >= Number(n.nota_aprobacion) ? "pos" : "neg") : ""}`}>
                    {n.nota ?? "—"}
                  </td>
                  <td>{estadoChip(n.estado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );

  const SeccionFichaInstructor = (
    <>
      <section className="perfil-section full">
        <h3>Datos del instructor <span className="perfil-ro-tag">solo lectura</span></h3>
        <div className="perfil-kv">
          <div className="perfil-field-group"><label className="perfil-label">Licencia</label><input className="perfil-input" readOnly value={insFicha?.licencia || "—"} /></div>
          <div className="perfil-field-group"><label className="perfil-label">Cargo</label><input className="perfil-input" readOnly value={insFicha?.cargo || "—"} /></div>
          <div className="perfil-field-group"><label className="perfil-label">Alumnos asignados</label><input className="perfil-input" readOnly value={insFicha?.num_alumnos ?? "—"} /></div>
          <div className="perfil-field-group"><label className="perfil-label">Estado</label>
            <div className={`perfil-soleado-badge ${insFicha?.instructor_activo ? "perfil-soleado-badge--on" : "perfil-soleado-badge--off"}`}>
              {insFicha?.instructor_activo ? "Activo" : "Inactivo"}
            </div>
          </div>
        </div>
      </section>

      <section className="perfil-section full">
        <h3>Nómina y datos fiscales <span className="perfil-ro-tag">solo lectura</span></h3>
        <div className="perfil-kv">
          <div className="perfil-field-group"><label className="perfil-label">Tipo de planilla</label><input className="perfil-input" readOnly value={insFicha ? (insFicha.es_servicios_profesionales ? "Servicios profesionales (10%)" : "Planta (ISR/ISSS/AFP)") : "—"} /></div>
          <div className="perfil-field-group"><label className="perfil-label">Sueldo base</label><input className="perfil-input" readOnly value={insFicha?.sueldo_base != null ? fmtUSD(insFicha.sueldo_base) : "—"} /></div>
          <div className="perfil-field-group"><label className="perfil-label">DUI</label><input className="perfil-input" readOnly value={insFicha?.dui || "—"} /></div>
          <div className="perfil-field-group"><label className="perfil-label">NIT</label><input className="perfil-input" readOnly value={insFicha?.nit || "—"} /></div>
          <div className="perfil-field-group"><label className="perfil-label">ISSS</label><input className="perfil-input" readOnly value={insFicha?.isss_num || "—"} /></div>
          <div className="perfil-field-group"><label className="perfil-label">AFP</label><input className="perfil-input" readOnly value={insFicha?.afp_num || "—"} /></div>
        </div>
      </section>

      <section className="perfil-section">
        <h3>Cursos que imparte</h3>
        {!insFicha?.cursos?.length ? <p className="perfil-ro-empty">Sin cursos asignados.</p> : (
          <div className="perfil-chips">
            {insFicha.cursos.map((c, i) => <span key={i} className="perfil-chip perfil-chip--neutral">{c.codigo} · {c.nombre}</span>)}
          </div>
        )}
      </section>

      <section className="perfil-section">
        <h3>Alumnos asignados</h3>
        {!insFicha?.alumnos?.length ? <p className="perfil-ro-empty">Sin alumnos.</p> : (
          <ul className="perfil-list">
            {insFicha.alumnos.map((a, i) => <li key={i}>{a.nombre} <span className="perfil-muted">· {a.licencia || "—"}</span></li>)}
          </ul>
        )}
      </section>
    </>
  );

  const SeccionHistorialInstructor = (
    <>
      <section className="perfil-section full">
        <h3>Resumen</h3>
        <div className="perfil-stats">
          <div className="perfil-stat"><span className="perfil-stat-num">{insHist ? Number(insHist.horas?.horas_total || 0).toFixed(1) : "…"}</span><span className="perfil-stat-lbl">Horas instruidas</span></div>
          <div className="perfil-stat"><span className="perfil-stat-num">{insHist?.horas?.vuelos ?? "…"}</span><span className="perfil-stat-lbl">Vuelos</span></div>
          <div className="perfil-stat"><span className="perfil-stat-num">{insHist?.clases?.length ?? "…"}</span><span className="perfil-stat-lbl">Clases dadas</span></div>
          <div className="perfil-stat"><span className="perfil-stat-num">{insHist?.examenes_total ?? "…"}</span><span className="perfil-stat-lbl">Exámenes creados</span></div>
          <div className="perfil-stat"><span className="perfil-stat-num">{insHist ? fmtUSD(insHist.teoria?.pagado) : "…"}</span><span className="perfil-stat-lbl">Teoría pagada</span></div>
          <div className="perfil-stat"><span className="perfil-stat-num">{insHist ? fmtUSD(insHist.teoria?.pendiente) : "…"}</span><span className="perfil-stat-lbl">Teoría pendiente</span></div>
        </div>
      </section>

      <section className="perfil-section full">
        <h3>Planillas / pagos</h3>
        <div className="perfil-ro-table-wrap">
          <table className="perfil-ro-table">
            <thead><tr><th>Periodo</th><th>Tipo</th><th className="num">Bruto</th><th className="num">ISR</th><th className="num">ISSS</th><th className="num">AFP</th><th className="num">Retención</th><th className="num">Neto</th><th>Estado</th><th>Recibo</th></tr></thead>
            <tbody>
              {!insHist?.planillas?.length ? (
                <tr><td colSpan={10} className="perfil-ro-empty">Sin planillas.</td></tr>
              ) : insHist.planillas.map((p) => (
                <tr key={p.id_periodo}>
                  <td>{p.mes ? `${["","Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"][p.mes]} ${p.anio}` : `${fmtDate(p.periodo_inicio)} – ${fmtDate(p.periodo_fin)}`}</td>
                  <td>{p.tipo_planilla}</td>
                  <td className="num">{fmtUSD(p.bruto)}</td>
                  <td className="num">{fmtUSD(p.isr)}</td>
                  <td className="num">{fmtUSD(p.isss)}</td>
                  <td className="num">{fmtUSD(p.afp)}</td>
                  <td className="num">{fmtUSD(p.retencion)}</td>
                  <td className="num"><strong>{fmtUSD(p.neto)}</strong></td>
                  <td>{estadoChip(p.estado)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="perfil-link-btn" onClick={() => abrirMiReciboNomina(p.id_detalle)}><i className="bi bi-receipt"></i> PDF</button>
                    {(p.estado === "APROBADA" || p.estado === "PAGADA") && (
                      p.firmado_en
                        ? <span className="perfil-chip perfil-chip--ok" style={{ marginLeft: 8 }}>Firmado</span>
                        : <button className="perfil-link-btn" style={{ marginLeft: 8 }} onClick={() => firmarRecibo(p.id_detalle)}><i className="bi bi-pen"></i> Firmar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );

  return (
    <>
      <Header />

      <div className="perfil-container">
        <div className="perfil-card wide">
          <div className="perfil-header">
            <div>
              <p className="perfil-sub">Gestión de cuenta</p>
              <h2>Mi perfil</h2>
              <p className="perfil-sub">Administra tus datos personales y seguridad.</p>
            </div>
            {requiereAlgo && <span className="perfil-badge">Perfil incompleto</span>}
          </div>

          {tabs.length > 1 && (
            <div className="perfil-tabs">
              {tabs.map((t) => (
                <button
                  key={t.k}
                  className={`perfil-tab ${tab === t.k ? "perfil-tab--active" : ""}`}
                  onClick={() => setTab(t.k)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          <div className="perfil-grid">
            {tab === "cuenta" && SeccionCuenta}
            {tab === "datos" && perfil.rol === "ALUMNO" && SeccionDatosAlumno}
            {tab === "documentos" && perfil.rol === "ALUMNO" && SeccionDocumentos}
            {tab === "cuenta-corriente" && perfil.rol === "ALUMNO" && SeccionCuentaCorriente}
            {tab === "historial" && perfil.rol === "ALUMNO" && SeccionHistorialAlumno}
            {tab === "ficha" && perfil.rol === "INSTRUCTOR" && SeccionFichaInstructor}
            {tab === "historial" && perfil.rol === "INSTRUCTOR" && SeccionHistorialInstructor}
          </div>
        </div>
      </div>
    </>
  );
}
