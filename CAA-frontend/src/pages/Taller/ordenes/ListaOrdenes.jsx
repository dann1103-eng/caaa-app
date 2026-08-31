import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getOrdenes } from "../../../services/tallerApi";
import OrdenDetalleModal from "./OrdenDetalleModal";
import { fecha } from "../inventario/formato";

const ESTADOS = {
  ABIERTA: { label: "Abierta", tag: "blue" },
  FIRMADA: { label: "Esperando revisión", tag: "amber" },
  APROBADA: { label: "Aprobada", tag: "green" },
  CERRADA: { label: "Cerrada", tag: "green" },
  ANULADA: { label: "Anulada", tag: "red" },
};

/** Listado de órdenes de trabajo, con el buscador que pidió el jefe de taller. */
export default function ListaOrdenes() {
  const [ordenes, setOrdenes] = useState([]);
  const [f, setF] = useState({ q: "", estado: "", desde: "", hasta: "" });
  const [cargando, setCargando] = useState(true);
  const [abierta, setAbierta] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setOrdenes(await getOrdenes(f));
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudieron cargar las órdenes");
    } finally {
      setCargando(false);
    }
  }, [f]);

  // Debounce: no dispara una consulta por tecla.
  useEffect(() => {
    const t = setTimeout(cargar, 250);
    return () => clearTimeout(t);
  }, [cargar]);

  const abiertas = ordenes.filter((o) => o.estado === "ABIERTA").length;

  return (
    <>
      <div className="adf-card">
        <div className="inv-filtros">
          <div className="inv-buscador">
            <label>Buscar</label>
            <input
              value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })}
              placeholder="N° de orden, avión o qué se hizo"
            />
          </div>
          <div>
            <label>Estado</label>
            <select value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })}>
              <option value="">Todas</option>
              <option value="ABIERTA">Abiertas</option>
              <option value="FIRMADA">Esperando revisión</option>
              <option value="APROBADA">Aprobadas</option>
              <option value="ANULADA">Anuladas</option>
            </select>
          </div>
          <div>
            <label>Desde</label>
            <input type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} />
          </div>
          <div>
            <label>Hasta</label>
            <input type="date" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} />
          </div>
        </div>

        {abiertas > 0 && !f.estado && (
          <p className="inv-ayuda">
            Hay <strong>{abiertas}</strong> trabajo(s) sin cerrar.
          </p>
        )}

        {cargando ? (
          <p style={{ color: "var(--c-ink-3)" }}>Cargando…</p>
        ) : ordenes.length === 0 ? (
          <p style={{ color: "var(--c-ink-3)", fontSize: "0.9rem" }}>
            Todavía no hay órdenes de trabajo con ese filtro.
          </p>
        ) : (
          <div className="adf-table-wrap">
            <table className="adf-table">
              <thead>
                <tr>
                  <th>Orden</th><th>Fecha</th><th>Avión</th><th>Trabajo</th>
                  <th>Estado</th><th>Firmó</th>
                  <th className="amount">Papeles</th>
                </tr>
              </thead>
              <tbody>
                {ordenes.map((o) => {
                  const e = ESTADOS[o.estado] || {};
                  return (
                    <tr key={o.id_orden} className="inv-clic" onClick={() => setAbierta(o.id_orden)}>
                      <td className="inv-codigo">{o.correlativo}</td>
                      <td>{fecha(o.fecha)}</td>
                      <td>
                        {o.aeronave_codigo}
                        {o.es_externa && <span className="adf-tag" style={{ marginLeft: 6 }}>Tercero</span>}
                      </td>
                      <td>{o.discrepancia}</td>
                      <td><span className={`adf-tag ${e.tag || ""}`}>{e.label}</span></td>
                      <td style={{ fontSize: "0.82rem", color: "var(--c-ink-3)" }}>
                        {o.mecanico_nombre ? `${o.mecanico_nombre}${o.licencia_tma ? ` · ${o.licencia_tma}` : ""}` : "—"}
                      </td>
                      {/* Los "papeles" son lo que cuelga del trabajo: es el dato
                          que el jefe de taller busca cuando arma el folder. */}
                      <td className="amount">{o.documentos + o.partes + (o.reporte_correlativo ? 1 : 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {abierta && (
        <OrdenDetalleModal
          id={abierta}
          onClose={() => setAbierta(null)}
          onCambio={() => { setAbierta(null); cargar(); }}
        />
      )}
    </>
  );
}
