import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { io as socketIO } from "socket.io-client";
import Header from "../../components/Header/Header";
import MetarWidget from "../../components/MetarWidget/MetarWidget";
import ToastMantenimiento from "../../components/ToastMantenimiento/ToastMantenimiento";
import {
  getVuelosHoy,
  getEstadoOperaciones,
  setEstadoOperaciones,
  agregarBloquesSuspension,
  publicarTicker,
  limpiarTicker,
  limpiarUnicoTicker,
  getTicker,
  avanzarEstadoVuelo,
} from "../../services/turnoApi";
import SuspenderOperacionesModal from "../../components/SuspenderOperacionesModal/SuspenderOperacionesModal";
import GestionarSuspensionModal from "../../components/SuspenderOperacionesModal/GestionarSuspensionModal";
import { API_URL, SOCKET_URL } from "../../api/axiosConfig";
import "./Dashboard.css";

const ESTADO_LABEL = {
  PUBLICADO:      "Programado",
  PROGRAMADO:     "Programado",
  SALIDA_HANGAR:  "Salida hangar",
  EN_PROGRESO:    "En progreso",
  REGRESO_HANGAR: "Regreso hangar",
  FINALIZANDO:    "Finalizando",
  COMPLETADO:     "Completado",
};

const ESTADO_COLOR = {
  PUBLICADO:      "trn__tag--gris",
  PROGRAMADO:     "trn__tag--gris",
  SALIDA_HANGAR:  "trn__tag--naranja",
  EN_PROGRESO:    "trn__tag--azul",
  REGRESO_HANGAR: "trn__tag--morado",
  FINALIZANDO:    "trn__tag--amarillo",
  COMPLETADO:     "trn__tag--verde",
};

// Estados en los que TURNO puede avanzar el vuelo
const ESTADOS_AVANZABLES = new Set(["PUBLICADO", "PROGRAMADO", "SALIDA_HANGAR", "EN_PROGRESO", "REGRESO_HANGAR", "FINALIZANDO"]);

const NEXT_LABEL = {
  PUBLICADO:      "→ Salida hangar",
  PROGRAMADO:     "→ Salida hangar",
  SALIDA_HANGAR:  "→ En progreso",
  EN_PROGRESO:    "→ Regreso hangar",
  REGRESO_HANGAR: "→ Finalizando",
  FINALIZANDO:    "→ Completar vuelo",
};

const MOTIVOS = ["CLIMA", "VIENTO", "VISIBILIDAD", "REVISION_PISTA", "NOTAM", "TEMPERATURA"];

function formatHora(h) {
  return h?.slice(0, 5) ?? "";
}

function hhmmToMin(hhmm) {
  const [h, m] = (hhmm || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function VueloCard({ vuelo, onRefresh }) {
  const tagClass = ESTADO_COLOR[vuelo.estado] ?? "trn__tag--gris";
  const [advancing, setAdvancing] = useState(false);

  const handleAvanzar = async () => {
    setAdvancing(true);
    try {
      await avanzarEstadoVuelo(vuelo.id_vuelo, {});
      toast.success(`Vuelo ${vuelo.aeronave_codigo}: ${NEXT_LABEL[vuelo.estado]}`);
      onRefresh();
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudo avanzar el estado");
    } finally {
      setAdvancing(false);
    }
  };

  const handleInasistencia = async () => {
    if (!window.confirm(`¿Registrar inasistencia para ${vuelo.alumno_nombre}? El vuelo pasará a COMPLETADO con 0 min.`)) return;
    setAdvancing(true);
    try {
      // Necesitaremos importar registrarInasistencia o llamar a la API
      await axios.post(`${API_URL}/turno/vuelos/${vuelo.id_vuelo}/inasistencia`);
      toast.success("Inasistencia registrada");
      onRefresh();
    } catch (e) {
      toast.error("Error al registrar inasistencia");
    } finally {
      setAdvancing(false);
    }
  };

  const isSim = vuelo.aeronave_tipo === 'SIMULADOR';
  const esSalidaHangar = vuelo.estado === "PUBLICADO" || vuelo.estado === "PROGRAMADO";
  const ahoraMin = new Date().getHours() * 60 + new Date().getMinutes();
  const bloqueHabilitado = !esSalidaHangar || ahoraMin >= hhmmToMin(vuelo.hora_inicio);
  
  const canAdvance = !isSim && ESTADOS_AVANZABLES.has(vuelo.estado) && vuelo.estado !== 'FINALIZANDO';
  const btnDisabled = advancing || !bloqueHabilitado;

  return (
    <div className="trn__card">
      <div className="trn__card-top">
        <div className="trn__card-info">
          <span className="trn__aeronave">{vuelo.aeronave_codigo}</span>
          <span className={`trn__tag ${tagClass}`}>{ESTADO_LABEL[vuelo.estado] ?? vuelo.estado}</span>
        </div>
        <div className="trn__card-nombres">
          <span className="trn__alumno">
            {vuelo.alumno_nombre} {vuelo.alumno_apellido}
          </span>
          <span className="trn__instructor">
            Inst: {vuelo.instructor_nombre} {vuelo.instructor_apellido}
          </span>
        </div>
      </div>

      <div className="trn__card-actions">
        {canAdvance && (
          <button
            className="trn__btn-avanzar"
            disabled={btnDisabled}
            onClick={handleAvanzar}
            title={!bloqueHabilitado ? "No se puede iniciar el vuelo antes de la hora programada" : ""}
          >
            {advancing ? "Procesando…" : (NEXT_LABEL[vuelo.estado] ?? "Avanzar")}
          </button>
        )}
      </div>
    </div>
  );
}

function OpsWidget({ ops, onSet, vuelosHoy = [] }) {
  const [motivo, setMotivo] = useState(ops?.motivo_inactivo ?? "");
  const [showSuspender, setShowSuspender] = useState(false);
  const [showGestionar, setShowGestionar] = useState(false);

  const isActivo = ops?.estado_general === "ACTIVO";

  const handleSuspender = (mot, blqs, temp, expl) => {
    onSet("INACTIVO", mot, blqs, temp, expl);
    setShowSuspender(false);
  };

  const handleGestionar = (nuevos) => {
    onSet("AGREGAR", null, nuevos);
    setShowGestionar(false);
  };

  const handleReanudar = () => {
    if (window.confirm("¿Está seguro de que desea reanudar las operaciones?")) {
      onSet("ACTIVO", null, []);
    }
  };

  return (
    <div className={`trn__ops ${isActivo ? "trn__ops--activo" : "trn__ops--inactivo"}`}>
      <div className="trn__ops-left">
        <span className="trn__ops-label">Operaciones</span>
        <span className="trn__ops-status-badge">{isActivo ? "ACTIVO" : "INACTIVO"}</span>
        {!isActivo && ops?.motivo_inactivo && (
          <div className="trn__ops-details">
            <span className="trn__ops-motivo">
              {ops.motivo_inactivo}
              {ops.temperatura && ` (${ops.temperatura}°C)`}
            </span>
            {ops.explicacion_detallada && (
              <span className="trn__ops-explicacion">{ops.explicacion_detallada}</span>
            )}
          </div>
        )}
        {!isActivo && ops?.bloques_suspendidos?.length > 0 && (
          <span className="trn__ops-bloques-count">
            ({ops.bloques_suspendidos.length} bloques suspendidos)
          </span>
        )}
      </div>
      <div className="trn__ops-right">
        {isActivo ? (
          <button className="trn__ops-btn" onClick={() => setShowSuspender(true)}>
            Suspender operaciones
          </button>
        ) : (
          <div className="trn__ops-actions">
            <button className="trn__ops-btn trn__ops-btn--secondary" onClick={() => setShowGestionar(true)}>
              Gestionar suspensión
            </button>
            <button className="trn__ops-btn trn__ops-btn--primary" onClick={handleReanudar}>
              Reanudar operaciones
            </button>
          </div>
        )}
      </div>

      {showSuspender && (
        <SuspenderOperacionesModal 
          onClose={() => setShowSuspender(false)}
          onConfirm={handleSuspender}
          vuelosHoy={vuelosHoy}
        />
      )}

      {showGestionar && (
        <GestionarSuspensionModal 
          currentBloques={ops?.bloques_suspendidos || []}
          onClose={() => setShowGestionar(false)}
          onConfirm={handleGestionar}
        />
      )}
    </div>
  );
}

export default function TurnoDashboard() {
  const [vuelos, setVuelos] = useState([]);
  const [ops, setOps] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tickerMsg, setTickerMsg] = useState("");
  const [tickerSaving, setTickerSaving] = useState(false);
  const [tickerMensajes, setTickerMensajes] = useState([]);

  const cargarVuelos = useCallback(async () => {
    try {
      const data = await getVuelosHoy();
      setVuelos(data);
    } catch {
      /* silencioso en polling */
    }
  }, []);

  const cargarOps = useCallback(async () => {
    try {
      const data = await getEstadoOperaciones();
      setOps(data);
    } catch {
      /* silencioso */
    }
  }, []);

  const cargarTicker = useCallback(async () => {
    try {
      const data = await getTicker();
      setTickerMensajes(Array.isArray(data) ? data : []);
    } catch {
      /* silencioso */
    }
  }, []);

  // Carga inicial
  useEffect(() => {
    Promise.all([cargarVuelos(), cargarOps(), cargarTicker()]).finally(() => setLoading(false));
  }, [cargarVuelos, cargarOps, cargarTicker]);

  // Polling 30 s
  useEffect(() => {
    const t = setInterval(cargarVuelos, 30000);
    return () => clearInterval(t);
  }, [cargarVuelos]);

  // Socket.io tiempo real
  useEffect(() => {
    const socket = socketIO(SOCKET_URL, { transports: ["websocket", "polling"], reconnectionDelay: 1000, reconnectionAttempts: 5 });

    socket.on("vuelo_estado_changed", ({ id_vuelo, estado, registrado_en, duracion_estimada_min, es_inasistencia }) => {
      setVuelos((prev) =>
        prev.map((v) => {
          if (v.id_vuelo !== id_vuelo) return v;
          const updated = { ...v, estado, estado_desde: registrado_en };
          if (duracion_estimada_min != null) updated.duracion_estimada_min = duracion_estimada_min;
          if (es_inasistencia != null) updated.es_inasistencia = es_inasistencia;
          return updated;
        })
      );
    });

    socket.on("estado_operaciones_changed", (payload) => {
      if (payload && payload.estado_general) {
        setOps(payload);
      } else {
        cargarOps();
      }
    });

    socket.on("nuevo_ticker", () => {
      cargarTicker();
    });

    return () => socket.disconnect();
  }, [cargarOps]);

  const handleSetOps = async (estado_general, motivo_inactivo, bloques = [], temperatura = null, explicacion_detallada = null) => {
    try {
      let data;
      if (estado_general === "AGREGAR") {
        data = await agregarBloquesSuspension(bloques);
      } else {
        data = await setEstadoOperaciones(estado_general, motivo_inactivo, bloques, temperatura, explicacion_detallada);
      }
      setOps(data);
      if (estado_general === "INACTIVO" || estado_general === "AGREGAR") {
        toast.success("Operaciones suspendidas");
      } else if (estado_general === "ACTIVO") {
        toast.success("Operaciones reanudadas");
      }
      cargarVuelos();
    } catch {
      toast.error("No se pudo actualizar el estado de operaciones");
    }
  };

  const handlePublicarTicker = async () => {
    if (!tickerMsg.trim()) return;
    setTickerSaving(true);
    try {
      await publicarTicker(tickerMsg.trim());
      setTickerMsg("");
      await cargarTicker();
    } catch {
      toast.error("No se pudo publicar el aviso");
    } finally {
      setTickerSaving(false);
    }
  };

  const handleLimpiarTicker = async () => {
    try {
      await limpiarTicker();
      setTickerMensajes([]);
    } catch {
      toast.error("No se pudo limpiar los avisos");
    }
  };

  const handleBorrarUno = async (id) => {
    try {
      await limpiarUnicoTicker(id);
      setTickerMensajes((prev) => prev.filter((m) => m.id_mensaje !== id));
    } catch {
      toast.error("No se pudo borrar el aviso");
    }
  };

  // Agrupar por bloque
  const bloques = [];
  const porBloque = {};
  for (const v of vuelos) {
    const key = v.id_bloque;
    if (!porBloque[key]) {
      porBloque[key] = [];
      bloques.push({ id_bloque: key, hora_inicio: v.hora_inicio, hora_fin: v.hora_fin });
    }
    porBloque[key].push(v);
  }
  bloques.sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));

  return (
    <>
      <Header />
      <ToastMantenimiento />

      <div className="trn">
        {/* ── Cabecera ──────────────────────────────────────────────── */}
        <div className="trn__top">
          <div>
            <p className="trn__eyebrow">Panel de turno</p>
            <h2 className="trn__title">Dashboard operativo</h2>
            <p className="trn__subtitle">
              <i className="bi bi-calendar3" style={{ marginRight: '8px', color: 'var(--c-ink-3)' }}></i>
              Vuelos del día · {new Date().toLocaleDateString("es-AR", {
                weekday: "long", day: "numeric", month: "long",
              })}
            </p>
          </div>
          <div className="trn__counter">
            <i className="bi bi-airplane-engines" style={{ marginRight: '10px' }}></i>
            {!loading && (
              <span>{vuelos.length} vuelo{vuelos.length !== 1 ? "s" : ""} activo{vuelos.length !== 1 ? "s" : ""}</span>
            )}
          </div>
        </div>

        {/* ── METAR ─────────────────────────────────────────────────── */}
        <MetarWidget />

        {/* ── Estado de operaciones ─────────────────────────────────── */}
        {ops && <OpsWidget ops={ops} onSet={handleSetOps} vuelosHoy={vuelos} />}

        {/* ── Publicar aviso (ticker) ───────────────────────────────── */}
        <div className="trn__ticker-form">
          <div className="trn__ticker-form-head">
            <span className="trn__ticker-form-title">
              <i className="bi bi-megaphone" style={{ color: 'var(--c-primary-500)' }}></i>
              Avisos del ticker
            </span>
            {tickerMensajes.length > 0 && (
              <button className="trn__ticker-clear" onClick={handleLimpiarTicker}>
                Limpiar todos
              </button>
            )}
          </div>

          {/* Lista de mensajes activos */}
          {tickerMensajes.length > 0 && (
            <ul className="trn__ticker-list">
              {tickerMensajes.map((m) => (
                <li key={m.id_mensaje} className="trn__ticker-item">
                  <span className="trn__ticker-item-text">{m.contenido}</span>
                  <button
                    className="trn__ticker-item-del"
                    onClick={() => handleBorrarUno(m.id_mensaje)}
                    title="Borrar este aviso"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="trn__ticker-input-row">
            <input
              className="trn__ticker-input"
              type="text"
              placeholder="Nuevo aviso para el ticker…"
              value={tickerMsg}
              onChange={(e) => setTickerMsg(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePublicarTicker()}
              maxLength={200}
            />
            <button
              className="trn__ticker-btn"
              onClick={handlePublicarTicker}
              disabled={tickerSaving || !tickerMsg.trim()}
            >
              {tickerSaving ? "Publicando…" : "Publicar"}
            </button>
          </div>
        </div>

        {/* ── Contenido ─────────────────────────────────────────────── */}
        {loading ? (
          <p className="trn__loading">Cargando…</p>
        ) : vuelos.length === 0 ? (
          <p className="trn__empty">No hay vuelos activos para hoy.</p>
        ) : (
          bloques.map((b) => (
            <div key={b.id_bloque} className="trn__bloque">
              <div className="trn__bloque-header">
                <span className="trn__bloque-hora">
                  {formatHora(b.hora_inicio)} – {formatHora(b.hora_fin)}
                </span>
                <span className="trn__bloque-count">
                  {porBloque[b.id_bloque].length} vuelo{porBloque[b.id_bloque].length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="trn__cards">
                {porBloque[b.id_bloque].map((v) => (
                  <VueloCard key={v.id_vuelo} vuelo={v} onRefresh={cargarVuelos} />
                ))}
              </div>
            </div>
          ))
        )}

      </div>
    </>
  );
}
