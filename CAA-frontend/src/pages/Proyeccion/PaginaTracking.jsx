import { useEffect, useState } from "react";
import { getAeronavesPublicas } from "../../services/programacionApi";
import "./PaginaProgramacion.css";
import "./PaginaTracking.css";

/* ADS-B Exchange / adsb.lol corren el mismo visor de código abierto (tar1090),
   que sí permite incrustarse en un iframe — a diferencia de FlightRadar24 y
   FlightAware, que lo bloquean explícitamente (X-Frame-Options: SAMEORIGIN).
   El parámetro reg= (documentado en tar1090/README-query.md) centra Y AÍSLA
   la aeronave por matrícula — así cada mosaico es "su cámara", sin tráfico
   ajeno de fondo. Si todavía no transmite ADS-B (equipo aún no instalado) el
   mosaico simplemente queda mostrando el mapa sin el ícono del avión — no es
   un error, es el estado esperado hasta que esa aeronave tenga el equipo activo.
   Para ese caso (sin señal) tar1090 cae a su vista por defecto, que sin lat/
   lon/zoom explícitos termina centrada donde sea que sirva el feeder de
   ADS-B Exchange más cercano (nos tocó Nueva York) — con MSSS (Ilopango) fijo
   acá, ese fallback muestra la base de la escuela en vez de otro continente. */
const MSSS_LAT = 13.6969;
const MSSS_LON = -89.1233;
const MSSS_ZOOM = 11;

// La matrícula real (la que ADS-B Exchange indexa) conserva el PRIMER guion
// (país-serie, ej. "YS-127P") pero no los siguientes — el código en BD a
// veces trae un guion extra antes del sufijo de una sola letra (ej.
// "YS-127-P" en vez de "YS-127P"), y buscando con ESE guion de más
// (o sin ningún guion) el visor no encuentra la aeronave. Quitar solo los
// guiones después del primero, no todos.
function normalizarMatricula(codigo) {
  const partes = (codigo || "").split("-");
  if (partes.length <= 1) return codigo || "";
  return `${partes[0]}-${partes.slice(1).join("")}`;
}

function trackUrl(codigo) {
  const reg = normalizarMatricula(codigo);
  return `https://globe.adsbexchange.com/?reg=${encodeURIComponent(reg)}&lat=${MSSS_LAT}&lon=${MSSS_LON}&zoom=${MSSS_ZOOM}&hideSideBar&hideButtons`;
}

/* FlightRadar24 bloquea iframes (X-Frame-Options), pero un popup con
   window.open sí funciona: en PC abre una ventana flotante ENCIMA de la
   proyección sin navegar la pestaña principal. El nombre de ventana por
   matrícula reutiliza el mismo popup si se vuelve a tocar el botón (no
   acumula ventanas). Esta función solo se ofrece en escritorio (el botón
   se oculta por CSS en móvil): en móvil/PWA un popup se abre como pestaña
   nueva y sí te saca de la app — ahí se queda solo el mosaico ADS-B. */
function abrirFR24(codigo) {
  const reg = normalizarMatricula(codigo).toLowerCase();
  window.open(
    `https://www.flightradar24.com/data/aircraft/${encodeURIComponent(reg)}`,
    `fr24_${reg}`,
    "width=1000,height=700,menubar=no,toolbar=no,location=yes,status=no"
  );
}

export default function PaginaTracking() {
  const [aeronaves, setAeronaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busquedaInput, setBusquedaInput] = useState("");
  // Matrícula/vuelo confirmado a rastrear — separado del input para no armar
  // el iframe en cada tecla (cada cambio de src recarga el mapa entero).
  const [busqueda, setBusqueda] = useState(null);

  useEffect(() => {
    getAeronavesPublicas()
      .then((data) => setAeronaves((data || []).filter((a) => a.tipo !== "SIMULADOR")))
      .catch(() => setAeronaves([]))
      .finally(() => setLoading(false));
  }, []);

  const handleBuscar = (e) => {
    e.preventDefault();
    const val = busquedaInput.trim();
    if (!val) return;
    setBusqueda(val);
  };

  const handleLimpiar = () => {
    setBusqueda(null);
    setBusquedaInput("");
  };

  return (
    <div className="pp pt">
      <div className="pp__topbar">
        <div className="pp__topbar-left">
          <span className="pp__topbar-label">FLIGHT TRACKING</span>
          <span className="pt__topbar-sub">ADS-B · Ilopango (MSSS)</span>
        </div>
        <div className="pp__topbar-right">
          <a className="pt__volver" href={`/proyeccion${window.location.search}`}>← Proyección</a>
        </div>
      </div>

      <main className="pt__container">
        {/* Búsqueda libre: cualquier matrícula, no solo la flota de la escuela
            (ej. un avión prestado, o tráfico de otra escuela). */}
        <form className="pt__buscar" onSubmit={handleBuscar}>
          <label className="pt__buscar-label" htmlFor="pt-buscar-input">
            <i className="bi bi-search"></i> Buscar otra matrícula
          </label>
          <div className="pt__buscar-row">
            <input
              id="pt-buscar-input"
              type="text"
              className="pt__buscar-input"
              placeholder="Ej. YS-127-P"
              value={busquedaInput}
              onChange={(e) => setBusquedaInput(e.target.value)}
            />
            <button type="submit" className="pt__buscar-btn">Buscar</button>
            {busqueda && (
              <button type="button" className="pt__buscar-clear" onClick={handleLimpiar}>
                Quitar
              </button>
            )}
          </div>
        </form>

        {busqueda && (
          <div className="pt__tile pt__tile--busqueda">
            <div className="pt__tile-head">
              <span className="pt__tile-codigo">{busqueda}</span>
              <span className="pt__tile-head-right">
                <span className="pt__tile-modelo">Búsqueda</span>
                <button
                  type="button"
                  className="pt__fr24-btn"
                  title="Abrir en FlightRadar24 (ventana flotante)"
                  onClick={() => abrirFR24(busqueda)}
                >
                  <i className="bi bi-box-arrow-up-right"></i> FR24
                </button>
              </span>
            </div>
            <div className="pt__tile-frame">
              <iframe
                title={`ADS-B — búsqueda ${busqueda}`}
                src={trackUrl(busqueda)}
                frameBorder="0"
                loading="lazy"
              />
            </div>
          </div>
        )}

        {loading ? (
          <p className="pt__empty">Cargando flota…</p>
        ) : aeronaves.length === 0 ? (
          <p className="pt__empty">No hay aeronaves activas para rastrear.</p>
        ) : (
          <>
            <div className="pt__section-title">Flota de la escuela</div>
            <div className="pt__grid">
              {aeronaves.map((a) => (
                <div key={a.id_aeronave} className="pt__tile">
                  <div className="pt__tile-head">
                    <span className="pt__tile-codigo">{a.codigo}</span>
                    <span className="pt__tile-head-right">
                      <span className="pt__tile-modelo">{a.modelo}</span>
                      <button
                        type="button"
                        className="pt__fr24-btn"
                        title="Abrir en FlightRadar24 (ventana flotante)"
                        onClick={() => abrirFR24(a.codigo)}
                      >
                        <i className="bi bi-box-arrow-up-right"></i> FR24
                      </button>
                    </span>
                  </div>
                  <div className="pt__tile-frame">
                    <iframe
                      title={`ADS-B — ${a.codigo}`}
                      src={trackUrl(a.codigo)}
                      frameBorder="0"
                      loading="lazy"
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
