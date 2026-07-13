import { useCallback, useEffect, useState } from "react";
import { io as socketIO } from "socket.io-client";
import { getTicker } from "../../services/turnoApi";
import { SOCKET_URL } from "../../api/axiosConfig";
import "./AvisosTurnoWidget.css";

const MAX_VISIBLE = 5;

// Card compacta con los avisos vigentes de Turno (los mismos que rotan en el
// ticker de Proyección) para el sidebar de Alumno/Instructor. Se oculta sola
// cuando no hay avisos activos, igual que el resto de cards condicionales del
// dashboard (menos scroll cuando no hay nada que mostrar).
export default function AvisosTurnoWidget() {
  const [avisos, setAvisos] = useState([]);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(() => {
    getTicker()
      .then((data) => setAvisos(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    const t = setInterval(cargar, 60000);
    return () => clearInterval(t);
  }, [cargar]);

  useEffect(() => {
    const socket = socketIO(SOCKET_URL, {
      transports: ["polling", "websocket"],
      reconnectionDelay: 2000,
      reconnectionAttempts: 5,
    });
    socket.on("nuevo_ticker", cargar);
    return () => socket.disconnect();
  }, [cargar]);

  if (loading || avisos.length === 0) return null;

  const visibles = avisos.slice(0, MAX_VISIBLE);
  const restantes = avisos.length - visibles.length;

  return (
    <div className="atw">
      <div className="atw__header">
        <span className="atw__title">
          <i className="bi bi-megaphone-fill" /> Avisos de Turno
        </span>
        <span className="atw__badge">{avisos.length}</span>
      </div>
      <ul className="atw__list">
        {visibles.map((a) => (
          <li key={a.id_mensaje} className="atw__item">
            <span className="atw__dot" />
            <span className="atw__text">{a.contenido}</span>
          </li>
        ))}
      </ul>
      {restantes > 0 && <div className="atw__more">+{restantes} más</div>}
    </div>
  );
}
