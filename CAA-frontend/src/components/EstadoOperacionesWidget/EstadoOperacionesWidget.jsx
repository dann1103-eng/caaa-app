import { useEffect, useState } from "react";
import { getEstadoOperaciones } from "../../services/turnoApi";
import "./EstadoOperacionesWidget.css";

export default function EstadoOperacionesWidget() {
  const [estado, setEstado] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getEstadoOperaciones()
      .then(setEstado)
      .catch(() => setEstado(null))
      .finally(() => setLoading(false));
  }, []);

  const activo = estado?.estado_general === "ACTIVO";

  return (
    <div className="eow">
      <div className="eow__header">
        <span className="eow__title">Operaciones</span>
        {!loading && estado && (
          <span className={`eow__badge ${activo ? "eow__badge--activo" : "eow__badge--inactivo"}`}>
            {activo ? "Activo" : "Inactivo"}
          </span>
        )}
      </div>

      {loading && <div className="eow__body eow__body--loading">Cargando…</div>}

      {!loading && !estado && (
        <div className="eow__body eow__body--error">No disponible</div>
      )}

      {!loading && estado && (
        <div className="eow__body">
          <div className={`eow__indicator ${activo ? "eow__indicator--on" : "eow__indicator--off"}`}>
            <span className="eow__dot" />
            <span className="eow__text">
              {activo
                ? "El aeródromo opera con normalidad"
                : (estado.motivo_inactivo || "Operaciones suspendidas temporalmente")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
