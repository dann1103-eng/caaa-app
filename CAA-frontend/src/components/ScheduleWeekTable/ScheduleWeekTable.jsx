import { useMemo, useState } from "react";
import { categoriaMeta, colorAeronave, formatHora } from "../../utils/vueloVisual";
import "../../pages/Proyeccion/PaginaProgramacion.css";

const DIAS = [
  { db: 1, label: "LUNES" },
  { db: 2, label: "MARTES" },
  { db: 3, label: "MIÉRCOLES" },
  { db: 4, label: "JUEVES" },
  { db: 5, label: "VIERNES" },
  { db: 6, label: "SÁBADO" },
];

const ESTADO_META = {
  PROGRAMADO:  { label: "Programado", cls: "pp__badge--programado" },
  EN_VUELO:    { label: "En progreso", cls: "pp__badge--envuelo" },
  EN_PROGRESO: { label: "En progreso", cls: "pp__badge--envuelo" },
  COMPLETADO:  { label: "Completado", cls: "pp__badge--completado" },
  CANCELADO:   { label: "Cancelado",  cls: "pp__badge--cancelado" },
};

// Réplica del bloque "Schedule" (día por tabs) de Proyección — mismas clases
// `pp__*` de PaginaProgramacion.css. Presentacional (como VuelosEnCursoTable):
// `vuelos` viene del mismo `getCalendarioPublico()` que usa Proyección (toda
// la semana, todos los instructores/alumnos); el padre debe envolver en un
// contenedor `.pp` para heredar la paleta oscura si no la tiene ya.
export default function ScheduleWeekTable({ vuelos, diaHoy }) {
  const diaHoyValido = DIAS.some((d) => d.db === diaHoy) ? diaHoy : 1;
  const [tabActivo, setTabActivo] = useState(diaHoyValido);

  const vuelosFiltrados = useMemo(
    () => vuelos.filter((v) => Number(v.dia_semana) === tabActivo),
    [vuelos, tabActivo]
  );

  return (
      <div className="pp__card pp__schedule-card">
        <div className="pp__day-tabs">
          {DIAS.map((dia) => (
            <button
              key={dia.db}
              className={`pp__day-tab ${tabActivo === dia.db ? "pp__day-tab--active" : ""} ${diaHoy === dia.db ? "pp__day-tab--hoy" : ""}`}
              onClick={() => setTabActivo(dia.db)}
            >
              {dia.label}
            </button>
          ))}
        </div>
        <div className="pp__flights-list">
          {vuelosFiltrados.length === 0 ? (
            <div className="pp__empty-state">No hay vuelos programados para este día.</div>
          ) : (
            vuelosFiltrados.map((v) => {
              const meta = ESTADO_META[v.estado || "PROGRAMADO"] || { label: v.estado, cls: "" };
              const tipo = categoriaMeta(v);
              return (
                <div key={v.id_vuelo} className="pp__flight-card">
                  <div className="pp__flight-time">
                    <span className="pp__time-val">{formatHora(v.hora_inicio)}</span>
                  </div>
                  <div className="pp__flight-info">
                    <div className="pp__info-group">
                      <span className="pp__info-label">ESTUDIANTE</span>
                      <span className="pp__info-main">{v.alumno_nombre}</span>
                    </div>
                    <div className="pp__info-group">
                      <span className="pp__info-label">INSTRUCTOR</span>
                      <span className="pp__info-main">
                        Cap. {v.instructor_nombre}{" "}
                        <span className={`pp__tipo-badge ${tipo.cls}`}>{tipo.label}</span>
                        {v.tipo_vuelo === "RUTA" && <span className="pp__tipo-badge pp__tipo--ruta">Ruta</span>}
                      </span>
                    </div>
                    <div className="pp__info-group">
                      <span className="pp__info-label">AERONAVE</span>
                      <span className="pp__info-main" style={{ color: colorAeronave(v.aeronave_codigo) }}>
                        {v.aeronave_codigo} ({v.aeronave_modelo})
                      </span>
                    </div>
                  </div>
                  <div className="pp__flight-status">
                    <span className={`pp__status-badge ${meta.cls}`}>
                      <span className="pp__status-dot" /> {meta.label}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
  );
}
