import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getAeronavesBodega, getFichaAeronaveTaller } from "../../../services/tallerApi";
import { fecha, fmt, money, META_TIPO } from "../inventario/formato";
import OrdenDetalleModal from "./OrdenDetalleModal";

/**
 * El folder del avión: todo lo que el Taller tiene de esa matrícula.
 *
 * Órdenes de trabajo, reportes de inspección, documentos de bodega y cuánto
 * material se le fue. Es el acceso rápido que pidió Daniel para no tener que
 * buscar papel por papel.
 */
export default function FolderAvion() {
  const [aeronaves, setAeronaves] = useState([]);
  const [id, setId] = useState("");
  const [d, setD] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [orden, setOrden] = useState(null);

  useEffect(() => {
    getAeronavesBodega().then((r) => {
      // Fuera los simuladores: no tienen mantenimiento ni libros, y su folder
      // sale siempre vacío. Mismo criterio que Libros y que abrir un trabajo.
      const a = (r || []).filter((x) => x.tipo !== "SIMULADOR");
      setAeronaves(a);
      // Arranca en un avión propio: abrir en uno de tercero confunde más que
      // ayudar, aunque la OMA sí les dé servicio.
      const primero = a.find((x) => !x.es_externa) || a[0];
      if (primero) setId(String(primero.id_aeronave));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    setCargando(true);
    getFichaAeronaveTaller(id)
      .then(setD)
      .catch((e) => toast.error(e.response?.data?.message || "No se pudo cargar el folder"))
      .finally(() => setCargando(false));
  }, [id]);

  const a = d?.aeronave;

  return (
    <>
      <div className="adf-card">
        <div className="inv-filtros">
          <div className="inv-buscador">
            <label>Avión</label>
            <select value={id} onChange={(e) => setId(e.target.value)}>
              {aeronaves.map((x) => (
                <option key={x.id_aeronave} value={x.id_aeronave}>
                  {x.codigo}{x.es_externa ? " (tercero)" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {cargando ? (
          <p style={{ color: "var(--c-ink-3)" }}>Cargando…</p>
        ) : !d ? null : (
          <>
            <div className="inv-kpis">
              <Kpi label="Horas del avión" valor={fmt(a.horas_acumuladas)} />
              <Kpi label="Próxima revisión" valor={a.horas_proxima_revision ? `${fmt(a.horas_proxima_revision, 0)} h` : "—"} />
              <Kpi label="Órdenes de trabajo" valor={d.ordenes.length} />
              <Kpi label="Material consumido" valor={money(d.consumo?.valor)} />
            </div>
            {a.es_externa && (
              <p className="inv-ayuda">
                Es una aeronave de tercero: recibe material y mantenimiento, pero no vuela con la escuela.
              </p>
            )}
          </>
        )}
      </div>

      {d && (
        <>
          <Bloque titulo="Órdenes de trabajo" icono="bi-clipboard2-check" vacio="Sin órdenes registradas.">
            {d.ordenes.length > 0 && (
              <table className="adf-table">
                <thead><tr><th>Orden</th><th>Fecha</th><th>Trabajo</th><th>Estado</th><th>Firmó</th></tr></thead>
                <tbody>
                  {d.ordenes.map((o) => (
                    <tr key={o.id_orden} className="inv-clic" onClick={() => setOrden(o.id_orden)}>
                      <td className="inv-codigo">{o.correlativo}</td>
                      <td>{fecha(o.fecha)}</td>
                      <td>{o.discrepancia}</td>
                      <td><span className="adf-tag">{o.estado}</span></td>
                      <td style={{ fontSize: "0.82rem", color: "var(--c-ink-3)" }}>{o.mecanico_nombre || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Bloque>

          <Bloque titulo="Reportes de inspección" icono="bi-journal-check" vacio="Sin reportes registrados.">
            {d.reportes.length > 0 && (
              <table className="adf-table">
                <thead><tr><th>Reporte</th><th>Fecha</th><th>Inspección</th><th className="amount">Tacómetro</th></tr></thead>
                <tbody>
                  {d.reportes.map((r) => (
                    <tr key={r.id_reporte}>
                      <td className="inv-codigo">{r.correlativo}</td>
                      <td>{fecha(r.fecha)}</td>
                      <td>{r.tipo_inspeccion || "—"}</td>
                      <td className="amount">{fmt(r.tacometro)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Bloque>

          <Bloque titulo={`Documentos de bodega (${d.documentos.length})`} icono="bi-file-earmark-text" vacio="Sin movimientos de material.">
            {d.documentos.length > 0 && (
              <table className="adf-table">
                <thead><tr><th>Documento</th><th>Tipo</th><th>Fecha</th><th>Trabajo</th><th className="amount">Renglones</th></tr></thead>
                <tbody>
                  {d.documentos.map((x) => {
                    const m = META_TIPO[x.tipo] || {};
                    return (
                      <tr key={x.id_documento}>
                        <td className="inv-codigo">{x.correlativo}</td>
                        <td><span className={`adf-tag ${m.tag || ""}`}>{m.label || x.tipo}</span></td>
                        <td>{fecha(x.fecha)}</td>
                        {/* Los históricos del Excel no tienen orden: llevan su
                            número como texto, o nada. */}
                        <td>{x.motivo || x.orden_trabajo_no || "—"}</td>
                        <td className="amount">{x.renglones}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Bloque>
        </>
      )}

      {orden && (
        <OrdenDetalleModal id={orden} onClose={() => setOrden(null)} onCambio={() => { setOrden(null); setId((v) => v); }} />
      )}
    </>
  );
}

function Bloque({ titulo, icono, vacio, children }) {
  return (
    <div className="adf-card" style={{ marginTop: "var(--sp-4)" }}>
      <h3 className="adf-card__title"><i className={`bi ${icono} me-2`}></i>{titulo}</h3>
      {children ? <div className="adf-table-wrap">{children}</div> : null}
      {!children && <p style={{ color: "var(--c-ink-3)", fontSize: "0.9rem" }}>{vacio}</p>}
    </div>
  );
}

function Kpi({ label, valor }) {
  return (
    <div className="inv-kpi">
      <div className="inv-kpi__label">{label}</div>
      <div className="inv-kpi__valor">{valor}</div>
    </div>
  );
}
