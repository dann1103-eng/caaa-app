import { useEffect, useState, useMemo, useCallback } from "react";
import { io as socketIO } from "socket.io-client";
import {
  getCalendarioPublico,
  getAeronavesPublicas,
  getBloquesPublicos,
} from "../../services/programacionApi";
import { getMetar } from "../../services/metarApi";
import { getTurnoDia } from "../../services/turnoApi";
import Header from "../../components/Header/Header";
import Footer from "../../components/Footer/Footer";
import MetarWidget from "../../components/MetarWidget/MetarWidget";
import EstadoFlotaWidget from "../../components/ProgWidgets/EstadoFlotaWidget";
import MantenimientoResumenWidget from "../../components/ProgWidgets/MantenimientoResumenWidget";
import WindyWidget from "../../components/ProgWidgets/WindyWidget";
import TickerBar from "../../components/TickerBar/TickerBar";
import OperacionesWidget from "../../components/OperacionesWidget/OperacionesWidget";
import VuelosEnCursoTable from "../../components/VuelosEnCursoTable/VuelosEnCursoTable";
import { SOCKET_URL } from "../../api/axiosConfig";
import {
  categoriaMeta, aeroBadgeStyle, colorAeronave, formatHora,
} from "../../utils/vueloVisual";
import "./PaginaProgramacion.css";

/* ── helpers ──────────────────────────────────────────────────────────────── */
function jsDayToDb(jsDay) {
  if (jsDay === 0) return null;
  return jsDay;
}

const DIAS = [
  { db: 1, label: "LUNES",     short: "LUN" },
  { db: 2, label: "MARTES",    short: "MAR" },
  { db: 3, label: "MIÉRCOLES", short: "MIÉ" },
  { db: 4, label: "JUEVES",    short: "JUE" },
  { db: 5, label: "VIERNES",   short: "VIE" },
  { db: 6, label: "SÁBADO",    short: "SÁB" },
];

const ESTADO_META = {
  PROGRAMADO: { label: "Programado", cls: "pp__badge--programado" },
  EN_VUELO:   { label: "En progreso",   cls: "pp__badge--envuelo"   },
  COMPLETADO: { label: "Completado", cls: "pp__badge--completado" },
  CANCELADO:  { label: "Cancelado",  cls: "pp__badge--cancelado"  },
};

// Devuelve el estado real de la BD. La proyección NO sobreescribe con el reloj:
// solo el instructor/turno puede avanzar el estado manualmente.
function getEstadoDinamico(v) {
  return v.estado || "PROGRAMADO";
}

const ESTADOS_VUELO_ACTIVO = ["SALIDA_HANGAR", "EN_VUELO", "EN_PROGRESO", "REGRESO_HANGAR", "FINALIZANDO"];

const horaAMin = (h) => {
  const [hh, mm] = String(h ?? "").split(":").map(Number);
  return (hh || 0) * 60 + (mm || 0);
};

/* ── component ────────────────────────────────────────────────────────────── */
export default function PaginaProgramacion() {
  const modoProyeccion = new URLSearchParams(window.location.search).get("modo") === "proyeccion";
  const [vuelos,      setVuelos]      = useState([]);
  const [aeronavesDb, setAeronavesDb] = useState([]);
  const [bloquesDb,   setBloquesDb]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(false);

  const [metar,       setMetar]       = useState(null);
  const [clock,       setClock]       = useState("");
  const [clockUTC,    setClockUTC]    = useState("");
  const [turnoDia,    setTurnoDia]    = useState(null);

  const diaHoy = jsDayToDb(new Date().getDay());
  const [tabActivo,       setTabActivo]       = useState(diaHoy ?? 1);

  /* ── clock ── (local + UTC/Zulu, muy usado en aviación) */
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClock(d.toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }));
      setClockUTC(d.toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "UTC" }));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  /* ── metar ── */
  const cargarMetar = useCallback(async () => {
    try { setMetar(await getMetar()); } catch { /* silencioso */ }
  }, []);
  useEffect(() => {
    cargarMetar();
    const t = setInterval(cargarMetar, 20 * 60 * 1000);
    return () => clearInterval(t);
  }, [cargarMetar]);

  /* ── turno del día (apertura/pausa/cierre + instructores en turno) ── */
  const cargarTurnoDia = useCallback(async () => {
    try { setTurnoDia(await getTurnoDia()); } catch { /* silencioso */ }
  }, []);
  useEffect(() => {
    cargarTurnoDia();
    const t = setInterval(cargarTurnoDia, 60000);
    return () => clearInterval(t);
  }, [cargarTurnoDia]);

  /* ── data ── */
  const cargarDatos = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [vData, aData, bData] = await Promise.all([
        getCalendarioPublico(),
        getAeronavesPublicas(),
        getBloquesPublicos(),
      ]);
      setVuelos(Array.isArray(vData) ? vData : []);
      setAeronavesDb(Array.isArray(aData) ? aData : []);
      setBloquesDb(Array.isArray(bData) ? bData : []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarDatos();
    // Refresco periódico: red de seguridad para el tablero de pared. Aunque el
    // socket en tiempo real falle (p.ej. websocket tras el proxy), la proyección
    // refleja los cambios (vuelos agendados / estados) en a lo sumo 20s.
    const t = setInterval(cargarDatos, 20000);
    return () => clearInterval(t);
  }, [cargarDatos]);

  /* ── socket ── */
  useEffect(() => {
    const socket = socketIO(SOCKET_URL, {
      // polling primero (más confiable tras proxies como Railway), luego sube a websocket
      transports: ["polling", "websocket"],
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
    });

    socket.on("vuelo_estado_changed", (data) => {
      const { id_vuelo, estado, registrado_en, aeronave_codigo } = data;
      setVuelos((prev) =>
        prev.map((v) =>
          v.id_vuelo === id_vuelo
            ? {
                ...v, estado, estado_desde: registrado_en,
                // Horas reales de "salida de hangar" y "regreso a hangar": se
                // fijan una sola vez (no se pisan en transiciones posteriores).
                ...(estado === "SALIDA_HANGAR" ? { salida_real: registrado_en } : {}),
                ...(estado === "REGRESO_HANGAR" ? { llegada_real: registrado_en } : {}),
                ...(aeronave_codigo ? { aeronave_codigo } : {}),
              }
            : v
        )
      );
    });

    socket.on("vuelo_cancelado", ({ id_vuelo }) => {
      setVuelos((prev) =>
        prev.map((v) => v.id_vuelo === id_vuelo ? { ...v, estado: "CANCELADO" } : v)
      );
    });

    socket.on("bloque_iniciado", cargarDatos);
    socket.on("turno_dia_changed", cargarTurnoDia);

    return () => socket.disconnect();
  }, [cargarDatos, cargarTurnoDia]);

  /* ── derived ── */
  const vuelosConEstado = useMemo(() =>
    vuelos.map(v => ({ ...v, estadoDinamico: getEstadoDinamico(v) })),
    [vuelos]
  );

  // Minuto actual como dependencia: los memos de tiempo se recalculan al cambiar
  // el minuto (el reloj ya re-renderiza cada segundo), no solo al llegar datos.
  const minutoActual = clock.slice(0, 5);

  const vuelosEnCurso = useMemo(() => {
    const d = new Date();
    const ahoraMin = d.getHours() * 60 + d.getMinutes();
    return vuelosConEstado
      .filter(v => {
        if (Number(v.dia_semana) !== diaHoy) return false;
        if (ESTADOS_VUELO_ACTIVO.includes(v.estado)) return true;
        // Bloque vigente sin marcar por el instructor: se muestra en STANDBY
        // para que el vuelo no desaparezca del tablero entre la hora programada
        // y la salida real del hangar.
        return (
          ["PROGRAMADO", "PUBLICADO"].includes(v.estado) &&
          horaAMin(v.hora_inicio) <= ahoraMin &&
          ahoraMin < horaAMin(v.hora_fin)
        );
      })
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vuelosConEstado, diaHoy, minutoActual]);

  const proximosVuelos = useMemo(() =>
    vuelosConEstado
      .filter(v => Number(v.dia_semana) === diaHoy && ["PROGRAMADO","PUBLICADO"].includes(v.estado))
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))
      .slice(0, 5),
    [vuelosConEstado, diaHoy]
  );

  // Widget "Próximo Bloque": bloque más cercano que aún no ha iniciado
  const proximoBloque = useMemo(() => {
    const ahoraMin = new Date().getHours() * 60 + new Date().getMinutes();
    const vuelosHoy = vuelosConEstado.filter(v =>
      Number(v.dia_semana) === diaHoy && v.estado !== "CANCELADO"
    );
    const bloquesHoy = [...new Map(
      vuelosHoy.map(v => [v.id_bloque, { id_bloque: v.id_bloque, hora_inicio: v.hora_inicio, hora_fin: v.hora_fin }])
    ).values()].sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));

    const siguiente = bloquesHoy.find(b => {
      const [h, m] = b.hora_inicio.split(":").map(Number);
      return h * 60 + m > ahoraMin;
    });
    if (!siguiente) return null;
    return {
      bloque: siguiente,
      vuelos: vuelosHoy.filter(v => v.id_bloque === siguiente.id_bloque),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vuelosConEstado, diaHoy, minutoActual]);

  const vuelosFiltrados = useMemo(() =>
    vuelosConEstado.filter(v => Number(v.dia_semana) === tabActivo),
    [vuelosConEstado, tabActivo]
  );

  return (
    <>
      <div className="pp">
        <div className="pp__topbar">
          <div className="pp__topbar-left">
            <span className="pp__topbar-label">METAR</span>
            <div className="pp__topbar-metar-list">
              {/* METAR codificado (crudo). El decodificado ya está en el widget del sidebar.
                  Se recorta el prefijo METAR/SPECI que a veces trae el crudo para no
                  duplicar la etiqueta de la izquierda. */}
              {metar ? <span className="pp__topbar-raw">{metar.raw.replace(/^(METAR|SPECI)\s+/, "")}</span> : "Cargando…"}
              {metar?.decoded?.condicion && (
                <span className={`pp__topbar-badge pp__topbar-badge--${String(metar.decoded.condicion).toLowerCase()}`}>
                  {metar.decoded.condicion}
                </span>
              )}
              {/* MSSS sin reporte vigente: se muestra el último METAR válido, marcado. */}
              {metar?.fetchedAt && (Date.now() - new Date(metar.fetchedAt).getTime()) / 60000 > 90 && (
                <span className="pp__topbar-badge pp__topbar-badge--vencido" title="No se pudo renovar: último METAR válido de MSSS">VENCIDO</span>
              )}
            </div>
          </div>
          <div className="pp__topbar-right">
            <a className="pp__topbar-tracking-link" href={`/proyeccion/tracking${window.location.search}`}>
              <i className="bi bi-broadcast" /> Flight Tracking
            </a>
            <span className="pp__topbar-clock">{clock} CST</span>
          </div>
        </div>

        <main className="pp__container">
          <div className="pp__page-hdr">
            <div>
              <p className="pp__eyebrow">Aeropuerto de Ilopango · El Salvador</p>
              <h1 className="pp__page-title">
                Programación de <span className="pp__accent">vuelos</span>
              </h1>
            </div>
            <div className="pp__hdr-right">
              <div className="pp__hdr-clock-new">
                <span className="pp__clock-utc">{clockUTC} <b>UTC</b></span>
                <span className="pp__clock-time">{clock} <b>LOCAL</b></span>
                <span className="pp__clock-date">{new Date().toLocaleDateString('es-SV', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
              </div>
              <OperacionesWidget />
            </div>
          </div>

          {/* ── Turno del día: estado + instructores en turno ── */}
          {turnoDia?.dia && (() => {
            const est = turnoDia.dia.estado;
            const presentes = (turnoDia.asistencias || []).filter((a) => !a.salida_en);
            const meta = {
              ABIERTO:  { label: "TURNO ABIERTO",              cls: "pp__turno--abierto",  icon: "bi-sunrise" },
              EN_PAUSA: { label: "TURNO EN PAUSA · ALMUERZO",  cls: "pp__turno--pausa",    icon: "bi-cup-hot" },
              CERRADO:  { label: "TURNO CERRADO",              cls: "pp__turno--cerrado",  icon: "bi-sunset" },
            }[est];
            if (!meta) return null;
            return (
              <div className={`pp__turno-strip ${meta.cls}`}>
                <span className="pp__turno-estado"><i className={`bi ${meta.icon}`} /> {meta.label}</span>
                {presentes.length > 0 && (
                  <span className="pp__turno-instructores">
                    {presentes.map((a) => (
                      <span key={a.id_asistencia} className="pp__turno-chip">
                        <i className="bi bi-person-badge" /> Cap. {a.nombre_completo}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            );
          })()}

          <div className="pp__dashboard-grid">
            <div className="pp__main-col">
              {/* Vuelos en Curso */}
              <div className="pp__card" style={{ flex: '0 0 auto' }}>
                <div className="pp__card-head">
                  <h2 className="pp__card-title"><i className="bi bi-broadcast-pin" /> Vuelos en Curso</h2>
                  <span className="pp__card-badge">Activo</span>
                </div>
                <VuelosEnCursoTable vuelos={vuelosEnCurso} emptyLabel="Sin vuelos activos." />
              </div>

              {/* Próximo Bloque */}
              {proximoBloque && (
                <div className="pp__card" style={{ flex: '0 0 auto' }}>
                  <div className="pp__card-head">
                    <h2 className="pp__card-title"><i className="bi bi-clock-history" /> Próximo Bloque</h2>
                    <span className="pp__card-badge" style={{ background: 'var(--c-warn-100)', color: 'var(--c-warn-700)' }}>
                      {formatHora(proximoBloque.bloque.hora_inicio)} – {formatHora(proximoBloque.bloque.hora_fin)}
                    </span>
                  </div>
                  <div className="pp__tbl-wrap">
                    <table className="pp__table">
                      <thead>
                        <tr>
                          <th>ESTUDIANTE / INSTRUCTOR</th>
                          <th>AERONAVE</th>
                          <th>TIPO</th>
                          <th>ESTADO</th>
                        </tr>
                      </thead>
                      <tbody>
                        {proximoBloque.vuelos.map(v => {
                          const tipo = categoriaMeta(v);
                          return (
                          <tr key={v.id_vuelo}>
                            <td>
                              <div className="pp__tbl-person">{v.alumno_nombre}</div>
                              <div className="pp__tbl-sub">Cap. {v.instructor_nombre}</div>
                            </td>
                            <td><span className="pp__tbl-aero" style={aeroBadgeStyle(v.aeronave_codigo)}>{v.aeronave_codigo}</span></td>
                            <td>
                              <span className={`pp__tipo-badge ${tipo.cls}`}>{tipo.label}</span>
                              {v.tipo_vuelo === "RUTA" && <span className="pp__tipo-badge pp__tipo--ruta">Ruta</span>}
                            </td>
                            <td>
                              <span className="pp__tbl-badge pp__tbl-badge--programado">
                                Programado
                              </span>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Schedule */}
              <div className="pp__card pp__schedule-card">
                <div className="pp__day-tabs">
                  {DIAS.map(dia => (
                    <button
                      key={dia.db}
                      className={`pp__day-tab ${tabActivo === dia.db ? "pp__day-tab--active" : ""} ${diaHoy === dia.db ? "pp__day-tab--hoy" : ""}`}
                      onClick={() => setTabActivo(dia.db)}
                    >
                      {dia.label}
                    </button>
                  ))}
                </div>
                <div className="pp__flights-list">
                  {vuelosFiltrados.length === 0 ? (
                    <div className="pp__empty-state">No hay vuelos programados para este día.</div>
                  ) : (
                    vuelosFiltrados.map(v => {
                      const meta = ESTADO_META[v.estadoDinamico] || { label: v.estadoDinamico, cls: "" };
                      const tipo = categoriaMeta(v);
                      return (
                        <div key={v.id_vuelo} className="pp__flight-card">
                          <div className="pp__flight-time">
                            <span className="pp__time-val">{formatHora(v.hora_inicio)}</span>
                          </div>
                          <div className="pp__flight-info">
                            <div className="pp__info-group">
                              <span className="pp__info-label">ESTUDIANTE</span>
                              <span className="pp__info-main">{v.alumno_nombre}</span>
                            </div>
                            <div className="pp__info-group">
                              <span className="pp__info-label">INSTRUCTOR</span>
                              <span className="pp__info-main">
                                Cap. {v.instructor_nombre}{" "}
                                <span className={`pp__tipo-badge ${tipo.cls}`}>{tipo.label}</span>
                                {v.tipo_vuelo === "RUTA" && <span className="pp__tipo-badge pp__tipo--ruta">Ruta</span>}
                              </span>
                            </div>
                            <div className="pp__info-group">
                              <span className="pp__info-label">AERONAVE</span>
                              <span className="pp__info-main" style={{ color: colorAeronave(v.aeronave_codigo) }}>
                                {v.aeronave_codigo} ({v.aeronave_modelo})
                              </span>
                            </div>
                          </div>
                          <div className="pp__flight-status">
                            <span className={`pp__status-badge ${meta.cls}`}>
                              <span className="pp__status-dot" /> {meta.label}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <aside className="pp__sidebar">
              <MetarWidget />
              <WindyWidget />
              <EstadoFlotaWidget />
              <div className="pp__sb-card">
                <div className="pp__sb-head">
                  <h3 className="pp__sb-title"><i className="bi bi-airplane" /> Próximos Vuelos</h3>
                  <span className="pp__card-badge">Hoy</span>
                </div>
                {proximosVuelos.length === 0 ? (
                  <p className="pp__sb-empty" style={{ padding: '20px 0', textAlign: 'center', opacity: 0.5 }}>Sin vuelos próximos.</p>
                ) : (
                  <div className="pp__prox-list">
                    {proximosVuelos.map((v, i) => (
                      <div key={v.id_vuelo} className="pp__prox-item">
                        <span className={`pp__prox-dot ${i === 0 ? "pp__prox-dot--active" : ""}`} />
                        <div className="pp__prox-info">
                          <div className="pp__prox-hora">{formatHora(v.hora_inicio)} · <strong style={{ color: colorAeronave(v.aeronave_codigo) }}>{v.aeronave_codigo}</strong></div>
                          <div className="pp__prox-sub">{v.alumno_nombre}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <MantenimientoResumenWidget />
            </aside>
          </div>
        </main>
        <TickerBar />
      </div>
    </>
  );
}
