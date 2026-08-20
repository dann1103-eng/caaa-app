import { useEffect, useState } from "react";
import { reloj } from "../inventario/formato";

/**
 * Los trabajos que ahora mismo se están haciendo en el taller, para el jefe.
 *
 * Responde de un vistazo las tres preguntas que se hace al llegar: qué aviones
 * están intervenidos, quién está en cada uno, y cuánto tiempo lleva. El
 * cronómetro corre en vivo, igual que el del técnico.
 *
 * Solo ABIERTA: lo ya firmado vive arriba en "Esperando tu firma", que es donde
 * el jefe tiene algo que hacer. Acá no se repite.
 */
export default function TrabajosEnCurso({ ordenes, onVer }) {
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
        return (
          <div key={o.id_orden} className="curso-card" onClick={() => onVer?.(o)}>
            <div className="curso-card__head">
              <div>
                <strong className="curso-card__avion">{o.aeronave_codigo}</strong>
                <span className="curso-card__ot">{o.correlativo}</span>
              </div>
              <span className="curso-card__reloj">{reloj((o.segundos_trabajo ?? 0) + tic)}</span>
            </div>

            <p className="curso-card__disc">{o.discrepancia}</p>

            <div className="curso-card__pie">
              <span className="curso-card__quien">
                <i className="bi bi-person-fill"></i>
                {quien || <em>sin asignar</em>}
                {o.aprendiz_nombre && <span className="curso-card__ayuda"> con {o.aprendiz_nombre}</span>}
              </span>
              <span className="curso-card__datos">
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
        );
      })}
    </div>
  );
}
