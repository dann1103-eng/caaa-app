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
  abrirReporteVuelosDia,
  getFlotaMantenimiento,
  completarMantenimientoAeronave,
} from "../../services/turnoApi";
import SuspenderOperacionesModal from "../../components/SuspenderOperacionesModal/SuspenderOperacionesModal";
import MantenimientoAeronaveModal from "../../components/MantenimientoAeronaveModal/MantenimientoAeronaveModal";
import TurnoDiaWidget from "../../components/TurnoDiaWidget/TurnoDiaWidget";
import GestionarSuspensionModal from "../../components/SuspenderOperacionesModal/GestionarSuspensionModal";
import AgendarVueloModal from "../../components/AgendarVueloModal/AgendarVueloModal";
import EditarTripulacionModal from "../../components/EditarTripulacionModal/EditarTripulacionModal";
import { getCalendarioAdmin, getAeronavesActivasAdmin, getBloquesHorario } from "../../services/adminApi";
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

// El simulador no sale/regresa de un hangar físico: solo Iniciar/Finalizar sesión.
const ESTADOS_AVANZABLES_SIM = new Set(["PUBLICADO", "PROGRAMADO", "EN_PROGRESO"]);
const NEXT_LABEL_SIM = {
  PUBLICADO:   "→ Iniciar sesión",
  PROGRAMADO:  "→ Iniciar sesión",
  EN_PROGRESO: "→ Finalizar sesión",
};

const MOTIVOS = ["CLIMA", "VIENTO", "VISIBILIDAD", "REVISION_PISTA", "NOTAM", "TEMPERATURA"];

function formatHora(h) {
  return h?.slice(0, 5) ?? "";
}

function VueloCard({ vuelo, onRefresh }) {
  const tagClass = ESTADO_COLOR[vuelo.estado] ?? "trn__tag--gris";
  const [advancing, setAdvancing] = useState(false);
  const [editando, setEditando] = useState(false);
  const isSim = vuelo.aeronave_tipo === 'SIMULADOR';

  const handleAvanzar = async () => {
    setAdvancing(true);
    try {
      await avanzarEstadoVuelo(vuelo.id_vuelo, {});
      const label = isSim ? NEXT_LABEL_SIM[vuelo.estado] : NEXT_LABEL[vuelo.estado];
      toast.success(`Vuelo ${vuelo.aeronave_codigo}: ${label}`);
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

  // Sin candado de hora programada: Turno puede adelantar la salida de un
  // vuelo del siguiente bloque si en la práctica despega antes de lo previsto
  // (ej. el alumno anterior no llegó o el vuelo salió temprano). La única
  // restricción real la aplica el backend: que la aeronave no esté ya en uso
  // en otro vuelo (guardia de "avión ocupado").
  const canAdvance = isSim
    ? ESTADOS_AVANZABLES_SIM.has(vuelo.estado)
    : (ESTADOS_AVANZABLES.has(vuelo.estado) && vuelo.estado !== 'FINALIZANDO');
  const nextLabel = isSim ? NEXT_LABEL_SIM[vuelo.estado] : NEXT_LABEL[vuelo.estado];
  const btnDisabled = advancing;

  return (
    <div className="trn__card">
      <div className="trn__card-top">
        <div className="trn__card-info">
          <div className="trn__card-info-left">
            <span className="trn__aeronave">{vuelo.aeronave_codigo}</span>
            <span className={`trn__tag ${tagClass}`}>{ESTADO_LABEL[vuelo.estado] ?? vuelo.estado}</span>
          </div>
          <button
            className="trn__btn-editar"
            onClick={() => setEditando(true)}
            title="Editar tripulación (alumno, instructor, aeronave, almas a bordo)"
          >
            <i className="bi bi-pencil-square"></i>
          </button>
        </div>
        <div className="trn__card-nombres">
          <span className="trn__alumno">
            {vuelo.alumno_nombre} {vuelo.alumno_apellido}
          </span>
          <span className="trn__instructor">
            Inst: {vuelo.instructor_nombre} {vuelo.instructor_apellido}
          </span>
          {vuelo.almas_a_bordo != null && (
            <span className="trn__almas" title={vuelo.pasajeros_extra || ""}>
              <i className="bi bi-people-fill"></i> {vuelo.almas_a_bordo} a bordo
            </span>
          )}
        </div>
      </div>

      <div className="trn__card-actions">
        {canAdvance && (
          <button
            className="trn__btn-avanzar"
            disabled={btnDisabled}
            onClick={handleAvanzar}
          >
            {advancing ? "Procesando…" : (nextLabel ?? "Avanzar")}
          </button>
        )}
      </div>

      {editando && (
        <EditarTripulacionModal
          vuelo={vuelo}
          onClose={() => setEditando(false)}
          onSaved={onRefresh}
        />
      )}
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

// Reloj UTC (principal, rojo — como en Proyección) + hora local CST.
function RelojTurno() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const fmt = (tz) =>
    now.toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, ...(tz ? { timeZone: tz } : {}) });
  return (
    <div className="trn__clock">
      <span className="trn__clock-utc">{fmt("UTC")} <b>UTC</b></span>
      <span className="trn__clock-local">{fmt()} <b>CST</b></span>
    </div>
  );
}

// Estado de la flota: chips por aeronave (operativa / en mantenimiento) con
// acciones de mantenimiento imprevisto. Caso: falla detectada en pre-vuelo.
function FlotaWidget({ flota, onIniciar, onReactivar }) {
  const [reactivando, setReactivando] = useState(null);

  const handleReactivar = async (a) => {
    if (!window.confirm(`¿Marcar el mantenimiento de ${a.codigo} como efectuado? La aeronave vuelve al servicio.`)) return;
    setReactivando(a.id_aeronave);
    try {
      await onReactivar(a);
    } finally {
      setReactivando(null);
    }
  };

  return (
    <div className="trn__flota">
      <div className="trn__flota-head">
        <span className="trn__flota-title">
          <i className="bi bi-tools" style={{ color: "var(--c-primary-500)" }}></i>
          Estado de la flota
        </span>
        <button className="trn__ops-btn" onClick={onIniciar}>
          <i className="bi bi-wrench-adjustable" style={{ marginRight: 6 }}></i>
          Aeronave a mantenimiento
        </button>
      </div>
      <div className="trn__flota-chips">
        {flota.map((a) => {
          const enMant = !!a.id_mantenimiento;
          return (
            <div key={a.id_aeronave} className={`trn__flota-chip ${enMant ? "trn__flota-chip--mant" : "trn__flota-chip--ok"}`}>
              <span className="trn__flota-codigo">{a.codigo}</span>
              {enMant ? (
                <>
                  <span className="trn__flota-estado" title={a.mant_descripcion || ""}>
                    Mantenimiento{a.mant_hasta ? ` · est. ${new Date(a.mant_hasta).toLocaleDateString("es-SV", { timeZone: "UTC", day: "2-digit", month: "2-digit" })}` : ""}
                  </span>
                  <button
                    className="trn__flota-reactivar"
                    disabled={reactivando === a.id_aeronave}
                    onClick={() => handleReactivar(a)}
                    title="Mantenimiento efectuado: la aeronave vuelve al servicio"
                  >
                    {reactivando === a.id_aeronave ? "…" : "Marcar operativa"}
                  </button>
                </>
              ) : (
                <span className="trn__flota-estado">Operativa</span>
              )}
            </div>
          );
        })}
      </div>
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
  // Reporte de cierre del día (vuelos por avión)
  const hoyISO = new Date().toLocaleDateString("sv-SE", { timeZone: "America/El_Salvador" });
  const [reporteFecha, setReporteFecha] = useState(hoyISO);
  const [generandoReporte, setGenerandoReporte] = useState(false);
  // Agendar un vuelo omitido en la semana en curso (modo pickSlot).
  const [agendarCtx, setAgendarCtx] = useState(null); // { id_semana, bloques, aeronaves, dia }
  const [abriendoAgendar, setAbriendoAgendar] = useState(false);
  // Mantenimiento imprevisto de aeronave.
  const [flota, setFlota] = useState([]);
  const [showMantenimiento, setShowMantenimiento] = useState(false);

  const handleAbrirAgendar = async () => {
    setAbriendoAgendar(true);
    try {
      const [cal, aero, blqs] = await Promise.all([
        getCalendarioAdmin("current"),
        getAeronavesActivasAdmin(),
        getBloquesHorario(),
      ]);
      const idSemana = cal?.items?.[0]?.id_semana;
      if (!idSemana) { toast.error("No hay una semana en curso publicada para agendar"); return; }
      const jsDay = new Date().getDay();           // 0=Dom..6=Sab
      const isodow = jsDay === 0 ? 6 : jsDay;       // domingo → sábado
      setAgendarCtx({ id_semana: idSemana, aeronaves: aero || [], bloques: blqs || [], dia: Math.min(isodow, 6) });
    } catch {
      toast.error("No se pudo abrir el agendado");
    } finally {
      setAbriendoAgendar(false);
    }
  };

  const handleReporteDia = async () => {
    setGenerandoReporte(true);
    try {
      await abrirReporteVuelosDia(reporteFecha);
    } catch {
      toast.error("No se pudo generar el reporte del día");
    } finally {
      setGenerandoReporte(false);
    }
  };

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

  const cargarFlota = useCallback(async () => {
    try {
      const data = await getFlotaMantenimiento();
      setFlota(Array.isArray(data) ? data : []);
    } catch {
      /* silencioso */
    }
  }, []);

  // Carga inicial
  useEffect(() => {
    Promise.all([cargarVuelos(), cargarOps(), cargarTicker(), cargarFlota()]).finally(() => setLoading(false));
  }, [cargarVuelos, cargarOps, cargarTicker, cargarFlota]);

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

  const handleMantenimientoConfirmado = () => {
    setShowMantenimiento(false);
    cargarFlota();
    cargarVuelos();
    cargarTicker();
  };

  const handleReactivarAeronave = async (a) => {
    try {
      await completarMantenimientoAeronave(a.id_aeronave);
      toast.success(`${a.codigo} operativa nuevamente`);
      cargarFlota();
      cargarTicker();
    } catch (e) {
      toast.error(e?.response?.data?.message || "No se pudo completar el mantenimiento");
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
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
            <RelojTurno />
            <div className="trn__counter">
              <i className="bi bi-airplane-engines" style={{ marginRight: '10px' }}></i>
              {!loading && (
                <span>{vuelos.length} vuelo{vuelos.length !== 1 ? "s" : ""} activo{vuelos.length !== 1 ? "s" : ""}</span>
              )}
            </div>
            {/* Reporte de cierre: vuelos completados del día, por avión (PDF) */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="date"
                value={reporteFecha}
                max={hoyISO}
                onChange={(e) => setReporteFecha(e.target.value)}
                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--c-line-2)", fontSize: "0.85rem" }}
              />
              <button
                className="trn__ops-btn trn__ops-btn--primary"
                disabled={generandoReporte}
                onClick={handleReporteDia}
                title="Vuelos completados del día agrupados por avión, con tacómetro, hobbs y monto"
              >
                <i className="bi bi-file-earmark-pdf" style={{ marginRight: 6 }}></i>
                {generandoReporte ? "Generando…" : "Reporte del día"}
              </button>
              <button
                className="trn__ops-btn"
                disabled={abriendoAgendar}
                onClick={handleAbrirAgendar}
                title="Agregar un vuelo omitido en la semana en curso"
              >
                <i className="bi bi-calendar-plus" style={{ marginRight: 6 }}></i>
                {abriendoAgendar ? "Abriendo…" : "Agendar vuelo"}
              </button>
            </div>
          </div>
        </div>

        {/* ── METAR ─────────────────────────────────────────────────── */}
        <MetarWidget />

        {/* ── Turno del día (apertura/pausa/cambio/cierre + asistencia) ── */}
        <TurnoDiaWidget />

        {/* ── Estado de operaciones ─────────────────────────────────── */}
        {ops && <OpsWidget ops={ops} onSet={handleSetOps} vuelosHoy={vuelos} />}

        {/* ── Flota / mantenimiento imprevisto ──────────────────────── */}
        {flota.length > 0 && (
          <FlotaWidget
            flota={flota}
            onIniciar={() => setShowMantenimiento(true)}
            onReactivar={handleReactivarAeronave}
          />
        )}

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

      {showMantenimiento && (
        <MantenimientoAeronaveModal
          aeronaves={flota}
          onClose={() => setShowMantenimiento(false)}
          onConfirm={handleMantenimientoConfirmado}
        />
      )}

      {agendarCtx && (
        <AgendarVueloModal
          pickSlot
          week="current"
          publicada={true}
          id_semana={agendarCtx.id_semana}
          dia_semana={agendarCtx.dia}
          id_bloque={agendarCtx.bloques[0]?.id_bloque}
          bloques={agendarCtx.bloques}
          aeronaves={agendarCtx.aeronaves}
          onClose={() => setAgendarCtx(null)}
          onCreated={() => { setAgendarCtx(null); cargarVuelos(); }}
        />
      )}
    </>
  );
}
