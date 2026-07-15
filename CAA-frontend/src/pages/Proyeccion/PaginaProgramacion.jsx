import { useEffect, useState, useMemo, useCallback } from "react";
import { io as socketIO } from "socket.io-client";
import {
  getCalendarioPublico,
  getAeronavesPublicas,
  getBloquesPublicos,
} from "../../services/programacionApi";
import { getMetar } from "../../services/metarApi";
import Header from "../../components/Header/Header";
import Footer from "../../components/Footer/Footer";
import MetarWidget from "../../components/MetarWidget/MetarWidget";
import EstadoFlotaWidget from "../../components/ProgWidgets/EstadoFlotaWidget";
import MantenimientoResumenWidget from "../../components/ProgWidgets/MantenimientoResumenWidget";
import WindyWidget from "../../components/ProgWidgets/WindyWidget";
import TickerBar from "../../components/TickerBar/TickerBar";
import OperacionesWidget from "../../components/OperacionesWidget/OperacionesWidget";
import { SOCKET_URL } from "../../api/axiosConfig";
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

const formatHora = (h) => h?.slice(0, 5) ?? "—";

// Hora real de "salida de hangar" (timestamp del botón, no el bloque programado).
const formatHoraReal = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit", hour12: false }) : null;

// Devuelve el estado real de la BD. La proyección NO sobreescribe con el reloj:
// solo el instructor/turno puede avanzar el estado manualmente.
function getEstadoDinamico(v) {
  return v.estado || "PROGRAMADO";
}

function calcProgreso(v) {
  const { estado } = v;
  if (!estado || estado === "PUBLICADO" || estado === "PROGRAMADO") return null;
  if (estado === "SALIDA_HANGAR") return 5;
  if (estado === "EN_VUELO" || estado === "EN_PROGRESO") return 50;
  if (estado === "REGRESO_HANGAR" || estado === "FINALIZANDO") return 100;
  return null;
}

const ESTADO_VUELO_META = {
  SALIDA_HANGAR:  { label: "SALIDA HANGAR",  cls: "pp__tbl-badge--hangar"   },
  EN_VUELO:       { label: "EN PROGRESO",        cls: "pp__tbl-badge--envuelo"  },
  EN_PROGRESO:    { label: "EN PROGRESO",        cls: "pp__tbl-badge--envuelo"  },
  REGRESO_HANGAR: { label: "REGRESO HANGAR",  cls: "pp__tbl-badge--regreso"  },
  FINALIZANDO:    { label: "FINALIZANDO",     cls: "pp__tbl-badge--finaliz"  },
  // Vuelo del bloque vigente que el instructor aún no marca como salida del hangar
  PROGRAMADO:     { label: "STANDBY",         cls: "pp__tbl-badge--programado" },
  PUBLICADO:      { label: "STANDBY",         cls: "pp__tbl-badge--programado" },
};

const ESTADOS_VUELO_ACTIVO = ["SALIDA_HANGAR", "EN_VUELO", "EN_PROGRESO", "REGRESO_HANGAR", "FINALIZANDO"];

// Tipo de vuelo (elegido al agendar en Programación) — describe qué se va a
// volar, más allá de a quién/qué avión. Ortogonal a RUTA (tipo_vuelo).
const CATEGORIA_META = {
  NORMAL:        { label: "Normal",         cls: "pp__tipo--normal" },
  DEMO:          { label: "Demo",           cls: "pp__tipo--demo" },
  CHEQUEO:       { label: "Chequeo",        cls: "pp__tipo--chequeo" },
  CHEQUEO_LINEA: { label: "Chequeo línea",  cls: "pp__tipo--linea" },
};
function categoriaMeta(v) {
  const meta = CATEGORIA_META[v?.categoria] || CATEGORIA_META.NORMAL;
  if (v?.categoria === "CHEQUEO_LINEA" && v?.tipo_instruccion === "REFRESH") {
    return { ...meta, label: "Refresh" };
  }
  return meta;
}

const horaAMin = (h) => {
  const [hh, mm] = String(h ?? "").split(":").map(Number);
  return (hh || 0) * 60 + (mm || 0);
};

/* Código de color por aeronave, réplica del Excel de programación. Se empareja por
   el número de matrícula (334/333/270/127) para que no importe el sufijo P/PE. */
const AERONAVE_COLOR = [
  { num: "334", color: "#f87171" }, // YS-334-PE — rojo
  { num: "333", color: "#60a5fa" }, // YS-333-PE — azul
  { num: "270", color: "#4ade80" }, // YS-270-P  — verde
  { num: "127", color: "#38bdf8" }, // YS-127-P  — celeste
];

function colorAeronave(codigo) {
  if (!codigo) return undefined;
  const m = AERONAVE_COLOR.find(a => codigo.includes(a.num));
  return m ? m.color : undefined;
}

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
                // Hora real de "salida de hangar": se fija una sola vez (no se
                // pisa en transiciones posteriores del mismo vuelo).
                ...(estado === "SALIDA_HANGAR" ? { salida_real: registrado_en } : {}),
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

    return () => socket.disconnect();
  }, [cargarDatos]);

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
            </div>
          </div>
          <div className="pp__topbar-right">
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
                <span className="pp__clock-time">{clock}</span>
                <span className="pp__clock-date">{new Date().toLocaleDateString('es-SV', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                <span className="pp__clock-utc">{clockUTC} <b>UTC</b></span>
              </div>
              <OperacionesWidget />
            </div>
          </div>

          <div className="pp__dashboard-grid">
            <div className="pp__main-col">
              {/* Vuelos en Curso */}
              <div className="pp__card" style={{ flex: '0 0 auto' }}>
                <div className="pp__card-head">
                  <h2 className="pp__card-title"><i className="bi bi-broadcast-pin" /> Vuelos en Curso</h2>
                  <span className="pp__card-badge">Activo</span>
                </div>
                <div className="pp__tbl-wrap">
                  <table className="pp__table">
                    <thead>
                      <tr>
                        <th>ESTUDIANTE / INSTRUCTOR</th>
                        <th>AERONAVE</th>
                        <th>TIPO</th>
                        <th>ESTADO</th>
                        <th>SALIDA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vuelosEnCurso.length === 0 ? (
                        <tr><td colSpan="5" className="pp__tbl-empty">Sin vuelos activos.</td></tr>
                      ) : (
                        vuelosEnCurso.map(v => {
                          const pct = calcProgreso(v);
                          const badge = ESTADO_VUELO_META[v.estado] || { label: v.estado, cls: "pp__tbl-badge--envuelo" };
                          const tipo = categoriaMeta(v);
                          return (
                            <tr key={v.id_vuelo}>
                              <td>
                                <div className="pp__tbl-person">{v.alumno_nombre}</div>
                                <div className="pp__tbl-sub">Cap. {v.instructor_nombre}</div>
                              </td>
                              <td><span className="pp__tbl-aero">{v.aeronave_codigo}</span></td>
                              <td>
                                <span className={`pp__tipo-badge ${tipo.cls}`}>{tipo.label}</span>
                                {v.tipo_vuelo === "RUTA" && <span className="pp__tipo-badge pp__tipo--ruta">Ruta</span>}
                              </td>
                              <td>
                                <span className={`pp__tbl-badge ${badge.cls}`}>{badge.label}</span>
                                {pct !== null && (
                                  <div className="pp__tbl-bar-wrap"><div className="pp__tbl-bar" style={{ width: `${pct}%` }} /></div>
                                )}
                              </td>
                              <td className="pp__tbl-hora">{formatHoraReal(v.salida_real) ?? formatHora(v.hora_inicio)}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
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
                            <td><span className="pp__tbl-aero">{v.aeronave_codigo}</span></td>
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
                              <span className="pp__info-main">Cap. {v.instructor_nombre}</span>
                            </div>
                            <div className="pp__info-group">
                              <span className="pp__info-label">AERONAVE</span>
                              <span className="pp__info-main" style={{ color: colorAeronave(v.aeronave_codigo) }}>
                                {v.aeronave_codigo} ({v.aeronave_modelo})
                              </span>
                            </div>
                            <div className="pp__info-group">
                              <span className="pp__info-label">TIPO</span>
                              <span className="pp__info-main">
                                <span className={`pp__tipo-badge ${tipo.cls}`}>{tipo.label}</span>
                                {v.tipo_vuelo === "RUTA" && <span className="pp__tipo-badge pp__tipo--ruta">Ruta</span>}
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
                          <div className="pp__prox-hora">{formatHora(v.hora_inicio)} · <strong>{v.aeronave_codigo}</strong></div>
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
