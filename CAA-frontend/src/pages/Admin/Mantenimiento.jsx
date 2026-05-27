import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  getMantenimientoAeronaves,
  completarMantenimiento,
  registrarHorasManuales,
} from "../../services/adminApi";
import IniciarMantenimientoModal from "../../components/IniciarMantenimientoModal/IniciarMantenimientoModal";
import GestionarMantenimientoModal from "../../components/GestionarMantenimientoModal/GestionarMantenimientoModal";
import "./Mantenimiento.css";

function formatFecha(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC",
  });
}

function BarraHoras({ acumuladas, proxima }) {
  const restantes = proxima - acumuladas;
  const pct = proxima > 0
    ? Math.min(100, Math.round((acumuladas / proxima) * 100))
    : 0;
  
  // Colores: verde si >20 horas restantes, amarillo si 5-20, rojo si <5
  const cls =
    restantes < 5 ? "mnt__barra--rojo" :
    restantes <= 20 ? "mnt__barra--amarillo" : "mnt__barra--verde";

  return (
    <div className="mnt__barra-container">
      <div className="mnt__barra-wrap">
        <div className={`mnt__barra ${cls}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="mnt__barra-pct">{pct}%</span>
    </div>
  );
}

// ── Modal horas manuales ───────────────────────────────────────────────────
function HorasManualModal({ aeronaves, onClose, onGuardado }) {
  const [idAeronave, setIdAeronave] = useState(aeronaves[0]?.id_aeronave ?? "");
  const [horas, setHoras] = useState("");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleGuardar = async () => {
    const h = parseFloat(horas);
    if (!horas.trim() || isNaN(h) || h <= 0) {
      setError("Ingresá un valor positivo");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await registrarHorasManuales({
        id_aeronave: Number(idAeronave),
        horas: h,
        descripcion: desc
      });
      onGuardado();
      onClose();
    } catch (e) {
      setError(e.response?.data?.message || "Error al registrar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mnt__overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mnt__modal">
        <div className="mnt__modal-header">
          <h3>Registrar horas manualmente</h3>
          <button className="mnt__modal-close" onClick={onClose}>×</button>
        </div>
        <div className="mnt__modal-body">
          <div className="mnt__field">
            <label className="mnt__label">Aeronave</label>
            <select
              className="mnt__input"
              value={idAeronave}
              onChange={(e) => setIdAeronave(e.target.value)}
            >
              {aeronaves.map((a) => (
                <option key={a.id_aeronave} value={a.id_aeronave}>
                  {a.codigo} — {parseFloat(a.horas_acumuladas).toFixed(1)}h acumuladas
                </option>
              ))}
            </select>
          </div>
          <div className="mnt__field">
            <label className="mnt__label">Horas a agregar</label>
            <input
              className="mnt__input"
              type="number"
              min="0.1"
              step="0.1"
              placeholder="Ej: 1.5"
              value={horas}
              onChange={(e) => { setHoras(e.target.value); setError(""); }}
            />
          </div>
          <div className="mnt__field">
            <label className="mnt__label">Descripción (opcional)</label>
            <input
              className="mnt__input"
              type="text"
              placeholder="Motivo del ajuste…"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>
          {error && <p className="mnt__error">{error}</p>}
        </div>
        <div className="mnt__modal-footer">
          <button className="mnt__btn" onClick={onClose}>Cancelar</button>
          <button
            className="mnt__btn mnt__btn--primary"
            disabled={saving}
            onClick={handleGuardar}
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}



// ── Página principal ───────────────────────────────────────────────────────
export default function MantenimientoAdmin() {
  const navigate = useNavigate();
  const [aeronaves, setAeronaves]           = useState([]);
  const [mantenimientos, setMantenimientos] = useState([]);
  const [loading, setLoading]               = useState(true);
  const [showModal, setShowModal]           = useState(false);
  const [completing, setCompleting]         = useState(null);
  const [tabMant, setTabMant]               = useState("pendientes");
  const [modalMant, setModalMant]           = useState(null);
  const [modalGestionar, setModalGestionar] = useState(null);
  const [cambiandoEstado, setCambiandoEstado] = useState(null);

  const cargar = useCallback(async () => {
    try {
      const data = await getMantenimientoAeronaves();
      // Filtrar solo tipo = 'AVION'
      setAeronaves(data.aeronaves.filter(a => a.tipo === 'AVION'));
      setMantenimientos(data.mantenimientos);
    } catch {
      /* silencioso */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const handleIniciarMantenimiento = (aeronave) => {
    setModalMant(aeronave);
  };

  const handleCompletar = (aeronaveId) => {
    toast("¿Marcar este mantenimiento como completado?", {
      action: {
        label: "Completar",
        onClick: async () => {
          setCompleting(aeronaveId);
          try {
            await completarMantenimiento(aeronaveId);
            await cargar();
          } catch (e) {
            toast.error(e.response?.data?.message || "Error al completar");
          } finally {
            setCompleting(null);
          }
        },
      },
      cancel: { label: "Cancelar", onClick: () => {} },
      duration: 10000,
    });
  };

  const pendientes  = mantenimientos.filter((m) => !m.completado);
  const completados = mantenimientos.filter((m) =>  m.completado);
  const listaMant   = tabMant === "pendientes" ? pendientes : completados;

  return (
    <>

      <div className="mnt">
        <div className="mnt__card" style={{ marginBottom: '24px' }}>
          <div className="mnt__card-header" style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', background: 'white', borderRadius: '8px 8px 0 0', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <i className="bi bi-tools" style={{ color: '#1B365D', fontSize: '1.2rem' }}></i>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: '#1B365D' }}>Mantenimiento de aeronaves</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Ciclos de revisión y registro de horas</p>
              </div>
            </div>
            <button
              className="mnt__btn mnt__btn--primary"
              style={{ backgroundColor: '#1B365D', color: 'white', padding: '8px 16px', borderRadius: '6px', fontWeight: 600, border: 'none' }}
              onClick={() => setShowModal(true)}
            >
              + Horas manuales
            </button>
          </div>
        </div>

        {loading ? (
          <p className="mnt__loading">Cargando…</p>
        ) : (
          <>
            {/* ── Aeronaves ──────────────────────────────────────────── */}
            <section className="mnt__section">
              <h3 className="mnt__section-title">Estado de flota</h3>
              <div className="mnt__table-wrap">
                <table className="mnt__table">
                  <thead>
                    <tr>
                      <th className="mnt__th">Aeronave</th>
                      <th className="mnt__th">Tipo</th>
                      <th className="mnt__th">Estado</th>
                      <th className="mnt__th mnt__th--num">Horas acum.</th>
                      <th className="mnt__th mnt__th--num mnt__hide-tablet">Próx. revisión</th>
                      <th className="mnt__th mnt__hide-tablet">Tipo rev.</th>
                      <th className="mnt__th mnt__th--num">Horas restantes</th>
                      <th className="mnt__th">Progreso</th>
                      <th className="mnt__th"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {aeronaves.map((a) => {
                      const restantes = parseFloat(a.horas_restantes);
                      const alerta = restantes <= 5 ? "mnt__td--rojo" : restantes <= 10 ? "mnt__td--naranja" : "";
                      const enMant = a.estado === "MANTENIMIENTO";
                      const cerca = parseFloat(a.horas_restantes) <= 5;
                      return (
                        <tr key={a.id_aeronave} className="mnt__tr">
                          <td className="mnt__td mnt__td--codigo" data-label="Aeronave">{a.codigo}</td>
                          <td className="mnt__td" data-label="Tipo">{a.tipo}</td>
                           <td className="mnt__td" data-label="Estado">
                            {a.requiere_mantenimiento && (
                              <span className="mnt__status-badge mnt__status-badge--requiere">
                                ⚠ Requiere mantenimiento
                              </span>
                            )}
                            <span className={`mnt__status-badge ${enMant ? "mnt__status-badge--mantenimiento" : cerca ? "mnt__status-badge--proximo" : "mnt__status-badge--activo"}`}>
                              {enMant ? "En Mantenimiento" : cerca ? "Próx. Revisión" : "Operativo"}
                            </span>
                          </td>
                          <td className="mnt__td mnt__td--num" data-label="Horas acum.">
                            {parseFloat(a.horas_acumuladas).toFixed(1)}h
                          </td>
                          <td className="mnt__td mnt__td--num mnt__hide-tablet" data-label="Próx. revisión">
                            {parseFloat(a.horas_proxima_revision).toFixed(1)}h
                          </td>
                          <td className="mnt__td mnt__hide-tablet" data-label="Tipo rev.">
                            <span className="mnt__tipo-badge">{a.tipo_proxima_revision}</span>
                          </td>
                          <td className={`mnt__td mnt__td--num ${alerta}`} data-label="Horas restantes">
                            {restantes.toFixed(1)}h
                          </td>
                          <td className="mnt__td mnt__td--barra" data-label="Progreso">
                            <BarraHoras
                              acumuladas={parseFloat(a.horas_acumuladas)}
                              proxima={parseFloat(a.horas_proxima_revision)}
                            />
                          </td>
                          <td className="mnt__td">
                            {enMant ? (
                              <div className="mnt__actions-cell">
                                <button
                                  className="mnt__btn mnt__btn--sm mnt__btn--primary"
                                  disabled={completing === a.id_aeronave}
                                  onClick={() => handleCompletar(a.id_aeronave)}
                                >
                                  {completing === a.id_aeronave ? "…" : "Completar"}
                                </button>
                                <button
                                  className="mnt__btn mnt__btn--sm mnt__btn--secondary"
                                  onClick={() => {
                                    const mant = pendientes.find(m => m.id_aeronave === a.id_aeronave);
                                    if (mant) setModalGestionar(mant);
                                  }}
                                >
                                  Gestionar
                                </button>
                              </div>
                            ) : cerca ? (
                              <button
                                  className="mnt__btn mnt__btn--sm mnt__btn--danger"
                                  onClick={() => handleIniciarMantenimiento(a)}
                                >
                                  Iniciar mantenimiento
                                </button>
                              ) : (
                                <button
                                  className="mnt__btn mnt__btn--sm"
                                  onClick={() => handleIniciarMantenimiento(a)}
                                >
                                  Mantenimiento preventivo
                                </button>
                              )}
                            </td>
                          </tr>

                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ── Mantenimientos ─────────────────────────────────────── */}
            <section className="mnt__section">
              <h3 className="mnt__section-title">Registros de mantenimiento</h3>

              <div className="mnt__tabs">
                <button
                  className={`mnt__tab ${tabMant === "pendientes" ? "mnt__tab--active" : ""}`}
                  onClick={() => setTabMant("pendientes")}
                >
                  Pendientes ({pendientes.length})
                </button>
                <button
                  className={`mnt__tab ${tabMant === "completados" ? "mnt__tab--active" : ""}`}
                  onClick={() => setTabMant("completados")}
                >
                  Completados ({completados.length})
                </button>
              </div>

              {listaMant.length === 0 ? (
                <p className="mnt__empty">
                  No hay mantenimientos {tabMant === "pendientes" ? "pendientes" : "completados"}.
                </p>
              ) : (
                <div className="mnt__table-wrap">
                  <table className="mnt__table">
                    <thead>
                      <tr>
                        <th className="mnt__th">Aeronave</th>
                        <th className="mnt__th">Tipo</th>
                        <th className="mnt__th">Estado</th>
                        <th className="mnt__th">Fecha programada</th>
                        <th className="mnt__th mnt__th--num">Horas al mant.</th>
                        {tabMant === "completados" && (
                          <th className="mnt__th">Completado</th>
                        )}
                        {tabMant === "pendientes" && (
                          <th className="mnt__th"></th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {listaMant.map((m) => (
                        <tr key={m.id_mantenimiento} className="mnt__tr">
                          <td className="mnt__td mnt__td--codigo" data-label="Aeronave">{m.aeronave_codigo}</td>
                          <td className="mnt__td" data-label="Tipo">
                            <span className="mnt__tipo-badge">{m.tipo}</span>
                          </td>
                          <td className="mnt__td" data-label="Estado">
                            <span className={`mnt__status-badge ${m.estado === 'PENDIENTE' ? 'mnt__status-badge--pendiente' : 'mnt__status-badge--mantenimiento'}`}>
                              {m.estado === 'PENDIENTE' ? 'PENDIENTE' : m.estado}
                            </span>
                          </td>
                          <td className="mnt__td" data-label="Fecha programada">{formatFecha(m.fecha_programada)}</td>
                          <td className="mnt__td mnt__td--num" data-label="Horas al mant.">
                            {m.horas_al_mantenimiento != null
                              ? `${parseFloat(m.horas_al_mantenimiento).toFixed(1)}h`
                              : "—"}
                          </td>
                          {tabMant === "completados" && (
                            <td className="mnt__td" data-label="Completado">{formatFecha(m.fecha_completado)}</td>
                          )}
                          {tabMant === "pendientes" && (
                            <td className="mnt__td">
                              <div className="mnt__actions-cell">
                                <button
                                  className="mnt__btn mnt__btn--sm mnt__btn--primary"
                                  disabled={completing === m.id_aeronave}
                                  onClick={() => handleCompletar(m.id_aeronave)}
                                >
                                  {completing === m.id_aeronave ? "…" : "Completar"}
                                </button>
                                <button
                                  className="mnt__btn mnt__btn--sm mnt__btn--secondary"
                                  onClick={() => setModalGestionar(m)}
                                >
                                  Gestionar
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {showModal && (
        <HorasManualModal
          aeronaves={aeronaves}
          onClose={() => setShowModal(false)}
          onGuardado={cargar}
        />
      )}

      {modalMant && (
        <IniciarMantenimientoModal
          aeronave={modalMant}
          onClose={() => setModalMant(null)}
          onSuccess={() => {
            cargar();
            setModalMant(null);
          }}
        />
      )}
      {modalGestionar && (
        <GestionarMantenimientoModal
          maintenance={modalGestionar}
          onClose={() => setModalGestionar(null)}
          onSuccess={() => {
            cargar();
            setModalGestionar(null);
          }}
        />
      )}
    </>
  );
}
