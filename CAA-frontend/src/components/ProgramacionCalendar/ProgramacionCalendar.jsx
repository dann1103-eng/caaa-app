import "./ProgramacionCalendar.css";

const DIAS = [
  { id: 1, label: "Lunes" },
  { id: 2, label: "Martes" },
  { id: 3, label: "Miércoles" },
  { id: 4, label: "Jueves" },
  { id: 5, label: "Viernes" },
  { id: 6, label: "Sábado" },
];

const formatHora = (h) => h?.slice(0, 5);

export default function ProgramacionCalendar({
  week = "next",
  bloques = [],
  aeronaves = [],
  items = [],
  pendingMoves = [],
  bloqueos = [],
  setDragging,
  handleDrop,
  onReasignar,
}) {
  const safeItems = Array.isArray(items) ? items : [];
  const safeBloqueos = Array.isArray(bloqueos) ? bloqueos : [];

  const isEditable = week === "next";

  const semanaPublicadaNext =
    week === "next" && safeItems.some((i) => i.estado_solicitud === "PUBLICADO");

  const disabled = !isEditable || semanaPublicadaNext;

  const isBloqueado = (dia_semana, id_bloque) =>
    safeBloqueos.some(
      (x) => Number(x.dia_semana) === Number(dia_semana) && Number(x.id_bloque) === Number(id_bloque)
    );

  const findItem = (id_bloque, dia_semana, id_aeronave) =>
    safeItems.find(
      (i) =>
        Number(i.id_bloque) === Number(id_bloque) &&
        Number(i.dia_semana) === Number(dia_semana) &&
        Number(i.id_aeronave) === Number(id_aeronave)
    );

  return (
    <div className="calendar-wrapper">
      <table className="calendar">
        <thead>
          <tr>
            <th>Hora</th>
            <th>Aeronave</th>
            {DIAS.map((d) => (
              <th key={d.id}>{d.label}</th>
            ))}
          </tr>
        </thead>

        <tbody>
          {bloques.map((b) =>
            aeronaves.map((a, idx) => (
              <tr key={`${b.id_bloque}-${a.id_aeronave}`}>
                {idx === 0 && (
                  <td rowSpan={aeronaves.length} className="hora-cell">
                    {formatHora(b.hora_inicio)}
                  </td>
                )}

                <td className="aeronave-cell">{a.codigo}</td>

                {DIAS.map((d) => {
                  if (isBloqueado(d.id, b.id_bloque)) {
                    return <td key={d.id} className="slot-almuerzo"></td>;
                  }

                  const item = findItem(b.id_bloque, d.id, a.id_aeronave);
                  const modified = pendingMoves.some(
                    (m) => m.id_detalle === item?.id_detalle
                  );

                  const estadoMostrar =
                    item?.estado_mostrar ??
                    item?.estado_vuelo ??
                    item?.estado_solicitud;

                  return (
                    <td
                      key={d.id}
                      className={`slot-cell ${disabled ? "disabled" : ""}`}
                      onDragOver={disabled ? undefined : (e) => e.preventDefault()}
                      onDrop={
                        disabled
                          ? undefined
                          : () =>
                              handleDrop({
                                dia_semana: d.id,
                                id_bloque: b.id_bloque,
                                id_aeronave: a.id_aeronave,
                              })
                      }
                    >
                      {item ? (
                        <div
                          className={`slot-card estado-${estadoMostrar} ${
                            modified ? "dirty" : ""
                          }`}
                          draggable={!disabled}
                          onDragStart={() =>
                            !disabled &&
                            setDragging({
                              id_detalle: item.id_detalle,
                              id_bloque: item.id_bloque,
                              dia_semana: item.dia_semana,
                              id_aeronave: item.id_aeronave,
                            })
                          }
                        >
                          <span className="alumno">
                            {estadoMostrar === "CANCELADO" &&
                              item.justificacion_cancelacion
                                ?.toLowerCase()
                                .includes("mantenimiento") && (
                              <span title="Cancelado por mantenimiento" style={{ marginRight: 4 }}>🔧</span>
                            )}
                            {item.alumno_nombre}
                          </span>
                          <span className="instructor">
                            {item.instructor_nombre}
                          </span>



                          {week === "current" &&
                            item.id_vuelo &&
                            estadoMostrar === "CANCELADO" &&
                            item.justificacion_cancelacion
                              ?.toLowerCase()
                              .includes("mantenimiento") && (
                              <button
                                className="btn-reasignar-vuelo"
                                type="button"
                                onClick={() => onReasignar?.({
                                  id_vuelo: item.id_vuelo,
                                  id_semana: item.id_semana,
                                  id_bloque: item.id_bloque,
                                  dia_semana: item.dia_semana,
                                  alumno_nombre: item.alumno_nombre,
                                })}
                              >
                                Reasignar aeronave
                              </button>
                            )}
                        </div>
                      ) : (
                        <span className="slot-empty">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}