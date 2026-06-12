import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getPerfil, cambiarPassword, cambiarCorreo, confirmarDatos, refreshToken } from "../../services/usuarioApi";
import "./ConfirmDataModal.css";

const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || "");

/**
 * Robapantallas de primer login (alumnos e instructores): bloquea el home hasta
 * que el usuario confirme sus datos generales/fiscales (y cambie contraseña/correo
 * inicial si aplica). No se puede cerrar. Al confirmar, refresca el token y, si ya
 * no queda nada pendiente, se desmonta (el padre deja de renderizarlo).
 */
export default function ConfirmDataModal({ user, onDone }) {
  const [perfil, setPerfil] = useState(null);
  const [f, setF] = useState({ nombre: "", apellido: "", correo: "", telefono: "", dui: "", direccion: "", password: "", es_extranjero: false, pasaporte: "", nacionalidad: "" });
  const [saving, setSaving] = useState(false);

  const requierePass   = user?.must_change_password === true;
  const requiereCorreo = user?.must_set_email === true;
  // Solo alumnos/instructores confirman datos generales/fiscales. El personal
  // (admin, etc.) que cae acá es por contraseña/correo inicial → modo reducido.
  const requiereDatos  = user?.must_confirm_data === true;

  useEffect(() => {
    getPerfil().then((p) => {
      setPerfil(p);
      setF((prev) => ({
        ...prev,
        nombre: p.nombre || "", apellido: p.apellido || "",
        correo: p.correo || "", telefono: p.telefono || "",
        dui: p.dui || "", direccion: p.direccion || "",
        es_extranjero: !!p.es_extranjero, pasaporte: p.pasaporte || "", nacionalidad: p.nacionalidad || "",
      }));
    }).catch(() => {});
  }, []);

  const guardar = async (e) => {
    e.preventDefault();
    // Validaciones
    if (!emailOk(f.correo)) return toast.error("Ingresá un correo válido.");
    if (requiereDatos) {
      if (!f.nombre.trim() || !f.apellido.trim()) return toast.error("Ingresá tu nombre y apellido.");
      if (!f.telefono.trim() || !f.direccion.trim()) return toast.error("Completá teléfono y dirección.");
      if (f.es_extranjero) {
        if (!f.pasaporte.trim() || !f.nacionalidad.trim()) return toast.error("Completá pasaporte y nacionalidad.");
      } else if (!f.dui.trim()) {
        return toast.error("Completá tu DUI.");
      }
    }
    if (requierePass) {
      if (!/^(?=.*[A-Z])(?=.*\d).{8,}$/.test(f.password)) {
        return toast.error("La nueva contraseña debe tener 8+ caracteres, una mayúscula y un número.");
      }
    }
    setSaving(true);
    try {
      if (requierePass) await cambiarPassword(f.password);
      if (requiereCorreo || (f.correo !== (perfil?.correo || ""))) await cambiarCorreo(f.correo);
      if (requiereDatos) await confirmarDatos({
        nombre: f.nombre, apellido: f.apellido, telefono: f.telefono, direccion: f.direccion,
        es_extranjero: f.es_extranjero,
        dui: f.es_extranjero ? "" : f.dui,
        pasaporte: f.es_extranjero ? f.pasaporte : "",
        nacionalidad: f.es_extranjero ? f.nacionalidad : "",
      });

      const { token, user: fresh } = await refreshToken();
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(fresh));
      toast.success("¡Datos confirmados! Bienvenido.");
      onDone(fresh);
    } catch (err) {
      toast.error(err.response?.data?.message || "No se pudieron guardar los datos.");
    } finally { setSaving(false); }
  };

  return (
    <div className="cdm-backdrop">
      <div className="cdm-card">
        <div className="cdm-head">
          <span className="cdm-logo"><img src="/iso-caaa-navy.png" alt="CAAA" /></span>
          <div>
            <h2 className="cdm-title">{requiereDatos ? "Confirmá tus datos" : "Actualizá tus credenciales"}</h2>
            <p className="cdm-sub">{requiereDatos
              ? "Antes de entrar, verificá que tu información esté correcta. Es solo una vez."
              : "Por seguridad, actualizá tu acceso antes de continuar."}</p>
          </div>
        </div>

        <form onSubmit={guardar} className="cdm-body">
          <div className="cdm-grid">
            {requiereDatos && <>
            <div className="cdm-field"><label>Nombre</label>
              <input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></div>
            <div className="cdm-field"><label>Apellido</label>
              <input value={f.apellido} onChange={(e) => setF({ ...f, apellido: e.target.value })} /></div>
            </>}
            <div className="cdm-field cdm-field--full"><label>Correo electrónico</label>
              <input type="email" value={f.correo} onChange={(e) => setF({ ...f, correo: e.target.value })} /></div>
            {requiereDatos && <>
            <div className="cdm-field"><label>Teléfono</label>
              <input value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} placeholder="0000-0000" /></div>
            {f.es_extranjero ? (
              <div className="cdm-field"><label>N° de pasaporte</label>
                <input value={f.pasaporte} onChange={(e) => setF({ ...f, pasaporte: e.target.value })} placeholder="Ej. A12345678" /></div>
            ) : (
              <div className="cdm-field"><label>DUI</label>
                <input value={f.dui} onChange={(e) => setF({ ...f, dui: e.target.value })} placeholder="00000000-0" /></div>
            )}
            {f.es_extranjero && (
              <div className="cdm-field"><label>Nacionalidad / País</label>
                <input value={f.nacionalidad} onChange={(e) => setF({ ...f, nacionalidad: e.target.value })} placeholder="Ej. Guatemala" /></div>
            )}
            <div className="cdm-field cdm-field--full"><label>Dirección de casa</label>
              <input value={f.direccion} onChange={(e) => setF({ ...f, direccion: e.target.value })} placeholder="Dirección completa" /></div>
            <label className="cdm-field--full" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem", cursor: "pointer" }}>
              <input type="checkbox" checked={f.es_extranjero} onChange={(e) => setF({ ...f, es_extranjero: e.target.checked })} />
              Soy extranjero (facturar con pasaporte)
            </label>
            </>}
            {requierePass && (
              <div className="cdm-field cdm-field--full">
                <label>Nueva contraseña <span className="cdm-req">(obligatorio)</span></label>
                <input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })}
                  placeholder="Mínimo 8 caracteres, 1 mayúscula y 1 número" />
              </div>
            )}
          </div>

          <button type="submit" className="cdm-submit" disabled={saving || !perfil}>
            {saving ? "Guardando…" : "Confirmar y entrar"}
          </button>
          <p className="cdm-note">Tus datos son confidenciales y solo los usa la academia.</p>
        </form>
      </div>
    </div>
  );
}
