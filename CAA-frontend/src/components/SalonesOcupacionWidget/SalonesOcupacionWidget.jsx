import { useCallback, useEffect, useState } from "react";
import { getSalonesOcupacion } from "../../services/programacionApi";
import "../ProgWidgets/ProgWidgets.css";

export default function SalonesOcupacionWidget() {
  const [salones, setSalones] = useState([]);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const data = await getSalonesOcupacion();
      setSalones(Array.isArray(data) ? data : []);
    } catch {
      /* silencioso, igual que los demás widgets de Proyección */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 20000);
    return () => clearInterval(t);
  }, [cargar]);

  return (
    <div className="pw__widget">
      <div className="pw__widget-header">
        <span className="pw__widget-title">Salones de teoría</span>
        <span className="pw__widget-badge pw__widget-badge--gris">{salones.length}</span>
      </div>

      {loading ? (
        <p className="pw__empty">Cargando…</p>
      ) : (
        <div className="pw__cards">
          {salones.map((s) => (
            <div className="pw__card" key={s.id}>
              <div className="pw__card-row">
                <span className="pw__card-aeronave">{s.nombre}</span>
                {s.estado === "EN_SESION" && <span className="pw__tag pw__tag--rojo">EN SESIÓN</span>}
                {s.estado === "RESERVADO" && <span className="pw__tag pw__tag--naranja">Reservado</span>}
                {s.estado === "PROXIMA" && <span className="pw__tag pw__tag--azul">Próxima</span>}
                {s.estado === "LIBRE" && <span className="pw__tag pw__tag--verde">Libre</span>}
              </div>
              {s.estado === "EN_SESION" && (
                <div className="pw__card-sub">{s.instructor} · {s.curso}{s.unidad ? ` · ${s.unidad}` : ""}</div>
              )}
              {s.estado === "RESERVADO" && (
                <div className="pw__card-sub">{s.motivo}{s.descripcion ? ` — ${s.descripcion}` : ""}</div>
              )}
              {s.estado === "PROXIMA" && (
                <div className="pw__card-sub">{s.hora?.slice(0,5)} · {s.instructor} · {s.curso}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
