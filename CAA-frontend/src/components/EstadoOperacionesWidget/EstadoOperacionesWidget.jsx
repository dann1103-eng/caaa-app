import { useEffect, useState } from "react";
import { getEstadoOperaciones } from "../../services/turnoApi";
import "./EstadoOperacionesWidget.css";

// Estado EFECTIVO (fusionado por el backend): la suspensión extraordinaria
// manda; si no, el ciclo del turno (pausa de almuerzo / cierre del día).
const META = {
  ACTIVO:        { badge: "Activo",     cls: "activo",   texto: "El aeródromo opera con normalidad" },
  PAUSA_TURNO:   { badge: "En pausa",   cls: "pausa",    texto: "Pausa de almuerzo — las operaciones se reanudan en el turno de la tarde" },
  CERRADO_TURNO: { badge: "Cerrado",    cls: "cerrado",  texto: "Operaciones cerradas — se reanudan con la apertura del próximo turno" },
  SUSPENDIDO:    { badge: "Suspendido", cls: "inactivo", texto: null }, // usa motivo_inactivo
};

export default function EstadoOperacionesWidget() {
  const [estado, setEstado] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cargar = () =>
      getEstadoOperaciones()
        .then(setEstado)
        .catch(() => setEstado(null))
        .finally(() => setLoading(false));
    cargar();
    // Refresco liviano: refleja pausa/cierre del turno sin recargar la página.
    const t = setInterval(cargar, 60000);
    return () => clearInterval(t);
  }, []);

  const efectivo = estado?.estado_efectivo
    || (estado?.estado_general === "ACTIVO" ? "ACTIVO" : "SUSPENDIDO");
  const meta = META[efectivo] || META.ACTIVO;

  return (
    <div className="eow">
      <div className="eow__header">
        <span className="eow__title">Operaciones</span>
        {!loading && estado && (
          <span className={`eow__badge eow__badge--${meta.cls}`}>{meta.badge}</span>
        )}
      </div>

      {loading && <div className="eow__body eow__body--loading">Cargando…</div>}

      {!loading && !estado && (
        <div className="eow__body eow__body--error">No disponible</div>
      )}

      {!loading && estado && (
        <div className="eow__body">
          <div className={`eow__indicator eow__indicator--${meta.cls}`}>
            <span className="eow__dot" />
            <span className="eow__text">
              {meta.texto || estado.motivo_inactivo || "Operaciones suspendidas temporalmente"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
