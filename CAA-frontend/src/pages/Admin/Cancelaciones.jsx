import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { getSolicitudesCancelacion, resolverSolicitudCancelacion } from "../../services/adminApi";
import { io as socketIO } from "socket.io-client";
import { SOCKET_URL } from "../../api/axiosConfig";
import "./Cancelaciones.css";

export default function CancelacionesAdmin() {
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
    <div className="adm-cancel">
      <div className="adm-cancel__card" style={{ marginBottom: '24px' }}>
        <div className="adm-cancel__card-header" style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px', background: 'white', borderRadius: '8px 8px 0 0' }}>
          <i className="bi bi-x-circle" style={{ color: '#ef4444', fontSize: '1.2rem' }}></i>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: '#1B365D' }}>Solicitudes de Cancelación</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Gestioná las solicitudes pendientes de los alumnos.</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid #e2e8f0', padding: '0 20px', background: 'white', borderRadius: '0 0 8px 8px' }}>
          <button
            style={{ padding: '1rem', background: 'transparent', border: 'none', borderBottom: tab === 'PENDIENTE' ? '2px solid #1B365D' : '2px solid transparent', color: tab === 'PENDIENTE' ? '#1B365D' : '#64748b', fontWeight: tab === 'PENDIENTE' ? '700' : '500', cursor: 'pointer', transition: 'all 0.2s' }}
            onClick={() => setTab('PENDIENTE')}
          >
            Pendientes
          </button>
          <button
            style={{ padding: '1rem', background: 'transparent', border: 'none', borderBottom: tab === 'HISTORIAL' ? '2px solid #1B365D' : '2px solid transparent', color: tab === 'HISTORIAL' ? '#1B365D' : '#64748b', fontWeight: tab === 'HISTORIAL' ? '700' : '500', cursor: 'pointer', transition: 'all 0.2s' }}
            onClick={() => setTab('HISTORIAL')}
          >
            Historial
          </button>
        </div>
      </div>

      <div className="adm-cancel__content">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>Cargando solicitudes...</div>
        ) : solicitudes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
            No hay solicitudes {tab === 'PENDIENTE' ? 'pendientes' : 'en el historial'}.
          </div>
        ) : (
          <div className="adm-cancel__list">
            {solicitudes.map((s) => (
              <div key={s.id_solicitud} className="adm-cancel__card">
                <div className="adm-cancel__card-header">
                  <div className="adm-cancel__card-title">
                    <span style={{ fontWeight: 600 }}>{s.alumno_nombre} {s.alumno_apellido}</span>
                    <span style={{ color: '#6b7280', fontSize: '0.9rem', marginLeft: '8px' }}>
                      ({s.aeronave_codigo})
                    </span>
                  </div>
                  <span className="adm-cancel__badge" style={{
                    backgroundColor: s.estado === 'PENDIENTE' ? '#fef3c7' : s.estado === 'ACEPTADA' ? '#dcfce7' : s.estado === 'EXPIRADA' ? '#f3f4f6' : '#fee2e2',
                    color: s.estado === 'PENDIENTE' ? '#b45309' : s.estado === 'ACEPTADA' ? '#166534' : s.estado === 'EXPIRADA' ? '#4b5563' : '#991b1b'
                  }}>{s.estado}</span>
                </div>
                <div className="adm-cancel__card-body">
                  <p><strong>Fecha Vuelo:</strong> {new Date(s.fecha_hora_vuelo).toLocaleString('es-SV', { timeZone: 'America/El_Salvador' })}</p>
                  <p><strong>Motivo:</strong> {s.justificacion}</p>
                  <p><strong>Solicitado el:</strong> {new Date(s.fecha_solicitud).toLocaleString('es-SV', { timeZone: 'America/El_Salvador' })}</p>
                  <p><strong>Cancelaciones en el mes:</strong> {s.cancelaciones_aceptadas_mes}</p>
                  {s.con_multa && (
                    <div style={{ marginTop: '12px', color: '#b91c1c', backgroundColor: '#fef2f2', padding: '8px', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 600 }}>
                      ⚠ Costo de ${s.monto_multa} aceptada por el alumno
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
  );
}
