import { useEffect, useState } from "react";
import { reloj, fmt } from "../inventario/formato";

/**
 * Los trabajos que ahora mismo se están haciendo en el taller, para el jefe.
 *
 * Responde de un vistazo las tres preguntas que se hace al llegar: qué aviones
 * están intervenidos, quién está en cada uno, y cuánto tiempo lleva. El
 * cronómetro corre en vivo, igual que el del técnico.
 *
 * Si el trabajo pidió material y bodega todavía no lo entregó, el pedido se
 * despacha desde la misma tarjeta: es la acción que interrumpe al mecánico, así
 * que no debería obligar a ir a buscarla a otra pantalla.
 *
 * Lo ya FIRMADO también aparece: el avión sigue en el taller hasta que el jefe
 * aprueba. Se distingue porque el reloj queda DETENIDO en lo que duró el trabajo
 * — no sigue corriendo— y porque la tarjeta lleva su marca; al tocarla se abre
 * la revisión en vez del detalle, que es lo que toca hacer con ella.
 */
export default function TrabajosEnCurso({ ordenes, pendientes = {}, onVer, onEntregar }) {
  // El cronómetro se ancla al transcurrido que calculó el servidor y desde ahí
  // cuenta acá; el tic se reinicia con cada recarga de datos.
  const [tic, setTic] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTic((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const firma = ordenes.map((o) => o.segundos_trabajo).join(",");
  useEffect(() => { setTic(0); }, [firma]);

  if (!ordenes.length) {
    return <p className="adf-note">Ningún trabajo en curso ahora mismo.</p>;
  }

  return (
    <div className="curso-grid">
      {ordenes.map((o) => {
        const quien = o.asignado_nombre || o.mecanico_nombre;
        const pide = pendientes[o.id_orden] || [];
        // Firmado = el trabajo terminó; el cronómetro ya no corre. El servidor lo
        // congeló en firmado_en - creado_en, así que basta con no sumarle el tic.
        const cerrado = o.estado === "FIRMADA";
        return (
          <div key={o.id_orden} className={`curso-card ${cerrado ? "curso-card--cerrado" : ""}`}>
            <div className="curso-card__cuerpo" onClick={() => onVer?.(o)}>
              <div className="curso-card__head">
                <div>
                  <strong className="curso-card__avion">{o.aeronave_codigo}</strong>
                  <span className="curso-card__ot">{o.correlativo}</span>
                </div>
                <span className={`curso-card__reloj ${cerrado ? "curso-card__reloj--fin" : ""}`}>
                  {cerrado && <i className="bi bi-check-circle-fill" title="trabajo terminado"></i>}
                  {reloj((o.segundos_trabajo ?? 0) + (cerrado ? 0 : tic))}
                </span>
              </div>

              {/* El contador del avión al abrir el trabajo: es el número contra el
                  que se certifica la inspección y el que va impreso en la orden. */}
              <div className="curso-card__tac">
                {o.tacometro != null
                  ? <>TAC <strong>{fmt(o.tacometro)}</strong></>
                  : <span style={{ color: "var(--c-ink-4)" }}>sin tacómetro anotado</span>}
              </div>

              <p className="curso-card__disc">{o.discrepancia}</p>

              <div className="curso-card__pie">
                <span className="curso-card__quien">
                  <i className="bi bi-person-fill"></i>
                  {quien || <em>sin asignar</em>}
                  {o.aprendiz_nombre && <span className="curso-card__ayuda"> con {o.aprendiz_nombre}</span>}
                </span>
                <span className="curso-card__datos">
                  {cerrado && <span className="adf-tag amber">esperando tu firma</span>}
                  {o.documentos > 0 && (
                    <span title="documentos de bodega">
                      <i className="bi bi-box-seam"></i> {o.documentos}
                    </span>
                  )}
                  {o.devoluciones > 0 && (
                    <span className="adf-tag amber" title="veces que se la devolviste">
                      devuelta {o.devoluciones}×
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* Material pedido y sin entregar: el mecánico está esperando esto. */}
            {pide.map((d) => (
              <button
                key={d.id_documento}
                className="curso-card__pedido"
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
      })}
    </div>
  );
}
