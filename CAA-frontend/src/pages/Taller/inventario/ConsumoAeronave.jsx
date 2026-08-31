import { Fragment, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getConsumoAeronave, getDocumentos } from "../../../services/tallerApi";
import { fmt, money, fecha } from "./formato";

/**
 * Cuánto material y cuánto dinero se le fue a cada avión.
 *
 * Es el pago de haber amarrado la salida a la aeronave y al mantenimiento: en
 * el Excel esto solo vivía como texto libre en la columna de comentarios.
 */
export default function ConsumoAeronave() {
  const [rango, setRango] = useState({ desde: "", hasta: "" });
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [abierta, setAbierta] = useState(null);
  const [docs, setDocs] = useState([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setFilas(await getConsumoAeronave(rango));
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudo cargar el consumo");
    } finally {
      setCargando(false);
    }
  }, [rango]);

  useEffect(() => { cargar(); }, [cargar]);

  const abrir = async (fila) => {
    if (abierta === fila.id_aeronave) { setAbierta(null); return; }
    setAbierta(fila.id_aeronave);
    try {
      const todos = await getDocumentos({ tipo: "SALIDA", ...rango });
      setDocs(todos.filter((d) => d.aeronave_codigo === fila.codigo));
    } catch { setDocs([]); }
  };

  const totalValor = filas.reduce((s, x) => s + Number(x.valor || 0), 0);
  const totalUnid = filas.reduce((s, x) => s + Number(x.unidades || 0), 0);

  return (
    <div className="adf-card">
      <div className="inv-filtros">
        <div>
          <label>Desde</label>
          <input type="date" value={rango.desde} onChange={(e) => setRango({ ...rango, desde: e.target.value })} />
        </div>
        <div>
          <label>Hasta</label>
          <input type="date" value={rango.hasta} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} />
        </div>
      </div>

      {cargando ? (
        <p style={{ color: "var(--c-ink-3)" }}>Cargando…</p>
      ) : filas.length === 0 ? (
        <p style={{ color: "var(--c-ink-3)", fontSize: "0.9rem" }}>No hay salidas en ese período.</p>
      ) : (
        <div className="adf-table-wrap">
          <table className="adf-table">
            <thead>
              <tr>
                <th>Aeronave</th><th>Modelo</th>
                <th className="amount">Requisiciones</th>
                <th className="amount">Unidades</th>
                <th className="amount">Valor consumido</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((x) => (
                // La key va en el Fragment: es el nodo que devuelve el map.
                <Fragment key={x.id_aeronave}>
                  <tr className="inv-clic" onClick={() => abrir(x)}>
                    <td>
                      <strong>{x.codigo}</strong>
                      {x.es_externa && <span className="adf-tag" style={{ marginLeft: 6 }}>Tercero</span>}
                    </td>
                    <td>{x.modelo}</td>
                    <td className="amount">{x.documentos}</td>
                    <td className="amount">{fmt(x.unidades, 0)}</td>
                    <td className="amount">{Number(x.valor) > 0 ? money(x.valor) : "—"}</td>
                    <td><i className={`bi bi-chevron-${abierta === x.id_aeronave ? "up" : "down"}`}></i></td>
                  </tr>
                  {abierta === x.id_aeronave && (
                    <tr>
                      <td colSpan={6} style={{ background: "var(--c-surface-2)" }}>
                        {docs.length === 0 ? (
                          <span style={{ color: "var(--c-ink-3)", fontSize: "0.85rem" }}>Sin detalle.</span>
                        ) : (
                          <table className="adf-table" style={{ margin: 0 }}>
                            <thead>
                              <tr><th>Documento</th><th>Fecha</th><th>Trabajo</th><th className="amount">Renglones</th><th className="amount">Valor</th></tr>
                            </thead>
                            <tbody>
                              {docs.map((d) => (
                                <tr key={d.id_documento}>
                                  <td className="inv-codigo">{d.correlativo}</td>
                                  <td>{fecha(d.fecha)}</td>
                                  <td>{d.motivo || "—"}</td>
                                  <td className="amount">{d.renglones}</td>
                                  <td className="amount">{Number(d.total) > 0 ? money(d.total) : "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={3}>Total</th>
                <th className="amount">{fmt(totalUnid, 0)}</th>
                <th className="amount">{money(totalValor)}</th>
                <th></th>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="adf-note" style={{ marginTop: 12 }}>
        El valor sale del costo que tenía cada ítem al momento de la salida. Los renglones sin
        costo no suman: se completan desde <strong>Costos pendientes</strong>.
      </p>
    </div>
  );
}
