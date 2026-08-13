import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { io as socketIO } from "socket.io-client";
import { toast } from "sonner";
import Header from "../../components/Header/Header";
import MiHorarioList from "../../components/MiHorarioList/MiHorarioList";
import MisClasesList from "../../components/MisClasesList/MisClasesList";
import MetarWidget from "../../components/MetarWidget/MetarWidget";
import EstadoOperacionesWidget from "../../components/EstadoOperacionesWidget/EstadoOperacionesWidget";
import AvisosTurnoWidget from "../../components/AvisosTurnoWidget/AvisosTurnoWidget";
import ScheduleWeekTable from "../../components/ScheduleWeekTable/ScheduleWeekTable";
import { getCalendarioPublico } from "../../services/programacionApi";
import {
  getMiHorario,
  getMiInfo,
  getMisSolicitudesCancelacion,
  getCondicionesCancelacion,
  getMisClases,
  getMisOfertas,
  aceptarOfertaStandby,
  rechazarOfertaStandby
} from "../../services/alumnoApi";
import { API_URL, SOCKET_URL } from "../../api/axiosConfig";
import "./Dashboard.css";

const CARD_ICONS = {
  licencia: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M16 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
      <path d="M6 9h4M6 13h2" />
    </svg>
  ),
  instructor: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3" />
      <path d="M20 21a8 8 0 1 0-16 0" />
      <path d="M12 11v4M10 15h4" />
    </svg>
  ),
  semana: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  ),
  estado: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
      <path d="M12 6v6l4 2" />
    </svg>
  ),
};

export default function AlumnoDashboard() {
  const user = JSON.parse(localStorage.getItem("user")) || {};
  const navigate = useNavigate();

  const [weekMode, setWeekMode] = useState("current"); // "current", "next", "cancelaciones"
  const [vuelos, setVuelos] = useState([]);
  const [loadingVuelos, setLoadingVuelos] = useState(false);
  const [solicitudes, setSolicitudes] = useState([]);
  const [loadingSolicitudes, setLoadingSolicitudes] = useState(false);
  const [estadoCancel, setEstadoCancel] = useState(null);
  const [info, setInfo] = useState(null);
  const [misClases, setMisClases] = useState([]);
  const [loadingClases, setLoadingClases] = useState(false);
  const [ofertas, setOfertas] = useState([]);
  const [calendarioEscuela, setCalendarioEscuela] = useState([]);
  const cargarOfertas = () => getMisOfertas().then((d) => setOfertas(Array.isArray(d) ? d : [])).catch(() => setOfertas([]));

  // Programación de toda la escuela (mismo dato que consumen Proyección y el
  // dashboard del instructor). Sirve para que el alumno vea qué horarios están
  // libres o se liberaron antes de pedir un vuelo.
  useEffect(() => {
    const cargarCalendarioEscuela = () =>
      getCalendarioPublico().then((data) => setCalendarioEscuela(Array.isArray(data) ? data : [])).catch(() => {});
    cargarCalendarioEscuela();
    const t = setInterval(cargarCalendarioEscuela, 20000);
    return () => clearInterval(t);
  }, []);

  const fetchClases = useCallback(async () => {
    setLoadingClases(true);
    try {
      const data = await getMisClases();
      setMisClases(Array.isArray(data) ? data : []);
    } catch {
      setMisClases([]);
    } finally {
      setLoadingClases(false);
    }
  }, []);

  useEffect(() => {
    getMiInfo().then(setInfo).catch(() => { });
    fetchClases();
    cargarOfertas();
  }, [fetchClases]);

  // Clases de teoría de la semana en curso (lunes a domingo, hora de El
  // Salvador) — se muestran en la pestaña "Semana actual" junto a los vuelos,
  // con la misma tarjeta (y botón de firma) de la pestaña "Mis clases".
  const clasesSemanaActual = useMemo(() => {
    const hoy = new Date(`${new Date().toLocaleDateString("en-CA", { timeZone: "America/El_Salvador" })}T00:00:00`);
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
    const domingo = new Date(lunes);
    domingo.setDate(lunes.getDate() + 6);
    const desde = lunes.toLocaleDateString("en-CA");
    const hasta = domingo.toLocaleDateString("en-CA");
    return misClases.filter((c) => {
      const f = String(c.fecha || "").slice(0, 10);
      return f >= desde && f <= hasta;
    });
  }, [misClases]);

  const DIAS_OF = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const aceptarOferta = async (id) => {
    try { const r = await aceptarOfertaStandby(id); toast.success(r?.message || "¡Cupo tomado!"); cargarOfertas(); fetchVuelos(); }
    catch (e) { toast.error(e?.response?.data?.message || "No se pudo tomar el cupo"); cargarOfertas(); }
  };
  const rechazarOferta = async (id) => {
    try { await rechazarOfertaStandby(id); toast.success("Oferta rechazada"); cargarOfertas(); }
    catch (e) { toast.error(e?.response?.data?.message || "Error"); }
  };

  const fetchVuelos = useCallback(async () => {
    if (weekMode === "cancelaciones" || weekMode === "clases") return;
    setLoadingVuelos(true);
    try {
      const data = await getMiHorario(weekMode);
      setVuelos(Array.isArray(data?.vuelos) ? data.vuelos : []);
    } catch {
      setVuelos([]);
    } finally {
      setLoadingVuelos(false);
    }
  }, [weekMode]);

  const fetchSolicitudes = useCallback(async () => {
    if (weekMode !== "cancelaciones") return;
    setLoadingSolicitudes(true);
    try {
      const [data, estado] = await Promise.all([
        getMisSolicitudesCancelacion(),
        getCondicionesCancelacion().catch(() => null),
      ]);
      setSolicitudes(Array.isArray(data) ? data : []);
      if (estado) setEstadoCancel(estado);
    } catch {
      setSolicitudes([]);
    } finally {
      setLoadingSolicitudes(false);
    }
  }, [weekMode]);

  useEffect(() => {
    if (weekMode === "cancelaciones") {
      fetchSolicitudes();
    } else {
      fetchVuelos();
    }
  }, [weekMode, fetchVuelos, fetchSolicitudes]);

  const fetchVuelosRef = useRef(fetchVuelos);
  useEffect(() => { fetchVuelosRef.current = fetchVuelos; }, [fetchVuelos]);

  /* ── socket: real-time vuelo updates ── */
  useEffect(() => {
    const socket = socketIO(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socket.on("vuelo_estado_changed", ({ id_vuelo, estado, registrado_en }) => {
      setVuelos((prev) => {
        const belongs = prev.some((v) => v.id_vuelo === id_vuelo);
        if (!belongs) return prev;
        return prev.map((v) =>
          v.id_vuelo === id_vuelo
            ? { ...v, estado, estado_desde: registrado_en }
            : v
        );
      });
    });

    socket.on("vuelo_cancelado", ({ id_vuelo }) => {
      setVuelos((prev) => {
        const belongs = prev.some((v) => v.id_vuelo === id_vuelo);
        if (!belongs) return prev;
        return prev.map((v) =>
          v.id_vuelo === id_vuelo ? { ...v, estado: "CANCELADO" } : v
        );
      });
    });

    socket.on("vuelo_completado", ({ id_vuelo }) => {
      setVuelos((prev) => {
        if (!prev.some((v) => v.id_vuelo === id_vuelo)) return prev;
        toast.info("Tu vuelo ha sido completado. Revisá tu reporte pendiente.");
        fetchVuelosRef.current();
        return prev;
      });
    });

    return () => socket.disconnect();
  }, []);

  const instructorNombre = info
    ? [info.instructor_nombre, info.instructor_apellido].filter(Boolean).join(" ") || "—"
    : "—";

  // Día de hoy en formato de la BD (ISO: lunes=1 … domingo=7), para que el
  // calendario de la escuela abra en la pestaña del día actual.
  const hoyNum = new Date().getDay();
  const diaHoyDb = hoyNum === 0 ? 7 : hoyNum;

  const semanaLabel = weekMode === "current" ? "Semana actual" : weekMode === "next" ? "Semana siguiente" : "Mis Cancelaciones";
  const estadoLabel = weekMode === "current" ? "En curso" : weekMode === "next" ? "Próxima" : "Variado";

  return (
    <>
      <Header />

      <div className="dash">
        {/* ── Estado de operaciones + avisos de turno (antes del botón de agendar) ── */}
        <div className="dash__ops">
          <EstadoOperacionesWidget />
          <AvisosTurnoWidget />
        </div>

        {/* ── Top ── */}
        <div className="dash__top">
          <div className="dash__top-left">
            <p className="dash__eyebrow">Panel del alumno</p>
            <h2 className="dash__title">
              Hola, <span className="dash__title-name">{user.nombre || "Alumno"}</span>
            </h2>
            <p className="dash__subtitle">Revisá y gestioná tu horario semanal de vuelos.</p>
          </div>
          <button 
            className="btn-agendar" 
            onClick={() => navigate("/alumno/agendar")}
            disabled={info?.limite_vuelos_avion === 0 && info?.limite_vuelos_simulador === 0}
            title={info?.limite_vuelos_avion === 0 && info?.limite_vuelos_simulador === 0 ? "No tenés vuelos habilitados para esta semana" : ""}
          >
            <i className="bi bi-plus-lg"></i> {info?.limite_vuelos_avion === 0 && info?.limite_vuelos_simulador === 0 ? "Vuelos deshabilitados" : "Agendar clase"}
          </button>
        </div>

        {/* ── Info cards ── */}
        <div className="dash__cards">
          <div className="dash__card">
            <span className="dash__card-icon">{CARD_ICONS.licencia}</span>
            <div>
              <div className="dash__card-label">Licencia</div>
              <div className="dash__card-value">{info?.licencia ?? "—"}</div>
            </div>
          </div>

          <div className="dash__card">
            <span className="dash__card-icon">{CARD_ICONS.instructor}</span>
            <div>
              <div className="dash__card-label">Instructor</div>
              <div className="dash__card-value">{instructorNombre}</div>
            </div>
          </div>

          <div className="dash__card">
            <span className="dash__card-icon">{CARD_ICONS.semana}</span>
            <div>
              <div className="dash__card-label">Límite Avión</div>
              <div className="dash__card-value">{info?.limite_vuelos_avion ?? 3}</div>
            </div>
          </div>

          <div className="dash__card">
            <span className="dash__card-icon">{CARD_ICONS.estado}</span>
            <div>
              <div className="dash__card-label">Límite Simulador</div>
              <div className="dash__card-value">{info?.limite_vuelos_simulador ?? 3}</div>
            </div>
          </div>
        </div>

        {/* ── Body: main + sidebar ── */}
        <div className="dash__body">
          <div className="dash__main">
            {/* Ofertas de cupos liberados (lista de espera) */}
            {ofertas.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                {ofertas.map((o) => (
                  <div key={o.id_standby} style={{ background: "var(--c-success-50, #f0fdf4)", border: "1px solid var(--c-success-100, #dcfce7)", borderRadius: "var(--radius-md)", padding: "14px 16px", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, color: "var(--c-success-700, #15803d)", marginBottom: 6 }}>
                      <i className="bi bi-stopwatch"></i> ¡Se liberó un vuelo que pediste!
                    </div>
                    <div style={{ fontSize: "var(--text-sm)", color: "var(--c-ink-2)", marginBottom: 10 }}>
                      {DIAS_OF[o.dia_semana]} · {String(o.hora_inicio).slice(0,5)}{o.hora_fin ? `–${String(o.hora_fin).slice(0,5)}` : ""}
                      {o.aeronave_codigo ? ` · ${o.aeronave_codigo}` : ""}
                      {o.expira_en ? <span style={{ color: "var(--c-ink-3)" }}> · vence {new Date(o.expira_en).toLocaleString("es-SV", { timeZone: "America/El_Salvador", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}</span> : ""}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => aceptarOferta(o.id_standby)} style={{ background: "var(--c-success-600, #16a34a)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", padding: "8px 16px", fontWeight: 700, cursor: "pointer" }}>
                        <i className="bi bi-check2 me-1"></i>Tomar el cupo
                      </button>
                      <button onClick={() => rechazarOferta(o.id_standby)} style={{ background: "transparent", color: "var(--c-ink-2)", border: "1px solid var(--c-line-1)", borderRadius: "var(--radius-sm)", padding: "8px 16px", fontWeight: 600, cursor: "pointer" }}>
                        No, gracias
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Tabs */}
            <div className="dash__tabs">
              <button
                className={`dash__tab${weekMode === "current" ? " dash__tab--active" : ""}`}
                onClick={() => setWeekMode("current")}
              >
                Semana actual
              </button>
              <button
                className={`dash__tab${weekMode === "next" ? " dash__tab--active" : ""}`}
                onClick={() => setWeekMode("next")}
              >
                Semana siguiente
              </button>
              <button
                className={`dash__tab${weekMode === "cancelaciones" ? " dash__tab--active" : ""}`}
                onClick={() => setWeekMode("cancelaciones")}
              >
                Mis cancelaciones
              </button>
              <button
                className={`dash__tab${weekMode === "clases" ? " dash__tab--active" : ""}`}
                onClick={() => setWeekMode("clases")}
              >
                Mis clases
              </button>
            </div>

            {/* Flight list / Solicitudes / Clases */}
            {weekMode === "clases" ? (
              <MisClasesList clases={misClases} loading={loadingClases} onRefresh={fetchClases} />
            ) : weekMode !== "cancelaciones" ? (
              <>
                <MiHorarioList
                  vuelos={vuelos}
                  weekMode={weekMode}
                  loading={loadingVuelos}
                  onRefresh={fetchVuelos}
                />
                {weekMode === "current" && clasesSemanaActual.length > 0 && (
                  <div style={{ marginTop: "18px" }}>
                    <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--c-ink-3)", marginBottom: "8px" }}>
                      <i className="bi bi-calendar-event" style={{ marginRight: 6 }} />
                      Clases de teoría de esta semana
                    </div>
                    <MisClasesList clases={clasesSemanaActual} loading={loadingClases} onRefresh={fetchClases} />
                  </div>
                )}
              </>
            ) : (
              <div className="mhl__list" style={{ marginTop: '20px' }}>
                {estadoCancel && (
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '14px', padding: '12px 14px', background: 'var(--c-surface-1)', border: '1px solid var(--c-line-1)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: 'var(--text-sm)' }}><strong>{estadoCancel.count_mes ?? 0}</strong> este mes</div>
                    <div style={{ fontSize: 'var(--text-sm)' }}><strong>{estadoCancel.racha_semanas ?? 0}</strong> semana(s) seguida(s)</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--c-ink-3)', width: '100%' }}>
                      Recordá: solo <strong>1 cancelación por semana</strong>. La 4ª del mes o la 4ª semana seguida generan multa de $35.
                      {(estadoCancel.count_mes >= 3 || estadoCancel.racha_semanas >= 3) && (
                        <span style={{ color: 'var(--c-warn-700)', fontWeight: 600 }}> Tu próxima cancelación podría tener multa.</span>
                      )}
                    </div>
                  </div>
                )}
                {loadingSolicitudes ? (
                  <div className="mhl__state"><span className="mhl__spinner"/><span>Cargando solicitudes...</span></div>
                ) : solicitudes.length === 0 ? (
                  <div className="mhl__state mhl__state--empty">No tienes solicitudes de cancelación de vuelo.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {solicitudes.map((s) => (
                      <div key={s.id_solicitud_cancelacion} style={{ background: 'var(--c-surface-1)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--c-line-1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <span style={{ fontWeight: 600 }}>Aeronave: {s.aeronave_codigo}</span>
                          <span className={`mhl__badge mhl__badge--${s.estado ? String(s.estado).toLowerCase() : 'pendiente'}`}>
                            {s.estado}
                          </span>
                        </div>
                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--c-ink-2)', marginBottom: '4px' }}>
                          Fecha Vuelo: {new Date(s.fecha_hora_vuelo).toLocaleString('es-SV', {timeZone: 'America/El_Salvador'})}
                        </div>
                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--c-ink-2)', marginBottom: '4px' }}>
                          Motivo: {s.motivo}
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--c-ink-3)' }}>
                          Solicitado el: {new Date(s.creado_en).toLocaleString('es-SV', {timeZone: 'America/El_Salvador'})}
                        </div>
                        {s.tiene_multa && (
                          <div style={{ marginTop: '8px', color: 'var(--c-danger-700)', fontWeight: 600, fontSize: 'var(--text-xs)' }}>
                            Con multa de ${s.monto_multa}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>

          {/* ── Sidebar ── */}
          <aside className="dash__sidebar">
            <MetarWidget />
          </aside>
        </div>

        {/* ── Programación de la semana (toda la escuela) ──
            Solo lectura: le sirve al alumno para ver qué horarios están libres
            o se liberaron antes de pedir un vuelo. Mismo componente y misma
            fuente que el dashboard del instructor y la Proyección. */}
        <div className="dash__schedule">
          <h3 className="dash__schedule-title">
            <i className="bi bi-calendar3"></i>
            Programación de la semana (toda la escuela)
          </h3>
          <p className="dash__schedule-hint">
            Consultá los espacios libres o los vuelos cancelados para pedir tus horas.
            Se actualiza solo cada 20 segundos.
          </p>
          <div className="pp">
            <ScheduleWeekTable vuelos={calendarioEscuela} diaHoy={diaHoyDb} />
          </div>
        </div>
      </div>
    </>
  );
}
