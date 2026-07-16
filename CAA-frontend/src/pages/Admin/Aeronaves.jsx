import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  listarAeronaves, crearAeronave, darDeBajaAeronave, reactivarAeronave,
} from "../../services/adminApi";

const num = (v) => (v == null || v === "" ? "—" : Number(v).toFixed(1));

// Estado operativo. EL ORDEN IMPORTA y no es el intuitivo:
//   - en mantenimiento hoy → activa=false + estado='MANTENIMIENTO'
//   - dada de baja         → activa=false + estado='ACTIVO'  (convención que ya
//                            respeta sincronizarEstadoFlota vía su rama ELSE)
// Es decir, `activa` NO significa "de baja": significa "disponible hoy", y la
// recalcula el job de mantenimiento. Los dos casos comparten activa=false, así
// que hay que preguntar por `estado` PRIMERO o un avión en el taller se muestra
// como dado de baja.
function EstadoTag({ a }) {
  if (a.estado === "MANTENIMIENTO") return <span className="adf-tag amber">Mantenimiento</span>;
  if (a.activa === false) return <span className="adf-tag gray">De baja</span>;
  return <span className="adf-tag green">Activo</span>;
}

// Los simuladores no llevan peso y balance (el SIM-1 vive así desde siempre).
function WBTag({ a }) {
  if (a.tipo === "SIMULADOR") return <span className="adf-tag gray">No aplica</span>;
  return a.tiene_wb
    ? <span className="adf-tag green">Cargado</span>
    : <span className="adf-tag amber">Pendiente</span>;
}

export default function Aeronaves() {
  const [aeronaves, setAeronaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nueva, setNueva] = useState(false);
  const [busy, setBusy] = useState(null);

  const cargar = useCallback(async () => {
    try {
      setAeronaves(await listarAeronaves());
    } catch (e) {
      toast.error(e?.response?.data?.message || "Error al cargar la flota");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const ejecutarBaja = async (a, forzar) => {
    setBusy(a.id_aeronave);
    try {
      await darDeBajaAeronave(a.id_aeronave, forzar);
      toast.success(`${a.codigo} dada de baja`);
      await cargar();
    } catch (e) {
      // 409 = tiene vuelos agendados a futuro. No es un error: es una confirmación
      // que el backend pide antes de dejar esos vuelos con un avión inactivo.
      if (e?.response?.status === 409 && e?.response?.data?.vuelos_futuros) {
        toast(e.response.data.message, {
          description: "Esos vuelos quedarían con una aeronave inactiva. Conviene reasignarlos antes.",
          action: { label: "Dar de baja igual", onClick: () => ejecutarBaja(a, true) },
          cancel: { label: "Cancelar", onClick: () => {} },
          duration: 15000,
        });
      } else {
        toast.error(e?.response?.data?.message || "Error al dar de baja");
      }
    } finally {
      setBusy(null);
    }
  };

  const handleBaja = (a) => {
    toast(`¿Dar de baja ${a.codigo}?`, {
      description: "No se borra nada: el avión queda inactivo y deja de aparecer al agendar. Su historial de vuelos y horas se conserva.",
      action: { label: "Dar de baja", onClick: () => ejecutarBaja(a, false) },
      cancel: { label: "Cancelar", onClick: () => {} },
      duration: 10000,
    });
  };

  const handleReactivar = async (a) => {
    setBusy(a.id_aeronave);
    try {
      await reactivarAeronave(a.id_aeronave);
      toast.success(`${a.codigo} reactivada`);
      await cargar();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Error al reactivar");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <h1 className="adf-section-title"><i className="bi bi-airplane me-2"></i>Aeronaves</h1>
      <p className="adf-section-subtitle">
        Registro de la flota: datos, documentación, peso y balance, y los vuelos de cada avión.
      </p>

      <div className="adf-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ fontSize: "1.05rem", margin: 0 }}>Flota ({aeronaves.length})</h3>
          <button className="adf-btn small" onClick={() => setNueva(true)}>
            <i className="bi bi-plus-lg"></i> Nueva aeronave
          </button>
        </div>

        {loading ? (
          <p style={{ color: "var(--c-ink-3)", fontSize: "0.9rem" }}>Cargando flota…</p>
        ) : aeronaves.length === 0 ? (
          <p style={{ color: "var(--c-ink-3)", fontSize: "0.9rem" }}>No hay aeronaves registradas.</p>
        ) : (
          <div className="adf-table-wrap">
            <table className="adf-table">
              <thead>
                <tr>
                  <th>Matrícula</th>
                  <th>Modelo</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                  <th className="amount">Horas</th>
                  <th>Peso y balance</th>
                  <th className="amount">Vuelos</th>
                  <th style={{ textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {aeronaves.map((a) => (
                  <tr key={a.id_aeronave} style={a.activa === false ? { opacity: 0.55 } : undefined}>
                    <td>
                      <Link to={`/admin/aeronaves/${a.id_aeronave}`} style={{ fontWeight: 600 }}>
                        {a.codigo}
                      </Link>
                    </td>
                    <td>{a.modelo}</td>
                    <td><span className="adf-tag blue">{a.tipo}</span></td>
                    <td><EstadoTag a={a} /></td>
                    <td className="amount">{num(a.horas_acumuladas)}h</td>
                    <td><WBTag a={a} /></td>
                    <td className="amount">{a.total_vuelos}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                        <Link to={`/admin/aeronaves/${a.id_aeronave}`} className="adf-icon-btn" title="Ver ficha">
                          <i className="bi bi-eye"></i>
                        </Link>
                        {a.activa === false ? (
                          <button className="adf-icon-btn" title="Reactivar"
                            disabled={busy === a.id_aeronave}
                            onClick={() => handleReactivar(a)}>
                            <i className="bi bi-arrow-counterclockwise"></i>
                          </button>
                        ) : (
                          <button className="adf-icon-btn danger" title="Dar de baja"
                            disabled={busy === a.id_aeronave}
                            onClick={() => handleBaja(a)}>
                            <i className="bi bi-x-circle"></i>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="adf-note" style={{ marginTop: 12 }}>
          Dar de baja no borra nada: la aeronave queda inactiva y desaparece de los selectores al
          agendar, pero su historial de vuelos, horas y mantenimientos se conserva intacto.
        </p>
      </div>

      {nueva && (
        <NuevaAeronaveModal
          onClose={() => setNueva(false)}
          onSaved={() => { setNueva(false); cargar(); }}
        />
      )}
    </>
  );
}

function NuevaAeronaveModal({ onClose, onSaved }) {
  const [f, setF] = useState({ codigo: "", modelo: "", tipo: "AVION", color: "" });
  const set = (k, v) => setF({ ...f, [k]: v });
  const [saving, setSaving] = useState(false);

  const guardar = async (e) => {
    e.preventDefault();
    if (!f.codigo.trim()) return toast.error("Ingresá la matrícula");
    if (!f.modelo.trim()) return toast.error("Ingresá el modelo");
    setSaving(true);
    try {
      const a = await crearAeronave({ ...f, codigo: f.codigo.trim(), modelo: f.modelo.trim() });
      toast.success(`${a.codigo} dada de alta`);
      onSaved?.();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Error al crear la aeronave");
      setSaving(false);
    }
  };

  return (
    <div className="adf-modal-backdrop" onClick={onClose}>
      <div className="adf-card adf-modal-card" style={{ padding: 0, maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="adf-edit-head">
          <span className="adf-edit-head__title">
            <span className="adf-edit-head__chip"><i className="bi bi-airplane"></i></span>
            Nueva aeronave
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" form="nuevaAeronaveForm" className="adf-btn" disabled={saving}>
              <i className="bi bi-check"></i>{saving ? "Guardando…" : "Guardar"}
            </button>
            <button type="button" className="adf-btn secondary" onClick={onClose}>Cerrar</button>
          </div>
        </div>
        <div style={{ padding: "0 var(--sp-5) var(--sp-5)" }}>
          <form id="nuevaAeronaveForm" onSubmit={guardar}>
            <div className="adf-form-grid">
              <div className="adf-form-field">
                <label>Matrícula</label>
                <input value={f.codigo} onChange={(e) => set("codigo", e.target.value)} placeholder="YS-000-PE" />
              </div>
              <div className="adf-form-field">
                <label>Modelo</label>
                <input value={f.modelo} onChange={(e) => set("modelo", e.target.value)} placeholder="CHEROKEE-140" />
              </div>
              <div className="adf-form-field">
                <label>Tipo</label>
                <select value={f.tipo} onChange={(e) => set("tipo", e.target.value)}>
                  <option value="AVION">Avión</option>
                  <option value="SIMULADOR">Simulador</option>
                </select>
              </div>
              <div className="adf-form-field">
                <label>Color</label>
                <input value={f.color} onChange={(e) => set("color", e.target.value)} placeholder="Blanco y rojo" />
              </div>
            </div>
            <p className="adf-note" style={{ marginTop: 14 }}>
              <i className="bi bi-info-circle"></i>
              <span>
                Después del alta hay que definir <strong>qué licencias pueden volarla</strong> y su
                <strong> tarifa por hora</strong>, o no se va a poder agendar ni cobrar. Su plantilla de
                peso y balance se carga desde la ficha, y hasta entonces el loadsheet de esa aeronave
                se completa a mano.
              </span>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
