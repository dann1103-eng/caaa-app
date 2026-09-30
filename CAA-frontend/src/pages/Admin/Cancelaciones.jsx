import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { getSolicitudesCancelacion, resolverSolicitudCancelacion, getUrlConstanciaCancelacionAdmin } from "../../services/adminApi";
import { io as socketIO } from "socket.io-client";
import { SOCKET_URL } from "../../api/axiosConfig";
import Header from "../../components/Header/Header";
import "./Cancelaciones.css";

// Las constancias viven en un bucket privado: se abren con una URL firmada que
// se pide al momento (vale 1 h). No se guarda la URL en el estado para que no
// quede una vencida dando error.
async function abrirConstancia(id_adjunto) {
  try {
    const { url } = await getUrlConstanciaCancelacionAdmin(id_adjunto);
    window.open(url, "_blank", "noopener");
  } catch (e) {
    toast.error(e.response?.data?.message || "No se pudo abrir la constancia");
  }
}

const pesoLegible = (b) => (!b ? "" : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
const iconoDe = (tipo) => (String(tipo || "").startsWith("image/") ? "bi-file-earmark-image" : "bi-file-earmark-pdf");

// standalone=true: se usa fuera del shell de ADMIN (ej. instructor con
// puede_programar, vía /programacion/cancelaciones) — no hay topbar propia
// ahí, así que agrega el Header global para poder navegar.
export default function CancelacionesAdmin({ standalone = false }) {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [tab, setTab] = useState("PENDIENTE");

  const fetchSolicitudes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSolicitudesCancelacion(tab);
      setSolicitudes(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error("Error al obtener solicitudes de cancelación");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    fetchSolicitudes();

    const socket = socketIO(SOCKET_URL, {
      transports: ["websocket", "polling"],
    });

    socket.on("nueva_solicitud_cancelacion", () => {
      fetchSolicitudes();
    });

    return () => socket.disconnect();
  }, [fetchSolicitudes]);

  const handleResolver = async (id, decision) => {
    if (!window.confirm(`¿Estás seguro de que quieres ${decision.toLowerCase()} esta solicitud?`)) return;
    setProcessing(id);
    try {
      const res = await resolverSolicitudCancelacion(id, decision);
      toast.success(res.message || `Solicitud ${decision.toLowerCase()} exitosamente`);
      fetchSolicitudes();
    } catch (e) {
      toast.error(e.response?.data?.message || "Error al procesar la solicitud");
    } finally {
      setProcessing(null);
    }
  };

  return (
    <>
      {standalone && <Header />}
      <div className="adm-cancel" style={standalone ? { padding: "24px", maxWidth: 900, margin: "0 auto" } : undefined}>
      <div className="adm-cancel__card" style={{ marginBottom: '24px' }}>
        <div className="adm-cancel__card-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--c-line-1)', display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--c-surface-1)', borderRadius: '8px 8px 0 0' }}>
          <i className="bi bi-x-circle" style={{ color: 'var(--c-primary-500)', fontSize: '1.2rem' }}></i>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: 'var(--c-ink-1)' }}>Solicitudes de Cancelación</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--c-ink-3)' }}>Gestioná las solicitudes pendientes de los alumnos.</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--c-line-1)', padding: '0 20px', background: 'var(--c-surface-1)', borderRadius: '0 0 8px 8px' }}>
          <button
            style={{ padding: '1rem', background: 'transparent', border: 'none', borderBottom: tab === 'PENDIENTE' ? '2px solid var(--c-primary-500)' : '2px solid transparent', color: tab === 'PENDIENTE' ? 'var(--c-ink-1)' : 'var(--c-ink-3)', fontWeight: tab === 'PENDIENTE' ? '700' : '500', cursor: 'pointer', transition: 'all 0.2s' }}
            onClick={() => setTab('PENDIENTE')}
          >
            Pendientes
          </button>
          <button
            style={{ padding: '1rem', background: 'transparent', border: 'none', borderBottom: tab === 'HISTORIAL' ? '2px solid var(--c-primary-500)' : '2px solid transparent', color: tab === 'HISTORIAL' ? 'var(--c-ink-1)' : 'var(--c-ink-3)', fontWeight: tab === 'HISTORIAL' ? '700' : '500', cursor: 'pointer', transition: 'all 0.2s' }}
            onClick={() => setTab('HISTORIAL')}
          >
            Historial
          </button>
        </div>
      </div>

      <div className="adm-cancel__content">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--c-ink-3)' }}>Cargando solicitudes...</div>
        ) : solicitudes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--c-ink-3)', backgroundColor: 'var(--c-surface-1)', borderRadius: '10px', border: '1px solid var(--c-line-1)' }}>
            No hay solicitudes {tab === 'PENDIENTE' ? 'pendientes' : 'en el historial'}.
          </div>
        ) : (
          <div className="adm-cancel__list">
            {solicitudes.map((s) => (
              <div key={s.id_solicitud} className="adm-cancel__card">
                <div className="adm-cancel__card-header">
                  <div className="adm-cancel__card-title">
                    <span style={{ fontWeight: 600 }}>{s.alumno_nombre} {s.alumno_apellido}</span>
                    <span style={{ color: 'var(--c-ink-3)', fontSize: '0.9rem', marginLeft: '8px', fontFamily: 'var(--font-mono)' }}>
                      ({s.aeronave_codigo})
                    </span>
                  </div>
                  <span className="adm-cancel__badge" style={{
                    backgroundColor: s.estado === 'PENDIENTE' ? 'var(--c-warn-50)' : s.estado === 'ACEPTADA' ? 'var(--c-success-50)' : s.estado === 'EXPIRADA' ? 'var(--c-surface-2)' : 'var(--c-danger-50)',
                    color: s.estado === 'PENDIENTE' ? 'var(--c-warn-700)' : s.estado === 'ACEPTADA' ? 'var(--c-success-700)' : s.estado === 'EXPIRADA' ? 'var(--c-ink-2)' : 'var(--c-danger-700)'
                  }}>{s.estado}</span>
                </div>
                <div className="adm-cancel__card-body">
                  <p><strong>Fecha Vuelo:</strong> {new Date(s.fecha_hora_vuelo).toLocaleString('es-SV', { timeZone: 'America/El_Salvador' })}</p>
                  <p><strong>Motivo:</strong> {s.justificacion}</p>
                  <p><strong>Solicitado el:</strong> {new Date(s.fecha_solicitud).toLocaleString('es-SV', { timeZone: 'America/El_Salvador' })}</p>
                  <p><strong>Cancelaciones este mes:</strong> {s.cancelaciones_mes ?? s.cancelaciones_aceptadas_mes} <span style={{ color: 'var(--c-ink-3)' }}>({s.cancelaciones_aceptadas_mes} aceptadas)</span></p>
                  {Array.isArray(s.adjuntos) && s.adjuntos.length > 0 && (
                    <div style={{ marginTop: '10px' }}>
                      <strong>Constancias adjuntas ({s.adjuntos.length}):</strong>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                        {s.adjuntos.map((ad) => (
                          <button
                            key={ad.id_adjunto}
                            type="button"
                            onClick={() => abrirConstancia(ad.id_adjunto)}
                            title={`Abrir ${ad.nombre_archivo}`}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '6px',
                              fontSize: '0.78rem', padding: '4px 9px', cursor: 'pointer',
                              border: '1px solid var(--c-line-2, #d1d5db)', borderRadius: '999px',
                              background: 'var(--c-surface, #fff)', color: 'var(--c-brand-700)',
                              maxWidth: '260px',
                            }}
                          >
                            <i className={`bi ${iconoDe(ad.content_type)}`} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ad.nombre_archivo}</span>
                            <span style={{ color: 'var(--c-ink-3, #6b7280)' }}>{pesoLegible(ad.tamano_bytes)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {s.con_multa && (
                    <div style={{ marginTop: '12px', color: 'var(--c-danger-700)', backgroundColor: 'var(--c-danger-50)', padding: '8px', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', fontWeight: 600 }}>
                      <i className="bi bi-exclamation-triangle-fill"></i> Multa de ${s.monto_multa}
                      {s.motivo === 'RACHA' ? ' (4ª semana consecutiva)' : s.motivo === 'MENSUAL' ? ' (4ª del mes)' : ''} — a cobrar por Administración
                    </div>
                  )}
                </div>
                {tab === 'PENDIENTE' && (
                  <div className="adm-cancel__card-actions">
                    <button
                      className="adm-cancel__btn adm-cancel__btn--reject"
                      onClick={() => handleResolver(s.id_solicitud, 'RECHAZADA')}
                      disabled={processing === s.id_solicitud}
                    >
                      {processing === s.id_solicitud ? 'Procesando...' : 'Rechazar'}
                    </button>
                    <button
                      className="adm-cancel__btn adm-cancel__btn--accept"
                      onClick={() => handleResolver(s.id_solicitud, 'ACEPTADA')}
                      disabled={processing === s.id_solicitud}
                    >
                      {processing === s.id_solicitud ? 'Procesando...' : 'Aceptar'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </>
  );
}
