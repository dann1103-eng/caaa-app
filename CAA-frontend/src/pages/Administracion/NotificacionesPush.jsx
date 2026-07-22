import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { getPushConfig, updatePushConfig } from "../../services/adminApi";

const ROL_LABEL = {
  ADMIN: "Admin", ADMINISTRACION: "Administración", PROGRAMACION: "Programación",
  TURNO: "Turno", INSTRUCTOR: "Instructor", TALLER: "Taller", DUENO: "Dueño",
};

export default function NotificacionesPush() {
  const [tipos, setTipos] = useState([]);
  const [roles, setRoles] = useState([]);
  const [config, setConfig] = useState({});
  const [original, setOriginal] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const cargar = async () => {
    try {
      const r = await getPushConfig();
      if (r?.ok) {
        setTipos(r.tipos);
        setRoles(r.roles);
        setConfig(r.config);
        setOriginal(JSON.parse(JSON.stringify(r.config)));
      }
    } catch (e) {
      toast.error(e.response?.data?.message || "Error al cargar la configuración");
    } finally { setLoading(false); }
  };
  useEffect(() => { cargar(); }, []);

  const toggle = (tipo, rol) => {
    setConfig((prev) => ({ ...prev, [tipo]: { ...prev[tipo], [rol]: !prev[tipo]?.[rol] } }));
  };

  const hayCambios = tipos.some((t) => roles.some((rol) => !!config[t.tipo]?.[rol] !== !!original[t.tipo]?.[rol]));

  const guardar = async () => {
    const cambios = [];
    for (const t of tipos) {
      for (const rol of roles) {
        const nuevo = !!config[t.tipo]?.[rol];
        const viejo = !!original[t.tipo]?.[rol];
        if (nuevo !== viejo) cambios.push({ tipo: t.tipo, rol, habilitado: nuevo });
      }
    }
    if (cambios.length === 0) return;
    setSaving(true);
    try {
      await updatePushConfig(cambios);
      toast.success("Configuración de notificaciones push guardada.");
      setOriginal(JSON.parse(JSON.stringify(config)));
    } catch (e) {
      toast.error(e.response?.data?.message || "Error al guardar");
    } finally { setSaving(false); }
  };

  if (loading) return <p style={{ color: "var(--c-ink-3)" }}>Cargando…</p>;

  return (
    <div>
      <div className="adf-card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, color: "var(--c-brand-900)", marginBottom: 4 }}>
          <i className="bi bi-bell me-2" style={{ color: "var(--c-brand-700)" }}></i>Notificaciones push por rol
        </div>
        <p style={{ fontSize: "0.85rem", color: "var(--c-ink-3)", margin: 0 }}>
          Elegí qué perfiles reciben cada tipo de aviso del navegador (campanita del Header). Solo le llega a quien
          además haya activado la notificación en su dispositivo — esto solo decide a quién se le OFRECE.
        </p>
      </div>

      <div className="adf-card">
        <div className="adf-table-wrap">
          <table className="adf-table">
            <thead>
              <tr>
                <th style={{ minWidth: 260 }}>Tipo de aviso</th>
                {roles.map((rol) => (
                  <th key={rol} style={{ textAlign: "center" }}>{ROL_LABEL[rol] || rol}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tipos.map((t) => (
                <tr key={t.tipo}>
                  <td>{t.label}</td>
                  {roles.map((rol) => (
                    <td key={rol} style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={!!config[t.tipo]?.[rol]}
                        onChange={() => toggle(t.tipo, rol)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="adf-btn" disabled={!hayCambios || saving} onClick={guardar}>
            <i className="bi bi-check2"></i>{saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
