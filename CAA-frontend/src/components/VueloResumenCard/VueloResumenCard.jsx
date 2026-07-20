import {
  calcProgreso, categoriaMeta, colorAeronave, ESTADO_VUELO_META,
  formatHora, formatHoraReal,
} from "../../utils/vueloVisual";
import "./VueloResumenCard.css";

// Tarjeta de un vuelo con TODA la información visible sin recortar (hora de
// salida y de llegada, almas a bordo, matrícula completa) — pensada para
// columnas angostas donde la tabla de Proyección (7 columnas fijas) no
// entra sin scroll horizontal. Reusa los mismos helpers/colores/badges que
// esa tabla para mantener el mismo lenguaje visual.
export default function VueloResumenCard({ vuelo, onAprobar }) {
  const pct = calcProgreso(vuelo);
  const badge = ESTADO_VUELO_META[vuelo.estado] || { label: vuelo.estado, cls: "pp__tbl-badge--envuelo" };
  const tipo = categoriaMeta(vuelo);
  const salida = formatHoraReal(vuelo.salida_real) ?? formatHora(vuelo.hora_inicio);
  const llegada = formatHoraReal(vuelo.llegada_real);
  const aprobado = !!vuelo.aprobado_dueno_en;

  return (
    <div className="vrc">
      <div className="vrc__top">
        <span className="vrc__hora">{salida}</span>
        <span className="vrc__aero" style={{ color: colorAeronave(vuelo.aeronave_codigo) }}>
          {vuelo.aeronave_codigo}
        </span>
      </div>

      <div className="vrc__alumno">{vuelo.alumno_nombre || "Pasajero"}</div>
      <div className="vrc__instructor">Cap. {vuelo.instructor_nombre}</div>

      <div className="vrc__badges">
        <span className={`pp__tipo-badge ${tipo.cls}`}>{tipo.label}</span>
        <span className={`pp__tbl-badge ${badge.cls}`}>{badge.label}</span>
      </div>

      {pct !== null && (
        <div className="vrc__bar-wrap"><div className="vrc__bar" style={{ width: `${pct}%` }} /></div>
      )}

      <div className="vrc__footer">
        <span className="vrc__foot-item">
          <i className="bi bi-airplane-engines" /> Salida <b>{salida}</b>
        </span>
        <span className="vrc__foot-item">
          <i className="bi bi-flag-fill" /> Llegada <b>{llegada ?? "—"}</b>
        </span>
        <span className="vrc__foot-item" title={vuelo.pasajeros_extra || ""}>
          <i className="bi bi-people-fill" /> <b>{vuelo.almas_a_bordo ?? 2}</b> almas
        </span>
      </div>

      {/* Visto bueno del dueño: checkbox grande (pantalla táctil, usuario
          mayor). Solo aparece si el dashboard pasa el handler. */}
      {onAprobar && (
        <label className={`vrc__aprobar ${aprobado ? "vrc__aprobar--ok" : ""}`}>
          <input
            type="checkbox"
            checked={aprobado}
            onChange={(e) => onAprobar(vuelo.id_vuelo, e.target.checked)}
          />
          {aprobado ? "✅ Operación revisada" : "Marcar como revisada"}
        </label>
      )}
    </div>
  );
}
