import {
  calcProgreso, categoriaMeta, aeroBadgeStyle, ESTADO_VUELO_META,
  formatHora, formatHoraReal,
} from "../../utils/vueloVisual";
import "../../pages/Proyeccion/PaginaProgramacion.css";

// Tabla de vuelos con barra de progreso + color por aeronave, tal como se ve
// en "Vuelos en Curso" de Proyección. Reusa sus mismas clases `pp__tbl-*`
// (definidas en PaginaProgramacion.css) para que cualquier ajuste visual
// futuro a esa tabla se refleje acá también sin duplicar CSS.
export default function VuelosEnCursoTable({ vuelos, emptyLabel = "Sin vuelos activos." }) {
  return (
    <div className="pp__tbl-wrap">
      <table className="pp__table">
        <thead>
          <tr>
            <th>ESTUDIANTE / INSTRUCTOR</th>
            <th>AERONAVE</th>
            <th>TIPO</th>
            <th>ESTADO</th>
            <th>ALMAS</th>
            <th>SALIDA</th>
            <th>LLEGADA</th>
          </tr>
        </thead>
        <tbody>
          {vuelos.length === 0 ? (
            <tr><td colSpan="7" className="pp__tbl-empty">{emptyLabel}</td></tr>
          ) : (
            vuelos.map((v) => {
              const pct = calcProgreso(v);
              const badge = ESTADO_VUELO_META[v.estado] || { label: v.estado, cls: "pp__tbl-badge--envuelo" };
              const tipo = categoriaMeta(v);
              return (
                <tr key={v.id_vuelo}>
                  <td>
                    <div className="pp__tbl-person">{v.alumno_nombre}</div>
                    <div className="pp__tbl-sub">Cap. {v.instructor_nombre}</div>
                  </td>
                  <td><span className="pp__tbl-aero" style={aeroBadgeStyle(v.aeronave_codigo)}>{v.aeronave_codigo}</span></td>
                  <td>
                    <span className={`pp__tipo-badge ${tipo.cls}`}>{tipo.label}</span>
                    {v.tipo_vuelo === "RUTA" && <span className="pp__tipo-badge pp__tipo--ruta">Ruta</span>}
                  </td>
                  <td>
                    <span className={`pp__tbl-badge ${badge.cls}`}>{badge.label}</span>
                    {pct !== null && (
                      <div className="pp__tbl-bar-wrap"><div className="pp__tbl-bar" style={{ width: `${pct}%` }} /></div>
                    )}
                  </td>
                  <td className="pp__tbl-almas" title={v.pasajeros_extra || ""}>
                    <i className="bi bi-people-fill" /> {v.almas_a_bordo ?? 2}
                  </td>
                  <td className="pp__tbl-hora">{formatHoraReal(v.salida_real) ?? formatHora(v.hora_inicio)}</td>
                  <td className="pp__tbl-hora">{formatHoraReal(v.llegada_real) ?? "—"}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
