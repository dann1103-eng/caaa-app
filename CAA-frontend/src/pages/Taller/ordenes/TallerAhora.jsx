import { useEffect, useState } from "react";
import { reloj, fmt, fecha } from "../inventario/formato";

/**
 * El taller ahora: los aviones que están adentro y lo que se les está haciendo.
 *
 * Es UNA sola lista. Antes esto vivía partido en dos —"aviones esperando
 * trabajo" en la pantalla del técnico y "trabajos en curso" en la del jefe— y
 * ademas la firma se podía dar desde dos lugares distintos, así que el mismo
 * avión aparecía por duplicado diciendo cosas que se contradecían: "nadie lo
 * tomó" al lado de un trabajo abierto sobre él.
 *
 * Cada avión trae sus trabajos con quién lo lleva, el tacómetro, el cronómetro
 * y el material que pidió; y debajo el botón para tomarlo o abrirle otro. Lo que
 * uno puede hacer sale de quién es, no de en qué pantalla está.
 */
export default function TallerAhora({
  cola,
  pendientes = {},
  uid,
  puedeAsignar = false,
  personal = [],
  onTomar,
  onAbrirTrabajo,
  onEstimado,
  onAsignar,
  onEntregar,
}) {
  // El cronómetro se ancla al transcurrido que calculó el servidor y desde ahí
  // cuenta acá; el tic se reinicia con cada recarga de datos.
  const [tic, setTic] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTic((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const firma = cola.map((m) => m.trabajos.map((t) => t.segundos_trabajo).join()).join("|");
  useEffect(() => { setTic(0); }, [firma]);

  if (!cola.length) {
    return <p className="adf-note">Ningún avión en el taller ahora mismo.</p>;
  }

  return (
    <div className="ahora">
      {cola.map((m) => {
        const vivos = m.trabajos.filter((t) => ["ABIERTA", "FIRMADA"].includes(t.estado));
        return (
          <div key={m.id_mantenimiento} className="ahora-avion">
            <div className="ahora-avion__head">
              <div>
                <strong className="ahora-avion__codigo">{m.aeronave_codigo}</strong>
                <span className="ahora-avion__tipo">
                  {m.tipo}{m.descripcion ? ` — ${m.descripcion}` : ""}
                </span>
                <div className="ahora-avion__fechas">
                  Desde {fecha(m.fecha_inicio)} · listo estimado{" "}
                  <strong>{m.fecha_fin ? fecha(m.fecha_fin) : "sin fecha"}</strong>
                  {m.fecha_fin_original && (
                    <span className="adf-tag amber" style={{ marginLeft: 6 }}>
                      movido por el Taller
                    </span>
                  )}
                </div>
              </div>
              <button className="adf-btn secondary small" onClick={() => onEstimado?.(m)}>
                <i className="bi bi-calendar-event"></i>¿Cuándo está listo?
              </button>
            </div>

            {vivos.length === 0 ? (
              <p className="ahora-vacio">Nadie lo tomó todavía.</p>
            ) : (
              vivos.map((t) => {
                const mio = t.id_mecanico_asignado === uid;
                // Firmado = el trabajo terminó; el cronómetro ya no corre. El
                // servidor lo congeló en firmado_en - creado_en.
                const cerrado = t.estado === "FIRMADA";
                const pide = pendientes[t.id_orden] || [];
                return (
                  <div key={t.id_orden} className={`ahora-ot ${cerrado ? "ahora-ot--firmada" : ""} ${mio ? "ahora-ot--mia" : ""}`}>
                    <div className="ahora-ot__cuerpo" onClick={() => onAbrirTrabajo?.(t, m)}>
                      <div className="ahora-ot__head">
                        <span className="ahora-ot__num">{t.correlativo}</span>
                        <span className={`ahora-ot__reloj ${cerrado ? "ahora-ot__reloj--fin" : ""}`}>
                          {cerrado && <i className="bi bi-check-circle-fill"></i>}
                          {reloj((t.segundos_trabajo ?? 0) + (cerrado ? 0 : tic))}
                        </span>
                      </div>

                      <div className="ahora-ot__tac">
                        {t.tacometro != null
                          ? <>TAC <strong>{fmt(t.tacometro)}</strong></>
                          : "sin tacómetro anotado"}
                      </div>

                      <p className="ahora-ot__disc">{t.discrepancia}</p>

                      <div className="ahora-ot__pie">
                        <span className="ahora-ot__quien">
                          <i className="bi bi-person-fill"></i>
                          {t.asignado_nombre || <em>sin asignar</em>}
                          {t.aprendiz_nombre && <span className="ahora-ot__ayuda"> con {t.aprendiz_nombre}</span>}
                          {mio && <span className="adf-tag green" style={{ marginLeft: 6 }}>tuyo</span>}
                        </span>
                        <span className="ahora-ot__datos">
                          {cerrado && (
                            <span className="adf-tag amber">
                              {puedeAsignar ? "esperando tu firma" : "esperando al jefe"}
                            </span>
                          )}
                          {t.documentos > 0 && (
                            <span title="documentos de bodega">
                              <i className="bi bi-box-seam"></i> {t.documentos}
                            </span>
                          )}
                          {t.devoluciones > 0 && (
                            <span className="adf-tag amber" title="veces que se la devolvieron">
                              devuelta {t.devoluciones}×
                            </span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Reasignar es del jefe, y solo mientras el trabajo siga abierto. */}
                    {puedeAsignar && !cerrado && (
                      <div className="ahora-ot__asignar">
                        <label>Quién lo trabaja</label>
                        <select
                          className="inv-campo"
                          value={t.id_mecanico_asignado || ""}
                          onChange={(e) => onAsignar?.(t.id_orden, e.target.value)}
                        >
                          <option value="">Sin asignar</option>
                          {personal.map((p) => (
                            <option key={p.id_usuario} value={p.id_usuario}>{p.nombre}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Material pedido y sin entregar: el mecánico está esperando esto. */}
                    {pide.map((d) => (
                      <button
                        key={d.id_documento}
                        className="ahora-ot__pedido"
                        onClick={(e) => { e.stopPropagation(); onEntregar?.(d); }}
                      >
                        <i className="bi bi-hourglass-split"></i>
                        <span>
                          Pide material · <strong>{d.correlativo}</strong>
                          {d.renglones > 0 && ` · ${d.renglones} ítem${d.renglones === 1 ? "" : "s"}`}
                        </span>
                        <i className="bi bi-chevron-right"></i>
                      </button>
                    ))}
                  </div>
                );
              })
            )}

            <div className="ahora-avion__pie">
              <button
                className={`adf-btn small ${vivos.length ? "secondary" : ""}`}
                onClick={() => onTomar?.(m)}
              >
                <i className="bi bi-play-circle"></i>
                {vivos.length ? "Abrir otro trabajo" : "Tomar este avión"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
