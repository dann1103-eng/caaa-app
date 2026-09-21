import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getTablaPaquetes } from "../../../services/manualesApi";
import { TIPO_INSPECCION, mensajeError } from "./formatoManual";
import PaqueteEditor from "./PaqueteEditor";

/** Aviones × inspecciones. Solo lo abre el jefe (la pestaña se oculta al mecánico). */
export default function Paquetes() {
  const [t, setT] = useState(null);
  const [editando, setEditando] = useState(null); // { aeronave, tipo }

  const cargar = useCallback(() =>
    getTablaPaquetes().then(setT).catch((e) => toast.error(mensajeError(e, "No se pudieron cargar los paquetes"))), []);
  useEffect(() => { cargar(); }, [cargar]);

  if (editando) {
    return (
      <PaqueteEditor aeronave={editando.aeronave} tipo={editando.tipo} tabla={t}
        onVolver={() => { setEditando(null); cargar(); }} />
    );
  }
  if (!t) return <p className="man-vacio">Cargando…</p>;

  const celda = (id, tipo) => t.celdas.find((c) => c.id_aeronave === id && c.tipo_mantenimiento === tipo);
  const conReemplazo = t.celdas.filter((c) => c.reemplazados > 0).length;

  return (
    <div className="adf-card">
      <p className="adf-section-subtitle">
        Por avión y por inspección: qué páginas le salen al mecánico cuando abre ese trabajo. Solo ve los
        paquetes <strong>confirmados</strong>.
      </p>
      {conReemplazo > 0 && (
        <p className="adf-note">
          <i className="bi bi-exclamation-triangle"></i>
          {conReemplazo} paquete(s) usan una revisión reemplazada de un manual. Abrilos y apuntá cada rango a la revisión nueva.
        </p>
      )}
      <div className="adf-table-wrap">
        <table className="adf-table man-grilla">
          <thead>
            <tr><th>Avión</th>{t.tipos.map((x) => <th key={x}>{TIPO_INSPECCION[x]}</th>)}</tr>
          </thead>
          <tbody>
            {t.aeronaves.map((a) => (
              <tr key={a.id_aeronave}>
                <td>
                  <strong>{a.codigo}</strong> <small className="man-tenue">{a.modelo}</small>
                  {a.es_externa && <span className="adf-tag gray" style={{ marginLeft: 6 }}>Externo</span>}
                </td>
                {t.tipos.map((tipo) => {
                  const c = celda(a.id_aeronave, tipo);
                  const clase = c ? c.estado.toLowerCase() : "vacia";
                  return (
                    <td key={tipo}>
                      <button type="button" className={`man-celda man-celda--${clase}`}
                        onClick={() => setEditando({ aeronave: a, tipo })}
                        aria-label={`${a.codigo} ${TIPO_INSPECCION[tipo]}: ${c ? c.estado.toLowerCase() : "sin paquete"}`}>
                        {!c && "—"}
                        {c && <>{c.estado === "CONFIRMADO" ? "Confirmado" : "Borrador"}<small>{c.paginas} págs.</small></>}
                        {c?.reemplazados > 0 && <i className="bi bi-exclamation-triangle" title="Usa una revisión reemplazada"></i>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
