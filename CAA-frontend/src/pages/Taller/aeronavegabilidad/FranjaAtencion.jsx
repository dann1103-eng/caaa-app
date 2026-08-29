import { esAlerta, restante } from "./vencimientos";

/**
 * Las tres bandas de arriba de Aeronavegabilidad. Cada una se oculta sola si no
 * tiene nada, para que la pantalla en calma no muestre tres cajas vacías.
 *
 * La tercera banda no es una alerta: es la lista de lo que el papel no dice.
 * 29 de los 38 ADs recurrentes no traen cada cuánto se repiten, y sin eso no hay
 * vencimiento que calcular. Que el sistema la produzca solo es mejor que
 * descubrirlo en una conversación.
 */
export default function FranjaAtencion({ tareas, onIrA }) {
  const vencidos = tareas.filter((t) => t.estado === "VENCIDO");
  const proximos = tareas.filter((t) => t.estado === "PROXIMO");
  const sinIntervalo = tareas.filter((t) => t.estado === "SIN_INTERVALO");
  if (!vencidos.length && !proximos.length && !sinIntervalo.length) return null;

  const Banda = ({ tipo, icono, titulo, items, sufijo }) => {
    if (!items.length) return null;
    return (
      <div className={`seg-banda seg-banda--${tipo}`}>
        <div className="seg-banda__head">
          <i className={`bi ${icono}`} aria-hidden="true"></i>
          <strong>{items.length} {titulo}</strong>
        </div>
        <div className="seg-banda__items">
          {items.slice(0, 6).map((t) => (
            <button
              key={t.id_tarea}
              type="button"
              className="seg-banda__item"
              onClick={() => onIrA?.(t)}
              title={t.nombre}
            >
              <span className="seg-banda__nombre">{t.nombre}</span>
              {sufijo && <span className="seg-banda__resto">{sufijo(t)}</span>}
            </button>
          ))}
          {items.length > 6 && (
            <span className="seg-banda__mas">y {items.length - 6} más</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="seg-franja">
      <Banda tipo="vencido" icono="bi-exclamation-triangle-fill" titulo="vencidos"
        items={vencidos} sufijo={restante} />
      <Banda tipo="proximo" icono="bi-clock-history" titulo="por vencer"
        items={proximos} sufijo={restante} />
      <Banda tipo="sinint" icono="bi-question-circle" titulo="sin intervalo definido"
        items={sinIntervalo}
        sufijo={() => "falta cada cuánto"} />
    </div>
  );
}

/** Conteo para la tarjeta de Mi taller y para los chips de las pestañas. */
export function conteoAlertas(tareas) {
  return {
    vencidos: tareas.filter((t) => t.estado === "VENCIDO").length,
    proximos: tareas.filter((t) => t.estado === "PROXIMO").length,
    sin_intervalo: tareas.filter((t) => t.estado === "SIN_INTERVALO").length,
    alertas: tareas.filter((t) => esAlerta(t.estado)).length,
  };
}
