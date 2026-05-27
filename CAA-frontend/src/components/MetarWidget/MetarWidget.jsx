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

export default function MetarWidget() {
  const [data,    setData]    = useState(null);
  const [error,   setError]   = useState(false);
  const [loading, setLoading] = useState(true);

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
        <span className="mw__error-icon">⚠</span>
        METAR no disponible
        <button className="mw__retry" onClick={cargar}>Reintentar</button>
      </div>
    );
  }

  const d    = data.decoded;
  const cond = d?.condicion ? CONDICION_CFG[d.condicion] : null;

  return (
    <>
      {/* ══ Widget 1 — METAR Codificado ══ */}
      <div className="mw mw--raw">
        <div className="mw__header">
          <div>
            <h3 className="mw__title">{d?.estacion ?? "MSSS"} METAR</h3>
            <p className="mw__updated">Actualizado {minutosDesde(data.fetchedAt)}</p>
          </div>
          {cond && <span className={`mw__badge ${cond.cls}`}>{cond.label}</span>}
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
              <p className="mw__updated">{d?.estacion ?? "MSSS"} · {d.condicion}</p>
            </div>
            {cond && <i className={`bi ${cond.icon} mw__cond-icon`} />}
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
                <span className="mw__cell-label"><i className="bi bi-arrow-down-circle" /> QNH</span>
                <span className="mw__cell-value">{d.qnh.valor || d.qnh} {d.qnh.unidad || ""}</span>
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
