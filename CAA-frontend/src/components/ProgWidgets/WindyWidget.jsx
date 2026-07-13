import "./ProgWidgets.css";

/* Aeropuerto de Ilopango (MSSS) */
const MSSS = { lat: 13.6979, lon: -89.1198 };

const EMBED_URL =
  "https://embed.windy.com/embed.html" +
  `?type=map&location=coordinates&lat=${MSSS.lat}&lon=${MSSS.lon}` +
  "&zoom=5&overlay=satellite&product=satellite&level=surface" +
  "&marker=true&detail=false&pressure=false&menu=false&calendar=now" +
  "&metricWind=kt&metricTemp=%C2%B0C";

export default function WindyWidget() {
  return (
    <div className="pw__widget pw__widget--windy">
      <div className="pw__widget-header">
        <span className="pw__widget-title">Satélite · Windy</span>
        <span className="pw__widget-badge pw__widget-badge--gris">MSSS</span>
      </div>
      <div className="pw__windy-map">
        <iframe
          title="Windy — satélite centrado en MSSS"
          src={EMBED_URL}
          frameBorder="0"
          loading="lazy"
        />
      </div>
    </div>
  );
}
