import { useEffect, useState, useCallback } from "react";
import { getMetar } from "../../services/metarApi";
import "./MetarWidget.css";

const POLL_MS = 20 * 60 * 1000;

const CONDICION_CFG = {
  VFR:  { label: "VFR",  cls: "mw__badge--vfr",  icon: "bi-sun"        },
  MVFR: { label: "MVFR", cls: "mw__badge--mvfr", icon: "bi-cloud-sun"  },
  IFR:  { label: "IFR",  cls: "mw__badge--ifr",  icon: "bi-cloud"      },
  LIFR: { label: "LIFR", cls: "mw__badge--lifr", icon: "bi-cloud-fog2" },
};

function minutosDesde(iso) {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1)   return "hace menos de 1 min";
  if (diff === 1) return "hace 1 min";
  return `hace ${diff} min`;
}

// El METAR se reemite ~cada hora; si el backend no logró renovarlo (MSSS sin
// reporte vigente) se sigue mostrando el último válido, marcado VENCIDO.
// 90 min = ciclo normal (60') + margen de una corrida del poller (20').
const VENCIDO_MIN = 90;
function esVencido(iso) {
  if (!iso) return false;
  return (Date.now() - new Date(iso).getTime()) / 60000 > VENCIDO_MIN;
}

/* Hora zulú de emisión desde el grupo ddhhmmZ del METAR crudo (ej. 131545Z → 15:45Z) */
function horaEmisionZ(raw) {
  const m = raw?.match(/\b\d{2}(\d{2})(\d{2})Z\b/);
  return m ? `${m[1]}:${m[2]}Z` : null;
}

/* En El Salvador el reglaje altimétrico se usa en pulgadas de mercurio (inHg).
   El backend entrega el QNH en hPa; convertimos (1 inHg = 33.8639 hPa). */
function hpaToInHg(hpa) {
  const n = Number(hpa);
  return Number.isFinite(n) ? (n / 33.8639).toFixed(2) : null;
}

export default function MetarWidget() {
  const [data,    setData]    = useState(null);
  const [error,   setError]   = useState(false);
  const [loading, setLoading] = useState(true);
  const [, setMinuto]         = useState(0); // re-render por minuto para refrescar "hace X min"

  useEffect(() => {
    const t = setInterval(() => setMinuto((m) => m + 1), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const cargar = useCallback(async () => {
    try {
      setData(await getMetar());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, POLL_MS);
    return () => clearInterval(t);
  }, [cargar]);

  if (loading) {
    return <div className="mw mw--loading"><span className="mw__spinner" /> Obteniendo METAR…</div>;
  }
  if (error || !data) {
    return (
      <div className="mw mw--error">
        <i className="bi bi-exclamation-triangle mw__error-icon" />
        METAR no disponible
        <button className="mw__retry" onClick={cargar}>Reintentar</button>
      </div>
    );
  }

  const d       = data.decoded;
  const cond    = d?.condicion ? CONDICION_CFG[d.condicion] : null;
  const emision = horaEmisionZ(data.raw);
  const vencido = esVencido(data.fetchedAt);

  return (
    <>
      {/* ══ Widget 1 — METAR Codificado ══ */}
      <div className="mw mw--raw">
        <div className="mw__header">
          <div>
            <h3 className="mw__title">{d?.estacion ?? "MSSS"} METAR</h3>
            <p className="mw__updated">Actualizado {minutosDesde(data.fetchedAt)}</p>
          </div>
          <div className="mw__badges">
            {vencido && <span className="mw__badge mw__badge--vencido" title="No se pudo renovar: se muestra el último METAR válido de MSSS">VENCIDO</span>}
            {cond && <span className={`mw__badge ${cond.cls}`}>{cond.label}</span>}
          </div>
        </div>
        <p className="mw__raw-label">METAR Codificado</p>
        <div className="mw__raw">{data.raw}</div>
      </div>

      {/* ══ Widget 2 — METAR Decodificado ══ */}
      {d && (
        <div className="mw mw--decoded">
          <div className="mw__header">
            <div>
              <h3 className="mw__title">METAR Decodificado</h3>
              <p className="mw__updated">
                {d?.estacion ?? "MSSS"} · {d.condicion}
                {emision && <> · Emitido {emision}</>}
              </p>
              <p className="mw__updated">Actualizado {minutosDesde(data.fetchedAt)}</p>
            </div>
            <div className="mw__badges">
              {vencido && <span className="mw__badge mw__badge--vencido" title="No se pudo renovar: se muestra el último METAR válido de MSSS">VENCIDO</span>}
              {cond && <i className={`bi ${cond.icon} mw__cond-icon`} />}
            </div>
          </div>
          <div className="mw__grid">
            {d.viento && (
              <div className="mw__cell">
                <span className="mw__cell-label"><i className="bi bi-wind" /> Viento</span>
                <span className="mw__cell-value">{d.viento.texto || d.viento}</span>
              </div>
            )}
            {d.visibilidad && (
              <div className="mw__cell">
                <span className="mw__cell-label"><i className="bi bi-eye" /> Visibilidad</span>
                <span className="mw__cell-value">{d.visibilidad.texto || d.visibilidad}</span>
              </div>
            )}
            {d.temperatura !== null && d.temperatura !== undefined && (
              <div className="mw__cell">
                <span className="mw__cell-label"><i className="bi bi-thermometer-half" /> Temp / Rocío</span>
                <span className="mw__cell-value">{d.temperatura}°C / {d.punto_rocio}°C</span>
              </div>
            )}
            {d.qnh && (
              <div className="mw__cell">
                <span className="mw__cell-label"><i className="bi bi-arrow-down-circle" /> Altímetro</span>
                <span className="mw__cell-value">{hpaToInHg(d.qnh.valor ?? d.qnh)} inHg</span>
              </div>
            )}
          </div>
          {d.nubes?.length > 0 && (
            <div className="mw__nubes">
              <span className="mw__cell-label"><i className="bi bi-cloud" /> Nubes</span>
              <div className="mw__nubes-list">
                {d.nubes.map((n, i) => (
                  <span key={i} className="mw__nube-tag">{n.texto}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
