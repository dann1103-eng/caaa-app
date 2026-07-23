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

function trackUrl(codigo) {
  const reg = (codigo || "").replace(/-/g, "");
  return `https://globe.adsbexchange.com/?reg=${encodeURIComponent(reg)}&lat=${MSSS_LAT}&lon=${MSSS_LON}&zoom=${MSSS_ZOOM}&hideSideBar&hideButtons`;
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
              <span className="pt__tile-modelo">Búsqueda</span>
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
                    <span className="pt__tile-modelo">{a.modelo}</span>
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
