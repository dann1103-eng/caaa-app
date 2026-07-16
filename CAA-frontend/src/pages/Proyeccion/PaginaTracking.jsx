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
   un error, es el estado esperado hasta que esa aeronave tenga el equipo activo. */
function trackUrl(codigo) {
  const reg = (codigo || "").replace(/-/g, "");
  return `https://globe.adsbexchange.com/?reg=${encodeURIComponent(reg)}&hideSideBar&hideButtons`;
}

export default function PaginaTracking() {
  const [aeronaves, setAeronaves] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAeronavesPublicas()
      .then((data) => setAeronaves((data || []).filter((a) => a.tipo !== "SIMULADOR")))
      .catch(() => setAeronaves([]))
      .finally(() => setLoading(false));
  }, []);

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
        {loading ? (
          <p className="pt__empty">Cargando flota…</p>
        ) : aeronaves.length === 0 ? (
          <p className="pt__empty">No hay aeronaves activas para rastrear.</p>
        ) : (
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
        )}
      </main>
    </div>
  );
}
