import { useEffect, useState, useCallback } from "react";
import { io as socketIO } from "socket.io-client";
import { getEstadoOperaciones } from "../../services/turnoApi";
import { SOCKET_URL } from "../../api/axiosConfig";
import "./OperacionesWidget.css";

export default function OperacionesWidget() {
  const [estado, setEstado] = useState(null);
  const [motivo, setMotivo] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchEstado = useCallback(async () => {
    try {
      const data = await getEstadoOperaciones();
      setEstado(data.estado_general);
      setMotivo(data.motivo_inactivo);
    } catch (e) {
      console.error("Error al obtener estado de operaciones", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEstado();

    const socket = socketIO(SOCKET_URL, {
      transports: ["websocket", "polling"],
    });

    socket.on("estado_operaciones_changed", (data) => {
      if (data) {
        setEstado(data.estado_general);
        setMotivo(data.motivo_inactivo);
      } else {
        fetchEstado();
      }
    });

    return () => socket.disconnect();
  }, [fetchEstado]);

  if (loading) return <div className="op-widget op-widget--loading">Cargando estado...</div>;

  const isActivo = estado === "ACTIVO";

  return (
    <div className={`op-widget ${isActivo ? "op-widget--activo" : "op-widget--inactivo"}`}>
      <div className="op-widget__icon">
        {isActivo ? (
          <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
        )}
      </div>
      <div className="op-widget__text">
        <h3 className="op-widget__title">
          {isActivo ? "OPERACIONES ACTIVAS" : "OPERACIONES SUSPENDIDAS"}
        </h3>
        {!isActivo && motivo && (
          <p className="op-widget__reason">MOTIVO: {motivo}</p>
        )}
      </div>
    </div>
  );
}
