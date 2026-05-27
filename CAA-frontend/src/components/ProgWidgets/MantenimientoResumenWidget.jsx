import { useEffect, useState, useCallback } from "react";
import { getMantenimientoResumen } from "../../services/programacionApi";
import "./ProgWidgets.css";

export default function MantenimientoResumenWidget() {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const data = await getMantenimientoResumen();
      setItems(data);
    } catch {
      /* silencioso */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 5 * 60 * 1000); // refresca cada 5 min
    return () => clearInterval(t);
  }, [cargar]);

  return (
    <div className="pw__widget">
      <div className="pw__widget-header">
        <span className="pw__widget-title">Próximo mantenimiento</span>
        <span className="pw__widget-badge pw__widget-badge--naranja">top 3</span>
      </div>

      {loading ? (
        <p className="pw__empty">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="pw__empty">Sin revisiones próximas.</p>
      ) : (
        <div className="pw__cards">
          {items.map((a) => {
            const horas_restantes = parseFloat(a.horas_restantes ?? 0);
            // Ciclos fijos de 50 horas (0→50, 50→100).
            // pct = progreso dentro del ciclo actual de 50 hs.
            const pct = Math.min(100, Math.max(0, Math.round((50 - horas_restantes) / 50 * 100)));

            let barCls = "pw__bar--verde";
            if (horas_restantes <= 5)  barCls = "pw__bar--rojo";
            else if (horas_restantes <= 10) barCls = "pw__bar--naranja";

            let tagCls = "pw__tag--verde";
            if (horas_restantes <= 5)  tagCls = "pw__tag--rojo";
            else if (horas_restantes <= 10) tagCls = "pw__tag--naranja";

            const vencida = a.estado === "MANTENIMIENTO";
            const pronto = !vencida && horas_restantes <= 5;

            return (
              <div className="pw__card" key={a.id_aeronave}>
                <div className="pw__card-row">
                  <span className="pw__card-aeronave">{a.codigo}</span>
                  <div style={{ display: "flex", gap: "4px" }}>
                    {vencida && <span className="pw__tag pw__tag--rojo">¡Vencida!</span>}
                    {pronto && <span className="pw__tag pw__tag--naranja">Pronto</span>}
                    {!vencida && (
                      <span className={`pw__tag ${tagCls}`}>
                        {horas_restantes.toFixed(1)} hs
                      </span>
                    )}
                  </div>
                </div>
                <div className="pw__card-sub">
                  {a.tipo_proxima_revision} · {parseFloat(a.horas_acumuladas || 0).toFixed(1)} / {parseFloat(a.horas_proxima_revision || 0).toFixed(1)} hs
                </div>
                <div className="pw__bar-wrap">
                  <div className={`pw__bar ${barCls}`} style={{ width: `${pct}%` }} />
                  <span className="pw__bar-pct">{pct}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
