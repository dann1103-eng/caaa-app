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

// Devuelve estructura segura {icon, text} en vez de HTML crudo. Así el render usa
// elementos React (que escapan el texto) y evitamos XSS: el METAR viene de una API
// externa (aviationweather.gov) y no debe inyectarse como HTML sin sanitizar.
function formatMetarResumen(decoded) {
  if (!decoded) return null;
  const partes = [];
  if (decoded.viento)      partes.push({ icon: "bi-wind", text: decoded.viento.texto });
  if (decoded.visibilidad) partes.push({ icon: "bi-eye", text: decoded.visibilidad.texto });
  if (decoded.temperatura !== null) partes.push({ icon: "bi-thermometer-half", text: `${decoded.temperatura}°C` });
  if (decoded.qnh)         partes.push({ icon: "bi-arrow-down-circle", text: `${decoded.qnh.valor} ${decoded.qnh.unidad}` });
  return partes;
}

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

  const diaHoy = jsDayToDb(new Date().getDay());
  const [tabActivo,       setTabActivo]       = useState(diaHoy ?? 1);

  /* ── clock ── */
  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }));
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
            ? { ...v, estado, estado_desde: registrado_en, ...(aeronave_codigo ? { aeronave_codigo } : {}) }
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

  const vuelosEnCurso = useMemo(() =>
    vuelosConEstado.filter(v =>
      Number(v.dia_semana) === diaHoy &&
      ["SALIDA_HANGAR", "EN_VUELO", "EN_PROGRESO", "REGRESO_HANGAR", "FINALIZANDO"].includes(v.estado)
    ),
    [vuelosConEstado, diaHoy]
  );

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
  }, [vuelosConEstado, diaHoy]);

  const vuelosFiltrados = useMemo(() =>
    vuelosConEstado.filter(v => Number(v.dia_semana) === tabActivo),
    [vuelosConEstado, tabActivo]
  );

  return (
    <>
      <div className="pp">
        <div className="pp__topbar">
          <div className="pp__topbar-left">
            <span className="pp__topbar-label">METAR MSSS</span>
            <div className="pp__topbar-metar-list">
              {metar && metar.decoded ? (
                formatMetarResumen(metar.decoded).map((p, idx) => (
                  <span key={idx} className="pp__topbar-metar-item">
                    <i className={`bi ${p.icon}`}></i> {p.text}
                  </span>
                ))
              ) : metar ? <span className="pp__topbar-raw">{metar.raw}</span> : "Cargando…"}
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
                        <th>ESTADO</th>
                        <th>SALIDA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vuelosEnCurso.length === 0 ? (
                        <tr><td colSpan="4" className="pp__tbl-empty">Sin vuelos activos.</td></tr>
                      ) : (
                        vuelosEnCurso.map(v => {
                          const pct = calcProgreso(v);
                          const badge = ESTADO_VUELO_META[v.estado] || { label: v.estado, cls: "pp__tbl-badge--envuelo" };
                          return (
                            <tr key={v.id_vuelo}>
                              <td>
                                <div className="pp__tbl-person">{v.alumno_nombre}</div>
                                <div className="pp__tbl-sub">Cap. {v.instructor_nombre}</div>
                              </td>
                              <td><span className="pp__tbl-aero">{v.aeronave_codigo}</span></td>
                              <td>
                                <span className={`pp__tbl-badge ${badge.cls}`}>{badge.label}</span>
                                {pct !== null && (
                                  <div className="pp__tbl-bar-wrap"><div className="pp__tbl-bar" style={{ width: `${pct}%` }} /></div>
                                )}
                              </td>
                              <td className="pp__tbl-hora">{formatHora(v.hora_inicio)}</td>
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
                          <th>ESTADO</th>
                        </tr>
                      </thead>
                      <tbody>
                        {proximoBloque.vuelos.map(v => (
                          <tr key={v.id_vuelo}>
                            <td>
                              <div className="pp__tbl-person">{v.alumno_nombre}</div>
                              <div className="pp__tbl-sub">Cap. {v.instructor_nombre}</div>
                            </td>
                            <td><span className="pp__tbl-aero">{v.aeronave_codigo}</span></td>
                            <td>
                              <span className="pp__tbl-badge pp__tbl-badge--programado">
                                Programado
                              </span>
                            </td>
                          </tr>
                        ))}
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
                              <span className="pp__info-main">{v.aeronave_codigo} ({v.aeronave_modelo})</span>
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
