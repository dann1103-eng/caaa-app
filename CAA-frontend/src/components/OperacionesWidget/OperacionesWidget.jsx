import { useEffect, useState, useCallback } from "react";
import { io as socketIO } from "socket.io-client";
import { getEstadoOperaciones } from "../../services/turnoApi";
import { SOCKET_URL } from "../../api/axiosConfig";
import "./OperacionesWidget.css";

// Estado EFECTIVO de operaciones (lo calcula el backend fusionando la
// suspensión extraordinaria con el ciclo del turno del día):
//   SUSPENDIDO (clima/NOTAM) > PAUSA_TURNO (almuerzo) > CERRADO_TURNO > ACTIVO.
const ESTADOS = {
  ACTIVO:        { cls: "op-widget--activo",   titulo: "OPERACIONES ACTIVAS",     icono: "check" },
  PAUSA_TURNO:   { cls: "op-widget--pausa",    titulo: "EN PAUSA · ALMUERZO",     icono: "pausa" },
  CERRADO_TURNO: { cls: "op-widget--cerrado",  titulo: "OPERACIONES CERRADAS",    icono: "luna" },
  SUSPENDIDO:    { cls: "op-widget--inactivo", titulo: "OPERACIONES SUSPENDIDAS", icono: "x" },
};

function Icono({ tipo }) {
  const common = { viewBox: "0 0 24 24", width: 24, height: 24, stroke: "currentColor", strokeWidth: 3, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" };
  if (tipo === "check") return <svg {...common}><polyline points="20 6 9 17 4 12" /></svg>;
  if (tipo === "pausa") return <svg {...common}><line x1="9" y1="5" x2="9" y2="19" /><line x1="15" y1="5" x2="15" y2="19" /></svg>;
  if (tipo === "luna") return <svg {...common} strokeWidth={2.4} fill="none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>;
}

export default function OperacionesWidget() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchEstado = useCallback(async () => {
    try {
      const d = await getEstadoOperaciones();
      setData(d);
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

    // Siempre re-consultar: el payload del socket no trae el estado del turno
    // (pausa/cierre) que el backend fusiona en estado_efectivo.
    socket.on("estado_operaciones_changed", fetchEstado);
    socket.on("turno_dia_changed", fetchEstado);

    // Red de seguridad si el socket no entrega (proxy de Railway).
    const t = setInterval(fetchEstado, 60000);

    return () => { socket.disconnect(); clearInterval(t); };
  }, [fetchEstado]);

  if (loading) return <div className="op-widget op-widget--loading">Cargando estado...</div>;

  const efectivo = data?.estado_efectivo
    || (data?.estado_general === "ACTIVO" ? "ACTIVO" : "SUSPENDIDO"); // backend viejo sin estado_efectivo
  const meta = ESTADOS[efectivo] || ESTADOS.ACTIVO;

  return (
    <div className={`op-widget ${meta.cls}`}>
      <div className="op-widget__icon"><Icono tipo={meta.icono} /></div>
      <div className="op-widget__text">
        <h3 className="op-widget__title">{meta.titulo}</h3>
        {efectivo === "SUSPENDIDO" && data?.motivo_inactivo && (
          <p className="op-widget__reason">MOTIVO: {data.motivo_inactivo}</p>
        )}
        {efectivo === "CERRADO_TURNO" && (
          <p className="op-widget__reason">{data?.turno_estado === "CERRADO" ? "TURNO CERRADO" : "TURNO NO ABIERTO"}</p>
        )}
      </div>
    </div>
  );
}
