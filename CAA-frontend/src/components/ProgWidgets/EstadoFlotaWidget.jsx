import { useEffect, useState, useCallback } from "react";
import { io as socketIO } from "socket.io-client";
import { getEstadoFlota } from "../../services/programacionApi";
import { SOCKET_URL } from "../../api/axiosConfig";
import "./ProgWidgets.css";

const ESTADO_LABEL = {
  VOLANDO:      "En vuelo",
  MANTENIMIENTO: "Mantenimiento",
  EN_TIERRA:    "En tierra",
};

const ESTADO_CLS = {
  VOLANDO:      "pw__tag--azul",
  MANTENIMIENTO: "pw__tag--rojo",
  EN_TIERRA:    "pw__tag--gris",
};

export default function EstadoFlotaWidget() {
  const [flota, setFlota]     = useState([]);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const data = await getEstadoFlota();
      setFlota(data);
    } catch {
      /* silencioso */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    // Red de seguridad: si la carga inicial falla por un hipo de red (el
    // catch es silencioso), sin esto quedaba "vacío" hasta el próximo evento
    // de socket — que puede tardar mucho o no llegar nunca.
    const t = setInterval(cargar, 60000);
    return () => clearInterval(t);
  }, [cargar]);

  useEffect(() => {
    const socket = socketIO(SOCKET_URL, { transports: ["websocket", "polling"], reconnectionDelay: 1000, reconnectionAttempts: 5 });
    socket.on("vuelo_estado_changed", () => cargar());
    return () => socket.disconnect();
  }, [cargar]);

  const volando      = flota.filter((a) => a.estado_actual === "VOLANDO").length;
  const mantenimiento = flota.filter((a) => a.estado_actual === "MANTENIMIENTO").length;
  const tierra       = flota.filter((a) => a.estado_actual === "EN_TIERRA").length;

  return (
    <div className="pw__widget">
      <div className="pw__widget-header">
        <span className="pw__widget-title">Estado de la flota</span>
        <span className="pw__widget-badge pw__widget-badge--gris">{flota.length} aeronaves</span>
      </div>

      <div className="pw__flota-resumen">
        <span className="pw__flota-stat pw__flota-stat--azul">{volando} volando</span>
        <span className="pw__flota-stat pw__flota-stat--rojo">{mantenimiento} mant.</span>
        <span className="pw__flota-stat pw__flota-stat--gris">{tierra} en tierra</span>
      </div>

      {loading ? (
        <p className="pw__empty">Cargando…</p>
      ) : flota.length === 0 ? (
        <p className="pw__empty">Sin aeronaves registradas.</p>
      ) : (
        <div className="pw__cards">
          {flota.map((a) => {
            const cls = ESTADO_CLS[a.estado_actual] ?? "pw__tag--gris";
            const horas = parseFloat(a.horas_acumuladas || 0);
            const proxima = parseFloat(a.horas_proxima_revision || 50);
            const proxima5 = a.estado !== "MANTENIMIENTO" && horas >= proxima - 5;
            const restantes = proxima - horas;
            let restantesCls = "pw__restantes--verde";
            if (restantes <= 5) restantesCls = "pw__restantes--rojo";
            else if (restantes <= 20) restantesCls = "pw__restantes--amarillo";
            return (
              <div className="pw__card pw__card--flota" key={a.id_aeronave}>
                <div className="pw__card-row">
                  <span className="pw__card-aeronave">{a.codigo}</span>
                  <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                    {/* "En vuelo" manda siempre: un avión operando no debería
                        mostrar "Próx. mant." en su lugar solo porque además
                        esté por vencer su revisión. */}
                    {a.estado_actual === "VOLANDO" ? (
                      <span className={`pw__tag ${ESTADO_CLS.VOLANDO}`}>{ESTADO_LABEL.VOLANDO}</span>
                    ) : a.estado === "MANTENIMIENTO" ? (
                      <span className="pw__tag pw__tag--rojo">Mantenimiento</span>
                    ) : proxima5 ? (
                      <span className="pw__tag pw__tag--naranja">Próx. mant.</span>
                    ) : (
                      <span className={`pw__tag ${cls}`}>
                        {ESTADO_LABEL[a.estado_actual] ?? a.estado_actual}
                      </span>
                    )}
                  </div>
                </div>
                <div className="pw__card-sub">
                  {a.modelo} · <span className={restantesCls}>{restantes.toFixed(1)}h para próx. revisión</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
