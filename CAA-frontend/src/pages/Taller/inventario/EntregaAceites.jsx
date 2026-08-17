import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getEntregaAceites } from "../../../services/tallerApi";
import { fmt, fecha } from "./formato";

/**
 * "CONTROL DE ENTREGA DE ACEITES POR DÍA".
 *
 * No es una tabla nueva: es el kardex de los aceites. Las columnas del cuaderno
 * (existencia → entregado → existencia actual) son el saldo corrido que el
 * kardex ya calcula, así que acá solo se elige el rango.
 *
 * A diferencia del papel se muestran también las entradas: el cuaderno solo
 * anota salidas, y por eso su saldo se despega del real en cuanto llega una
 * compra.
 */
export default function EntregaAceites() {
  const hoyISO = new Date().toISOString().slice(0, 10);
  const hace30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const [rango, setRango] = useState({ desde: hace30, hasta: hoyISO });
  const [hojas, setHojas] = useState([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setHojas((await getEntregaAceites(rango)).hojas);
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudo cargar la hoja de aceites");
    } finally {
      setCargando(false);
    }
  }, [rango]);

  useEffect(() => { cargar(); }, [cargar]);

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
        <button className="adf-btn secondary small" onClick={() => window.print()}>
          <i className="bi bi-printer"></i> Imprimir
        </button>
      </div>

      {cargando ? (
        <p style={{ color: "var(--c-ink-3)" }}>Cargando…</p>
      ) : hojas.length === 0 ? (
        <p style={{ color: "var(--c-ink-3)", fontSize: "0.9rem" }}>
          No hay ítems con clasificación ACEITE en el catálogo.
        </p>
      ) : (
        hojas.map((h) => (
          <div key={h.item.id_repuesto} style={{ marginBottom: "var(--sp-5)" }}>
            <h3 className="adf-card__title">
              <span className="inv-codigo">{h.item.codigo}</span> {h.item.descripcion}
              <span style={{ color: "var(--c-ink-3)", fontWeight: 400 }}>
                {" · "}existencia hoy: {fmt(h.item.stock_actual, 0)} {h.item.unidad}
              </span>
            </h3>

            {h.movimientos.length === 0 ? (
              <p style={{ color: "var(--c-ink-3)", fontSize: "0.85rem" }}>Sin movimientos en el rango.</p>
            ) : (
              <div className="adf-table-wrap">
                <table className="adf-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th className="amount">Existencia</th>
                      <th className="amount">Entregado</th>
                      <th className="amount">Existencia actual</th>
                      <th>Nombre</th>
                      <th>Concepto</th>
                      <th>Firma de entrega</th>
                      <th>Firma de recibido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {h.movimientos.map((m, i) => {
                      const cant = Number(m.cantidad);
                      const saldo = Number(m.saldo_corrido);
                      const anterior = saldo - cant;
                      return (
                        <tr key={m.id_mov}>
                          <td>{fecha(m.fecha)}</td>
                          <td className="amount">{fmt(anterior, 0)}</td>
                          <td className="amount">
                            {cant < 0 ? fmt(-cant, 0) : <span style={{ color: "var(--c-success-700)" }}>+{fmt(cant, 0)}</span>}
                          </td>
                          <td className="amount inv-saldo">{fmt(saldo, 0)}</td>
                          <td>{m.entregado_a || <span style={{ color: "var(--c-ink-4)" }}>—</span>}</td>
                          <td>
                            {[m.aeronave_codigo, m.tarea_nombre || m.motivo].filter(Boolean).join(" · ")
                              || m.proveedor || "—"}
                          </td>
                          <td style={{ minWidth: 110 }}></td>
                          <td style={{ minWidth: 110 }}></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))
      )}

      <p className="adf-note" style={{ marginTop: 12 }}>
        Las dos últimas columnas van en blanco a propósito, para firmar sobre el impreso. Las filas
        en verde son entradas de bodega: el cuaderno de papel solo anotaba salidas, y por eso su
        saldo se despegaba del real cuando llegaba una compra.
      </p>
    </div>
  );
}
