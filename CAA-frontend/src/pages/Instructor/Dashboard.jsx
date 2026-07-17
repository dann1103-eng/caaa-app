import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { io as socketIO } from "socket.io-client";
import Header from "../../components/Header/Header";
import ToastMantenimiento from "../../components/ToastMantenimiento/ToastMantenimiento";
import ChecklistPostvueloModal from "../../components/ChecklistPostvueloModal/ChecklistPostvueloModal";
import ReporteVueloModal from "../../components/ReporteVueloModal/ReporteVueloModal";
import AvisosTurnoWidget from "../../components/AvisosTurnoWidget/AvisosTurnoWidget";
import {
  getVuelosSemana,
  getMisAlumnos,
  getMisVuelosPractica,
  actualizarLimitesAlumno,
  getInstructoresVuelo,
  actualizarInstructorVuelo,
  avanzarEstadoVuelo,
  getReportesPendientes,
  registrarInasistencia,
} from "../../services/instructorApi";
import { SOCKET_URL } from "../../api/axiosConfig";
import "./Dashboard.css";

const DIAS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

const ESTADO_TAG = {
  PUBLICADO:      { label: "Programado",     cls: "ins__tag--publicado" },
  PROGRAMADO:     { label: "Programado",     cls: "ins__tag--publicado" },
  SALIDA_HANGAR:  { label: "Salida hangar",  cls: "ins__tag--salida" },
  EN_PROGRESO:    { label: "En progreso",    cls: "ins__tag--vuelo" },
  REGRESO_HANGAR: { label: "Regreso hangar", cls: "ins__tag--regreso" },
  FINALIZANDO:    { label: "Finalizando",    cls: "ins__tag--finalizando" },
  COMPLETADO:     { label: "Completado",     cls: "ins__tag--completado" },
  CANCELADO:      { label: "Cancelado",      cls: "ins__tag--cancelado" },
};

const BTN_LABEL = {
  PUBLICADO:      "Salida del Hangar",
  PROGRAMADO:     "Salida del Hangar",
  SALIDA_HANGAR:  "En Vuelo",
  EN_PROGRESO:    "Regreso al Hangar",
  REGRESO_HANGAR: "Finalizar Vuelo",
  FINALIZANDO:    "Finalizar Vuelo",
};

// El simulador no sale/regresa de un hangar físico: solo Iniciar/Finalizar sesión.
const BTN_LABEL_SIM = {
  PUBLICADO:   "Iniciar Sesión",
  PROGRAMADO:  "Iniciar Sesión",
  EN_PROGRESO: "Finalizar Sesión",
};

function formatHora(h) { return h?.slice(0, 5) ?? ""; }

// ¿La hora programada (bloque) todavía no llega? Se usa solo para decidir si
// hay que pedir confirmación de salida anticipada — no bloquea nada.
function esAntesDeHora(horaStr) {
  if (!horaStr) return false;
  const [h, m] = horaStr.split(":").map(Number);
  const programado = new Date();
  programado.setHours(h, m, 0, 0);
  return new Date() < programado;
}

function calcProgreso(vuelo) {
  const { estado, estado_desde, duracion_estimada_min } = vuelo;

  if (estado === "PUBLICADO" || estado === "PROGRAMADO") return null;
  if (estado === "REGRESO_HANGAR" || estado === "FINALIZANDO") return 100;
  if (estado === "COMPLETADO") return null;

  if (!estado_desde || !duracion_estimada_min) return null;
  if (estado !== "SALIDA_HANGAR" && estado !== "EN_PROGRESO") return null;

  const total = 9 + duracion_estimada_min + 9;
  const offsetMin = { SALIDA_HANGAR: 0, EN_PROGRESO: 9 };
  const elapsed = (Date.now() - new Date(estado_desde).getTime()) / 60000;
  const totalElapsed = offsetMin[estado] + elapsed;

  return Math.min(99, Math.max(0, Math.round((totalElapsed / total) * 100)));
}

function EstadoTag({ estado }) {
  const { label, cls } = ESTADO_TAG[estado] ?? { label: estado, cls: "ins__tag--gris" };
  return <span className={`ins__tag ${cls}`}>{label}</span>;
}

// ── Tarjeta de vuelo interactiva ──────────────────────────────────────────
function VueloCard({ vuelo, onAvanzar, onInasistencia, onCompletarVuelo, onAbrirReporte, advancing, weekMode, isToday, onRefresh }) {
  const navigate = useNavigate();
  const [progreso, setProgreso] = useState(() => calcProgreso(vuelo));
  const [tiempoMin, setTiempoMin] = useState("");
  const timerRef = useRef(null);

  useEffect(() => {
    setProgreso(calcProgreso(vuelo));
    clearInterval(timerRef.current);
    const activo = ["SALIDA_HANGAR", "EN_PROGRESO"].includes(vuelo.estado);
    if (!activo) return;
    timerRef.current = setInterval(() => {
      setProgreso(calcProgreso(vuelo));
    }, 15000);
    return () => clearInterval(timerRef.current);
  }, [vuelo.estado, vuelo.estado_desde, vuelo.duracion_estimada_min]);

  const tagInfo = ESTADO_TAG[vuelo.estado] ?? { label: vuelo.estado, cls: "ins__tag--gris" };
  const showBar = progreso !== null;

  const isFinalizando = vuelo.estado === "FINALIZANDO";
  const isCompletado  = vuelo.estado === "COMPLETADO";
  const isAdvancing   = advancing === vuelo.id_vuelo;

  // Bloquear acciones si no es hoy o es semana próxima. Ya NO hay candado por
  // hora programada: el instructor puede adelantar la salida de un vuelo del
  // siguiente bloque si en la práctica despega antes de lo previsto — la
  // única restricción real la aplica el backend (guardia de "avión ocupado").
  const esSemanaProxima = weekMode === "next";
  const canOperate = isToday && !esSemanaProxima;
  const isSim = vuelo.aeronave_tipo === 'SIMULADOR';
  const btnLabel = isSim ? BTN_LABEL_SIM[vuelo.estado] : BTN_LABEL[vuelo.estado];

  const handleConfirmar = () => {
    // Evento de "salida" (a hangar / inicio de sesión): si ocurre antes de la
    // hora programada del bloque, se pide confirmación y se marca el vuelo
    // como salida anticipada — sin tocar el bloque asignado ni el horario.
    const esEventoSalida = vuelo.estado === "PUBLICADO" || vuelo.estado === "PROGRAMADO";
    if (esEventoSalida && esAntesDeHora(vuelo.hora_inicio)) {
      const ok = window.confirm(
        `Este vuelo está programado para las ${formatHora(vuelo.hora_inicio)}. ¿Confirmás la salida anticipada?`
      );
      if (!ok) return;
      onAvanzar(vuelo.id_vuelo, { tiempo_vuelo_min: 0, salida_anticipada: true });
      return;
    }
    onAvanzar(vuelo.id_vuelo, { tiempo_vuelo_min: 0 });
  };

  const handleInasistencia = async () => {
    if (!window.confirm(`¿Registrar inasistencia para ${vuelo.alumno_nombre}?`)) return;
    onInasistencia(vuelo);
  };

  const btnDisabled = isAdvancing;

  const canMarkInasistencia = !isSim && (vuelo.estado === 'PROGRAMADO' || vuelo.estado === 'PUBLICADO' || vuelo.estado === 'SALIDA_HANGAR');
  const inasistenciaDisabled = isAdvancing;

  const handleAccionPrincipal = () => {
    // El simulador no tiene checklist post-vuelo (es de aeronave física) — va
    // directo a la vouchera de simulador.
    if (vuelo.checklist_completado || vuelo.es_inasistencia || isSim) {
      onAbrirReporte(vuelo);
    } else {
      onCompletarVuelo(vuelo, isFinalizando ? tiempoMin : null);
    }
  };

  return (
    <div className={`ins__card ins__card--vuelo ${isToday ? "ins__card--today" : ""}`}>
      <div className="ins__card-header">
        <div className="ins__card-meta">
          <span className="ins__card-hora">{formatHora(vuelo.hora_inicio)}</span>
          <span className="ins__card-sep">·</span>
          <span className="ins__card-aeronave">{vuelo.aeronave_codigo}</span>
        </div>
        <div className="ins__card-tags">
          <span className={`ins__tag ${tagInfo.cls}`}>{tagInfo.label}</span>
          {vuelo.salida_anticipada && (
            <span className="ins__tag ins__tag--anticipada" title="Este vuelo salió antes de la hora programada">
              Salida anticipada
            </span>
          )}
        </div>
      </div>
      <div className="ins__card-alumno">
        {vuelo.alumno_nombre} {vuelo.alumno_apellido}
      </div>

      {showBar && (
        <div className="ins__bar-wrap">
          <div className="ins__bar-track">
            <div
              className={`ins__bar${vuelo.estado === "REGRESO_HANGAR" || vuelo.estado === "FINALIZANDO" ? " ins__bar--full" : ""}`}
              style={{ width: `${progreso}%` }}
            />
          </div>
          <span className="ins__bar-pct">{progreso}%</span>
        </div>
      )}

      {isFinalizando && canOperate && vuelo.es_inasistencia && (
        <div className="ins__inasistencia-banner">
          <i className="bi bi-exclamation-triangle"></i> Inasistencia detectada: Tiempo de vuelo fijado en 0 min
        </div>
      )}

      {isCompletado && vuelo.tiempo_vuelo_min > 0 && (
        <div className="ins__completado-resumen">
          Tiempo registrado: <strong>{vuelo.tiempo_vuelo_min} min</strong>
        </div>
      )}

      <div className="ins__card-actions">
        {canOperate && !isCompletado && (
          <div className="ins__action-row">
            <div className="ins__btn-group">
              <button
                className="ins__btn-avanzar"
                onClick={handleConfirmar}
                disabled={btnDisabled}
              >
                {isAdvancing ? "Procesando…" : btnLabel}
              </button>
              {canMarkInasistencia && (
                <button
                  className="ins__btn-inasistencia"
                  onClick={handleInasistencia}
                  disabled={inasistenciaDisabled}
                >
                  Inasistencia
                </button>
              )}
            </div>
          </div>
        )}

        {isCompletado && (
          <div className="ins__report-actions">
            <button className="ins__btn-reporte" onClick={handleAccionPrincipal}>
              {vuelo.es_inasistencia
                ? "Ver Inasistencia"
                : (isSim
                    ? "Ver Vouchera de Simulador"
                    : (vuelo.checklist_completado ? "Ver Reporte de Vuelo" : "Completar Checklist"))}
            </button>

            {vuelo.checklist_completado && !isSim && (
              <button className="ins__btn-revisar-checklist" onClick={() => onCompletarVuelo(vuelo)}>
                <i className="bi bi-card-checklist"></i> Revisar Checklist Post-Vuelo
              </button>
            )}
          </div>
        )}

        {(vuelo.loadsheet_estado === "ENVIADO" || vuelo.loadsheet_estado === "COMPLETADO") && (
          <button
            className="ins__btn-ver-loadsheet"
            onClick={() => navigate(`/instructor/loadsheet/${vuelo.id_vuelo}`)}
            title="El alumno envió su loadsheet — verlo en modo lectura"
          >
            <i className="bi bi-clipboard-data"></i> Ver Loadsheet del alumno
          </button>
        )}
      </div>
    </div>
  );
}

// ── Fila de alumno ─────────────────────────────────────────────────────────
function AlumnoFila({ alumno, onGuardado, instructoresVuelo = [], onInstructorVueloGuardado }) {
  const baseAvion = String(alumno.limite_vuelos_avion ?? 3);
  const baseSim = String(alumno.limite_vuelos_simulador ?? 3);
  const baseDia = String(alumno.limite_vuelos_dia ?? 1);
  const [limAvionStr, setLimAvionStr] = useState(baseAvion);
  const [limSimStr, setLimSimStr] = useState(baseSim);
  const [limDiaStr, setLimDiaStr] = useState(baseDia);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Instructor de VUELO asignado al alumno — puede ser distinto del instructor
  // de cabecera (yo). Vacío = "sin asignar" (las solicitudes las revisa el de
  // cabecera, como antes).
  const [instructorVueloStr, setInstructorVueloStr] = useState(String(alumno.id_instructor_vuelo ?? ""));
  const [savingInstructorVuelo, setSavingInstructorVuelo] = useState(false);

  // Re-sincronizar si el alumno cambia (ej. tras guardar/recargar)
  useEffect(() => {
    setLimAvionStr(String(alumno.limite_vuelos_avion ?? 3));
    setLimSimStr(String(alumno.limite_vuelos_simulador ?? 3));
    setLimDiaStr(String(alumno.limite_vuelos_dia ?? 1));
    setInstructorVueloStr(String(alumno.id_instructor_vuelo ?? ""));
  }, [alumno.limite_vuelos_avion, alumno.limite_vuelos_simulador, alumno.limite_vuelos_dia, alumno.id_instructor_vuelo]);

  const handleCambiarInstructorVuelo = async (e) => {
    const valor = e.target.value;
    setInstructorVueloStr(valor);
    setSavingInstructorVuelo(true);
    try {
      await actualizarInstructorVuelo(alumno.id_alumno, valor || null);
      const elegido = instructoresVuelo.find((i) => String(i.id_instructor) === valor);
      onInstructorVueloGuardado(alumno.id_alumno, valor ? Number(valor) : null, elegido?.nombre_completo ?? null);
      toast.success(valor ? `Instructor de vuelo: ${elegido?.nombre_completo ?? ""}` : "Instructor de vuelo desasignado");
    } catch (e2) {
      setInstructorVueloStr(String(alumno.id_instructor_vuelo ?? ""));
      toast.error(e2.response?.data?.message || "No se pudo actualizar el instructor de vuelo");
    } finally {
      setSavingInstructorVuelo(false);
    }
  };

  const cambiado = limAvionStr !== baseAvion || limSimStr !== baseSim || limDiaStr !== baseDia;

  const handleGuardar = async () => {
    const limAvion = Number(limAvionStr);
    const limSim = Number(limSimStr);
    const limDia = Number(limDiaStr);

    if (limAvionStr.trim() === "" || limSimStr.trim() === "" ||
        isNaN(limAvion) || limAvion < 0 || limAvion > 6 ||
        isNaN(limSim) || limSim < 0 || limSim > 6) {
      setError("Valores entre 0 y 6");
      return;
    }
    // El tope por día arranca en 1: un 0 bloquearía todos los días.
    if (limDiaStr.trim() === "" || isNaN(limDia) || limDia < 1 || limDia > 6) {
      setError("Vuelos por día: entre 1 y 6");
      return;
    }

    setError("");
    setSaving(true);
    try {
      await actualizarLimitesAlumno(alumno.id_alumno, limAvion, limSim, limDia);
      onGuardado(alumno.id_alumno, limAvion, limSim, limDia);
      toast.success("Límites actualizados");
    } catch (e) {
      setError(e.response?.data?.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="ins__tr">
      <td className="ins__td">
        <div className="ins__alumno-nombre">
          {alumno.nombre} {alumno.apellido}
        </div>
        {alumno.numero_licencia && (
          <div className="ins__alumno-lic">{alumno.numero_licencia}</div>
        )}
      </td>
      <td className="ins__td ins__td--center">
        {alumno.soleado ? (
          <span className="ins__badge ins__badge--soleado">Soleado</span>
        ) : (
          <span className="ins__badge ins__badge--dual">Dual</span>
        )}
      </td>
      <td className="ins__td ins__td--center">
        <div className="ins__limite-display">
          <span title="Límite Avión por semana"><i className="bi bi-airplane"></i> {alumno.limite_vuelos_avion ?? 3}</span>
          <span className="ins__limite-sep">·</span>
          <span title="Límite Simulador por semana"><i className="bi bi-pc-display"></i> {alumno.limite_vuelos_simulador ?? 3}</span>
          {(alumno.limite_vuelos_dia ?? 1) > 1 && (
            <>
              <span className="ins__limite-sep">·</span>
              <span title={`Puede volar hasta ${alumno.limite_vuelos_dia} aviones el mismo día`}>
                <i className="bi bi-calendar-day"></i> {alumno.limite_vuelos_dia}/día
              </span>
            </>
          )}
        </div>
      </td>
      <td className="ins__td">
        <div className="ins__limite-dual-wrap">
          <div className="ins__limite-field">
            <label>Avión</label>
            <input
              className="ins__limite-input"
              type="number"
              min={0}
              max={6}
              value={limAvionStr}
              onChange={(e) => { setLimAvionStr(e.target.value); setError(""); }}
            />
          </div>
          <div className="ins__limite-field">
            <label>Sim.</label>
            <input
              className="ins__limite-input"
              type="number"
              min={0}
              max={6}
              value={limSimStr}
              onChange={(e) => { setLimSimStr(e.target.value); setError(""); }}
            />
          </div>
          <div className="ins__limite-field">
            <label title="Cuántos aviones puede pedir el alumno en un mismo día">Por día</label>
            <input
              className="ins__limite-input"
              type="number"
              min={1}
              max={6}
              value={limDiaStr}
              onChange={(e) => { setLimDiaStr(e.target.value); setError(""); }}
            />
          </div>
          <button
            className="ins__limite-btn"
            disabled={saving || !cambiado}
            onClick={handleGuardar}
          >
            {saving ? "…" : "Guardar"}
          </button>
        </div>
        {error && <div className="ins__fila-error">{error}</div>}
      </td>
      <td className="ins__td">
        <select
          className="ins__limite-input"
          value={instructorVueloStr}
          disabled={savingInstructorVuelo}
          onChange={handleCambiarInstructorVuelo}
          title="Quién vuela realmente con este alumno — a él le van a llegar sus solicitudes de horas para revisar y enviar a programación"
        >
          <option value="">— (mismo que cabecera)</option>
          {instructoresVuelo.map((i) => (
            <option key={i.id_instructor} value={i.id_instructor}>{i.nombre_completo}</option>
          ))}
        </select>
      </td>
    </tr>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────
export default function InstructorDashboard() {
  // Lo usa el botón "Solicitudes de mis alumnos". Estaba declarado solo dentro de
  // VueloCard, así que acá `navigate` no existía: el onClick tiraba
  // "ReferenceError: navigate is not defined" y el botón no hacía nada. El error
  // no salía en la consola de React porque un throw dentro de un handler va a
  // window.onerror, no a console.error.
  const navigate = useNavigate();
  const [weekMode, setWeekMode] = useState("current");

  const [vuelos, setVuelos]               = useState([]);
  const [semana, setSemana]               = useState(null);
  const [alumnos, setAlumnos]             = useState([]);
  const [instructoresVuelo, setInstructoresVuelo] = useState([]);
  const [semanaProxima, setSemanaProxima] = useState(null);
  const [advancing, setAdvancing]         = useState(null);
  const [searchTerm, setSearchTerm]       = useState("");

  const [loadingVuelos, setLoadingVuelos]   = useState(true);
  const [loadingAlumnos, setLoadingAlumnos] = useState(true);
  const [errorAlumnos, setErrorAlumnos]     = useState(null);

  // Checklist post-vuelo
  const [checklistModal, setChecklistModal] = useState(null); // { vuelo, tiempoMin }

  // Reportes pendientes de firma
  const [reportesPendientes, setReportesPendientes]   = useState([]);
  const [loadingReportes, setLoadingReportes]         = useState(true);
  const [reporteModal, setReporteModal]               = useState(null); // vuelo
  const [vuelosPractica, setVuelosPractica]           = useState([]);   // vuelos donde ESTE instructor es el practicante
  const [practicaReporte, setPracticaReporte]         = useState(null); // vuelo de práctica a firmar como estudiante

  const cargarVuelosPractica = useCallback(async () => {
    try {
      const data = await getMisVuelosPractica();
      setVuelosPractica(Array.isArray(data) ? data : []);
    } catch { /* silencioso */ }
  }, []);

  const fetchVuelos = useCallback(async () => {
    try {
      const data = await getVuelosSemana(weekMode);
      setSemana(data.semana);
      setVuelos(data.vuelos);
    } catch { 
      setVuelos([]);
    } finally {
      setLoadingVuelos(false);
    }
  }, [weekMode]);

  const cargarReportesPendientes = useCallback(async () => {
    try {
      const data = await getReportesPendientes();
      setReportesPendientes(data);
    } catch { /* silencioso */ }
  }, []);

  // Carga inicial
  useEffect(() => {
    fetchVuelos();
    getMisAlumnos()
      .then((data) => { setAlumnos(data.alumnos); setSemanaProxima(data.semana); setErrorAlumnos(null); })
      // Antes un error acá (403/500) quedaba indistinguible de "no tenés
      // alumnos": el catch estaba vacío y la lista arrancaba en []. Ahora se
      // guarda el mensaje para mostrarlo distinto del estado vacío real.
      .catch((e) => setErrorAlumnos(e?.response?.data?.message || "No se pudo cargar tus alumnos."))
      .finally(() => setLoadingAlumnos(false));
    getInstructoresVuelo().then(setInstructoresVuelo).catch(() => {});
    cargarReportesPendientes().finally(() => setLoadingReportes(false));
    cargarVuelosPractica();
  }, [fetchVuelos, cargarReportesPendientes, cargarVuelosPractica]);

  // Polling 30 s (solo semana actual)
  useEffect(() => {
    if (weekMode !== "current") return;
    const t = setInterval(fetchVuelos, 30000);
    return () => clearInterval(t);
  }, [weekMode, fetchVuelos]);

  // Socket.io tiempo real
  useEffect(() => {
    const socket = socketIO(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    socket.on("vuelo_estado_changed", ({ id_vuelo, estado, registrado_en, duracion_estimada_min, tiempo_vuelo_min, es_inasistencia, salida_anticipada }) => {
      setVuelos((prev) =>
        prev.map((v) => {
          if (v.id_vuelo !== id_vuelo) return v;
          const updated = { ...v, estado, estado_desde: registrado_en };
          if (duracion_estimada_min != null) updated.duracion_estimada_min = duracion_estimada_min;
          if (tiempo_vuelo_min != null) updated.tiempo_vuelo_min = tiempo_vuelo_min;
          if (es_inasistencia != null) updated.es_inasistencia = es_inasistencia;
          if (salida_anticipada != null) updated.salida_anticipada = salida_anticipada;

          // Al llegar a COMPLETADO, el checklist post-vuelo es obligatorio y va
          // PRIMERO — el backend rechaza firmar el reporte sin él (400). Antes
          // esto abría directo el reporte (la "vouchera"), saltándose el
          // checklist si el instructor completaba el vuelo con el botón
          // "Finalizar Vuelo" en vez de por el flujo del checklist.
          if (estado === "COMPLETADO" && v.estado !== "COMPLETADO") {
            // El simulador no tiene checklist post-vuelo — va directo a la vouchera.
            if (updated.es_inasistencia || updated.checklist_completado || updated.aeronave_tipo === "SIMULADOR") {
              setReporteModal(updated);
            } else {
              setChecklistModal({ vuelo: updated, tiempoMin: parseInt(updated.tiempo_vuelo_min, 10) || 0 });
            }
          }

          return updated;
        })
      );
    });

    return () => socket.disconnect();
  }, []);

  const handleAvanzar = async (id_vuelo, body) => {
    setAdvancing(id_vuelo);
    try {
      const resultado = await avanzarEstadoVuelo(id_vuelo, body);
      setVuelos((prev) =>
        prev.map((v) => {
          if (v.id_vuelo !== resultado.id_vuelo) return v;
          const updated = { ...v, estado: resultado.estado, estado_desde: resultado.registrado_en };
          if (resultado.duracion_estimada_min != null) updated.duracion_estimada_min = resultado.duracion_estimada_min;
          if (resultado.tiempo_vuelo_min != null) updated.tiempo_vuelo_min = resultado.tiempo_vuelo_min;
          if (resultado.salida_anticipada != null) updated.salida_anticipada = resultado.salida_anticipada;
          return updated;
        })
      );
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudo avanzar el estado");
      fetchVuelos();
    } finally {
      setAdvancing(null);
    }
  };

  const handleInasistencia = async (vuelo) => {
    setAdvancing(vuelo.id_vuelo);
    try {
      await registrarInasistencia(vuelo.id_vuelo);
      toast.success("Inasistencia registrada");
      
      // Limpieza de UI: Cerrar cualquier modal abierto y refrescar
      setChecklistModal(null);
      setReporteModal(null);
      fetchVuelos();
      
      // Opcional: Abrir reporte si se desea, pero el usuario pidió "refrescar inmediatamente sin intentar abrir Checklist"
      // setReporteModal({ ...vuelo, es_inasistencia: true });
    } catch (e) {
      toast.error("Error al registrar inasistencia");
    } finally {
      setAdvancing(null);
    }
  };

  const handleAbrirChecklist = (vuelo, tiempoMin) => {
    if (vuelo.es_inasistencia) return; // Bypass de seguridad: inasistencias no disparan formularios
    setChecklistModal({ vuelo, tiempoMin: parseInt(tiempoMin, 10) });
  };

  const handleChecklistCompletado = async () => {
    setChecklistModal(null);
    fetchVuelos();
    cargarReportesPendientes();
  };

  const handleGuardado = (id_alumno, limAvion, limSim, limDia) => {
    setAlumnos((prev) =>
      prev.map((a) => a.id_alumno === id_alumno
        ? { ...a, limite_vuelos_avion: limAvion, limite_vuelos_simulador: limSim, limite_vuelos_dia: limDia }
        : a)
    );
  };

  const handleInstructorVueloGuardado = (id_alumno, id_instructor_vuelo, nombre) => {
    setAlumnos((prev) =>
      prev.map((a) => a.id_alumno === id_alumno
        ? { ...a, id_instructor_vuelo, instructor_vuelo_nombre: nombre }
        : a)
    );
  };

  // Agrupar por día
  const porDia = {};
  for (const v of vuelos) {
    if (!porDia[v.dia_semana]) porDia[v.dia_semana] = [];
    porDia[v.dia_semana].push(v);
  }
  const diasBase = Object.keys(porDia).map(Number).sort();
  const hoyNum = new Date().getDay();
  const diaHoyDb = hoyNum === 0 ? 7 : hoyNum; // Ajustar si domingo es 7
  // Hoy siempre primero (semana actual): así el instructor ve sus vuelos del
  // momento sin tener que hacer scroll pasando los días ya pasados de la semana.
  const dias = (weekMode === "current" && diasBase.includes(diaHoyDb))
    ? [diaHoyDb, ...diasBase.filter((d) => d !== diaHoyDb)]
    : diasBase;

  return (
    <>
      <Header />
      <ToastMantenimiento />

      {checklistModal && (
        <ChecklistPostvueloModal
          id_vuelo={checklistModal.vuelo.id_vuelo}
          vueloInfo={checklistModal.vuelo}
          tiempoVueloMin={checklistModal.tiempoMin}
          onClose={() => setChecklistModal(null)}
          onCompleted={handleChecklistCompletado}
        />
      )}

      {reporteModal && (
        <ReporteVueloModal
          id_vuelo={reporteModal.id_vuelo}
          mode="instructor"
          onClose={() => {
            setReporteModal(null);
            cargarReportesPendientes();
            fetchVuelos();
          }}
        />
      )}

      {/* Reporte de un vuelo de práctica: el practicante firma como estudiante. */}
      {practicaReporte && (
        <ReporteVueloModal
          id_vuelo={practicaReporte.id_vuelo}
          mode="alumno"
          onClose={() => { setPracticaReporte(null); cargarVuelosPractica(); }}
        />
      )}

      <div className="ins">
        <div className="ins__top">
          <div>
            <p className="ins__eyebrow">Panel de instructor</p>
            <h2 className="ins__title">Mi actividad semanal</h2>
            <p className="ins__subtitle">Gestioná tus vuelos y alumnos asignados.</p>
            <button
              type="button"
              className="ins__cta-solicitudes"
              onClick={() => navigate("/instructor/solicitudes")}
            >
              <i className="bi bi-calendar-check"></i> Solicitudes de mis alumnos
            </button>
          </div>
          <div className="ins__tabs">
            <button
              className={`ins__tab ${weekMode === "current" ? "ins__tab--active" : ""}`}
              onClick={() => { setWeekMode("current"); setLoadingVuelos(true); }}
            >
              Semana actual
            </button>
            <button
              className={`ins__tab ${weekMode === "next" ? "ins__tab--active" : ""}`}
              onClick={() => { setWeekMode("next"); setLoadingVuelos(true); }}
            >
              Semana siguiente
            </button>
          </div>
        </div>

        <div className="ins__avisos">
          <AvisosTurnoWidget />
        </div>

        {vuelosPractica.length > 0 && (
          <div className="ins__section">
            <h3 className="ins__section-title">
              <i className="bi bi-mortarboard" style={{ color: 'var(--c-brand-700)' }}></i>
              Mis vuelos de práctica (recibo instrucción)
            </h3>
            <div className="ins__practica-grid">
              {vuelosPractica.map((v) => (
                <div key={v.id_vuelo} className="ins__practica-card">
                  <div className="ins__practica-head">
                    <span className={`ins__practica-tag ins__practica-tag--${(v.tipo_instruccion || '').toLowerCase()}`}>
                      {v.tipo_instruccion === "REFRESH" ? "Refresh" : "Chequeo"}
                    </span>
                    <strong>{v.aeronave_codigo}</strong>
                  </div>
                  <div className="ins__practica-meta">
                    {v.fecha_vuelo ? new Date(v.fecha_vuelo).toLocaleDateString("es-SV", { weekday: "short", day: "2-digit", month: "2-digit" }) : DIAS[v.dia_semana]}
                    {" · "}{String(v.hora_inicio || "").slice(0,5)}
                    {" · PIC: "}{v.pic_nombre} {v.pic_apellido}
                  </div>
                  <div className="ins__practica-actions">
                    {v.aeronave_tipo !== "SIMULADOR" && (
                      <button
                        className="ins__btn-practica"
                        onClick={() => navigate(`/instructor/practica/loadsheet/${v.id_vuelo}`)}
                      >
                        <i className="bi bi-calculator"></i> Loadsheet
                        {v.loadsheet_estado ? ` · ${v.loadsheet_estado.toLowerCase()}` : ""}
                      </button>
                    )}
                    {(v.estado === "COMPLETADO" || v.reporte_estado === "PENDIENTE_ALUMNO") && (
                      <button
                        className="ins__btn-practica"
                        onClick={() => setPracticaReporte(v)}
                      >
                        <i className="bi bi-pen"></i> {v.reporte_estado === "COMPLETADO" ? "Ver reporte" : "Firmar reporte"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="ins__section">
          {loadingVuelos ? (
            <p className="ins__loading">Cargando horario…</p>
          ) : vuelos.length === 0 ? (
            <p className="ins__empty">No tenés vuelos programados para esta semana.</p>
          ) : (
            <div className="ins__semana-grid">
              {dias.map((dia) => (
                <div key={dia} className="ins__day-group">
                  <div className="ins__day-header">
                    <span className="ins__day-name">{DIAS[dia]}</span>
                    {dia === diaHoyDb && weekMode === "current" && (
                      <span className="ins__day-today">Hoy</span>
                    )}
                  </div>
                  <div className="ins__day-cards">
                    {porDia[dia].map((v) => (
                      <VueloCard
                        key={v.id_vuelo}
                        vuelo={v}
                        onAvanzar={handleAvanzar}
                        onInasistencia={handleInasistencia}
                        onCompletarVuelo={handleAbrirChecklist}
                        onAbrirReporte={(vl) => setReporteModal(vl)}
                        onRefresh={fetchVuelos}
                        advancing={advancing}
                        weekMode={weekMode}
                        isToday={dia === diaHoyDb && weekMode === "current"}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="ins__secondary">
        <div className="ins__section">
          <h3 className="ins__section-title">
            <i className="bi bi-file-earmark-text" style={{ color: 'var(--c-brand-700)' }}></i>
            Reportes enviados al alumno
            {reportesPendientes.length > 0 && (
              <span className="ins__badge-count">{reportesPendientes.length}</span>
            )}
          </h3>
          {loadingReportes ? (
            <p className="ins__loading">Cargando reportes…</p>
          ) : reportesPendientes.length === 0 ? (
            <p className="ins__empty">No hay reportes pendientes de firma del alumno.</p>
          ) : (
            <div className="ins__table-wrap">
              <table className="ins__table">
                <thead>
                  <tr>
                    <th className="ins__th">Alumno</th>
                    <th className="ins__th">Aeronave</th>
                    <th className="ins__th">Fecha</th>
                    <th className="ins__th ins__th--center">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {reportesPendientes.map((r) => (
                    <tr key={r.id_vuelo} className="ins__tr">
                      <td className="ins__td">{r.alumno_nombre} {r.alumno_apellido}</td>
                      <td className="ins__td">{r.aeronave_codigo}</td>
                      <td className="ins__td">
                        {r.fecha_vuelo ? new Date(r.fecha_vuelo).toLocaleDateString("es-SV", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                      </td>
                      <td className="ins__td ins__td--center">
                        <button className="ins__btn-reporte" onClick={() => setReporteModal(r)}>Ver reporte</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="ins__section ins__section--alumnos">
          <h3 className="ins__section-title">
            <i className="bi bi-people" style={{ color: 'var(--c-brand-700)' }}></i>
            Mis alumnos asignados
          </h3>
          <p className="ins__semana-label">
            <i className="bi bi-info-circle"></i> Límite de vuelos por semana de cada alumno
            (avión y simulador, 0–6). Es el valor base permanente; podés ajustarlo en cualquier momento.
          </p>

          <div className="ins__filters-alumnos">
            <div className="ins__search-group">
              <i className="bi bi-search"></i>
              <input 
                type="text" 
                placeholder="Buscar alumno por nombre..." 
                className="ins__search-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {loadingAlumnos ? (
            <p className="ins__loading">Cargando alumnos…</p>
          ) : errorAlumnos ? (
            <p className="ins__empty ins__empty--error">⚠ {errorAlumnos}</p>
          ) : alumnos.length === 0 ? (
            <p className="ins__empty">No tenés alumnos asignados actualmente.</p>
          ) : (
            <div className="ins__table-wrap">
              <table className="ins__table">
                <thead>
                  <tr>
                    <th className="ins__th">Alumno</th>
                    <th className="ins__th ins__th--center">Condición</th>
                    <th className="ins__th ins__th--center">Límite actual</th>
                    <th className="ins__th">Ajustar límite</th>
                    <th className="ins__th" title="Quién vuela realmente con el alumno — a él le llegan sus solicitudes de horas">Instructor de vuelo</th>
                  </tr>
                </thead>
                <tbody>
                  {alumnos
                    .filter(a => a.nombre_completo.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map((a) => (
                      <AlumnoFila
                        key={a.id_alumno}
                        alumno={a}
                        onGuardado={handleGuardado}
                        instructoresVuelo={instructoresVuelo}
                        onInstructorVueloGuardado={handleInstructorVueloGuardado}
                      />
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </div>
      </div>
    </>
  );
}
