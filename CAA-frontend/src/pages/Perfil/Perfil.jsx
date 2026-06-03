import { useEffect, useState } from "react";
import { getPerfil, cambiarPassword, cambiarCorreo, updatePerfilInfo, updatePerfilAlumno, refreshToken } from "../../services/usuarioApi";
import { toast } from "sonner";
import Header from "../../components/Header/Header";
import { useNavigate } from "react-router-dom";
import "./Perfil.css";

export default function Perfil() {
  const [perfil, setPerfil] = useState(null);
  const [originalData, setOriginalData] = useState(null);

  const [username, setUsername] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

  const [correo, setCorreo] = useState("");
  const [correoMsg, setCorreoMsg] = useState("");

  // Datos específicos de alumno
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

  const navigate = useNavigate();

  const goDashboard = (rol) => {
    if (rol === "ALUMNO") navigate("/alumno/dashboard");
    else if (rol === "PROGRAMACION") navigate("/programacion/dashboard");
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

            {requiereAlgo && (
              <span className="perfil-badge">
                Perfil incompleto
              </span>
            )}
          </div>

          <div className="perfil-grid">
            <section className="perfil-section">
              <h3>Información Personal</h3>
              <div className="perfil-kv">
                <div className="perfil-field-group">
                  <label className="perfil-label">Nombre</label>
                  <input
                    className="perfil-input"
                    type="text"
                    value={perfil.nombre}
                    readOnly
                  />
                </div>
                <div className="perfil-field-group">
                  <label className="perfil-label">Apellido</label>
                  <input
                    className="perfil-input"
                    type="text"
                    value={perfil.apellido}
                    readOnly
                  />
                </div>
                <div className="perfil-field-group">
                  <label className="perfil-label">Nombre de usuario</label>
                  <input
                    className="perfil-input"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
              </div>
              <div className="perfil-actions" style={{ marginTop: "20px" }}>
                <button
                  className="btn-primary"
                  onClick={handleGuardarInfo}
                  disabled={!infoChanged || saving}
                >
                  {saving ? "Guardando..." : "Actualizar nombre de usuario"}
                </button>
                {infoMsg && <span className={infoMsg.includes("✅") ? "msg" : "msg error"}>{infoMsg}</span>}
              </div>
            </section>

            <section className="perfil-section">
              <h3>Contacto</h3>

              {requiereCorreo && (
                <p className="perfil-note">
                  Debes registrar un correo válido para continuar.
                </p>
              )}

              <div className="perfil-field-group">
                <label className="perfil-label">Correo electrónico</label>
                <input
                  className="perfil-input"
                  type="email"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  placeholder="ejemplo@correo.com"
                />
              </div>

              <div className="perfil-actions" style={{ marginTop: "20px" }}>
                <button
                  className="btn-secondary"
                  onClick={handleGuardarCorreo}
                  disabled={!correoChanged || saving}
                >
                  {saving ? "Guardando..." : "Guardar correo"}
                </button>
                {correoMsg && <span className={correoMsg.includes("✅") ? "msg" : "msg error"}>{correoMsg}</span>}
              </div>
            </section>

            {perfil.rol === "ALUMNO" && (
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
                    <input
                      className="perfil-input"
                      type="tel"
                      value={telefono}
                      onChange={handlePhoneChange}
                      placeholder="Ej. 7777-8888"
                      maxLength={9}
                    />
                  </div>
                  <div className="perfil-field-group">
                    <label className="perfil-label">N° de licencia {requiereAlgo && <span style={{color: 'red'}}>*</span>}</label>
                    <input
                      className="perfil-input"
                      type="text"
                      value={numeroLicencia}
                      onChange={(e) => setNumeroLicencia(e.target.value)}
                      placeholder="Ej. PPL-00123"
                    />
                  </div>
                  <div className="perfil-field-group">
                    <label className="perfil-label">N° de certificado médico {requiereAlgo && <span style={{color: 'red'}}>*</span>}</label>
                    <input
                      className="perfil-input"
                      type="text"
                      value={certMedicoNumero}
                      onChange={handleCertMedicoNumeroChange}
                      placeholder="Máx 5 dígitos"
                    />
                  </div>
                  <div className="perfil-field-group">
                    <label className="perfil-label">Venc. certificado médico {requiereAlgo && <span style={{color: 'red'}}>*</span>}</label>
                    <input
                      className={`perfil-input ${certPorVencer ? "perfil-input--alerta" : ""}`}
                      type="date"
                      value={certMedico}
                      onChange={(e) => setCertMedico(e.target.value)}
                    />
                  </div>

                  <div className="perfil-field-group">
                    <label className="perfil-label">N° de Póliza / Seguro {requiereAlgo && <span style={{color: 'red'}}>*</span>}</label>
                    <input
                      className="perfil-input"
                      type="text"
                      value={seguroNumero}
                      onChange={handleSeguroNumeroChange}
                      placeholder="Máx 5 dígitos"
                    />
                  </div>
                  <div className="perfil-field-group">
                    <label className="perfil-label">Vigencia del seguro</label>
                    <input
                      className={`perfil-input ${seguroVencido ? "perfil-input--alerta" : ""}`}
                      type="date"
                      value={seguroVigencia}
                      onChange={(e) => setSeguroVigencia(e.target.value)}
                    />
                    {seguroVigencia && (
                      <span style={{ fontSize: '0.8rem', marginTop: '4px', fontWeight: '500', display: 'block', color: seguroColor }}>
                        {seguroVencido ? "Vencido" : `Vence el ${new Date(seguroVigencia + "T00:00:00").toLocaleDateString('es-SV', {day: '2-digit', month: '2-digit', year: 'numeric'})}`}
                      </span>
                    )}
                  </div>
                  <div className="perfil-field-group">
                    <label className="perfil-label">Soleado</label>
                    <div className={`perfil-soleado-badge ${perfil.soleado ? "perfil-soleado-badge--on" : "perfil-soleado-badge--off"}`}>
                      {perfil.soleado ? "Solo" : "Dual"}
                    </div>
                  </div>
                </div>

                <div className="perfil-actions" style={{ marginTop: "20px" }}>
                  <button className="btn-primary" onClick={handleGuardarDatosAlumno} disabled={saving}>
                    {saving ? "Guardando..." : "Guardar datos personales"}
                  </button>
                  {alumnoMsg && (
                    <span className={alumnoMsg.includes("✅") ? "msg" : "msg error"}>
                      {alumnoMsg}
                    </span>
                  )}
                </div>
              </section>
            )}

            <section className="perfil-section full">
              <h3>Seguridad</h3>

              {requiereCambioPass && (
                <p className="perfil-note">
                  Por seguridad, debes cambiar la contraseña inicial.
                </p>
              )}

              <div className="perfil-field-group">
                <label className="perfil-label">Nueva contraseña</label>
                <div className="password-input-wrapper">
                  <input
                    className="perfil-input"
                    type={showPass ? "text" : "password"}
                    placeholder="Mín. 8 caracteres, 1 mayús, 1 num."
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      validarPassword(e.target.value);
                    }}
                  />
                  <button
                    className="password-toggle-btn"
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    title={showPass ? "Ocultar" : "Mostrar"}
                  >
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
                <button
                  className="btn-primary"
                  onClick={handleGuardarPassword}
                  disabled={!passReady || saving}
                >
                  {saving ? "Cambiando..." : "Cambiar contraseña"}
                </button>
                {passMsg && <span className={passMsg.includes("✅") ? "msg" : "msg error"}>{passMsg}</span>}
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}