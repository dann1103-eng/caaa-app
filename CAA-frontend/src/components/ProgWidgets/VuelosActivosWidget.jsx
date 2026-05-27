import { useEffect, useState, useCallback, useRef } from "react";
import { io as socketIO } from "socket.io-client";
import { getVuelosActivos } from "../../services/programacionApi";
import { SOCKET_URL } from "../../api/axiosConfig";
import "./ProgWidgets.css";
const ACTIVOS = ["EN_VUELO", "SALIDA_HANGAR", "REGRESO_HANGAR"];

const ESTADO_LABEL = {
  SALIDA_HANGAR:  "Salida hangar",
  EN_VUELO:       "En vuelo",
  REGRESO_HANGAR: "Regreso hangar",
};

const ESTADO_CLS = {
  SALIDA_HANGAR:  "pw__tag--naranja",
  EN_VUELO:       "pw__tag--azul",
  REGRESO_HANGAR: "pw__tag--morado",
};

const FASE_DURACION_MIN = { SALIDA_HANGAR: 9, REGRESO_HANGAR: 9 };

function timeToMin(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function calcProgreso(vuelo) {
  const { estado, estado_desde, hora_inicio, hora_fin } = vuelo;
  if (!estado_desde) return null;
  let durMin;
  if (estado === "EN_VUELO") {
    durMin = timeToMin(hora_fin.slice(0, 5)) - timeToMin(hora_inicio.slice(0, 5));
  } else {
    durMin = FASE_DURACION_MIN[estado];
  }
  const elapsed = (Date.now() - new Date(estado_desde).getTime()) / 60000;
  return Math.min(100, Math.max(0, Math.round((elapsed / durMin) * 100)));
}

function VueloCardRO({ vuelo }) {
  const [pct, setPct] = useState(() => calcProgreso(vuelo));
  const tRef = useRef(null);

  useEffect(() => {
    setPct(calcProgreso(vuelo));
    tRef.current = setInterval(() => setPct(calcProgreso(vuelo)), 15000);
    return () => clearInterval(tRef.current);
  }, [vuelo.estado, vuelo.estado_desde]);

  const cls = ESTADO_CLS[vuelo.estado] ?? "pw__tag--gris";

  return (
    <div className="pw__card">
      <div className="pw__card-row">
        <span className="pw__card-aeronave">{vuelo.aeronave_codigo}</span>
        <span className={`pw__tag ${cls}`}>{ESTADO_LABEL[vuelo.estado] ?? vuelo.estado}</span>
      </div>
      <div className="pw__card-alumno">
        {vuelo.alumno_nombre} {vuelo.alumno_apellido}
      </div>
      {pct !== null && (
        <div className="pw__bar-wrap">
          <div className="pw__bar" style={{ width: `${pct}%` }} />
          <span className="pw__bar-pct">{pct}%</span>
        </div>
      )}
    </div>
  );
}

export default function VuelosActivosWidget() {
  const [vuelos, setVuelos]     = useState([]);
  const [loading, setLoading]   = useState(true);

  const cargar = useCallback(async () => {
    try {
      const data = await getVuelosActivos();
      setVuelos(data);
    } catch {
      /* silencioso */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    const socket = socketIO(SOCKET_URL, { transports: ["websocket", "polling"], reconnectionDelay: 1000, reconnectionAttempts: 5 });

    socket.on("vuelo_estado_changed", ({ id_vuelo, estado, registrado_en }) => {
      if (ACTIVOS.includes(estado)) {
        setVuelos((prev) => {
          const existe = prev.find((v) => v.id_vuelo === id_vuelo);
          if (existe) {
            return prev.map((v) =>
              v.id_vuelo === id_vuelo ? { ...v, estado, estado_desde: registrado_en } : v
            );
          }
          // Vuelo nuevo en estado activo — refetch para obtener datos completos
          cargar();
          return prev;
        });
      } else {
        setVuelos((prev) => prev.filter((v) => v.id_vuelo !== id_vuelo));
      }
    });

    return () => socket.disconnect();
  }, [cargar]);

  return (
    <div className="pw__widget">
      <div className="pw__widget-header">
        <span className="pw__widget-title">Vuelos activos hoy</span>
        <span className="pw__widget-badge pw__widget-badge--azul">{vuelos.length}</span>
      </div>

      {loading ? (
        <p className="pw__empty">Cargando…</p>
      ) : vuelos.length === 0 ? (
        <p className="pw__empty">Sin vuelos activos en este momento.</p>
      ) : (
        <div className="pw__cards">
          {vuelos.map((v) => (
            <VueloCardRO key={v.id_vuelo} vuelo={v} />
          ))}
        </div>
      )}
    </div>
  );
}
