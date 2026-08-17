import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getPendientesCosto, getDocumento, completarCostos, actualizarItem,
} from "../../../services/tallerApi";
import { fmt, money, fecha } from "./formato";

/**
 * La cola conjunta de Taller y Contabilidad.
 *
 * En el Excel, 500 de 662 ítems no tenían costo unitario, así que el "importe
 * inventario" no servía para nada. Acá se ve exactamente qué falta costear y se
 * completa en línea; al costear una entrada se genera el egreso que había
 * quedado pendiente en Contabilidad.
 */
export default function CostosPendientes() {
  const [data, setData] = useState({ items: [], documentos: [] });
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setData(await getPendientesCosto());
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudo cargar la lista");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando) return <p style={{ color: "var(--c-ink-3)" }}>Cargando…</p>;

  return (
    <>
      <div className="adf-card">
        <h3 className="adf-card__title">
          <i className="bi bi-file-earmark-text me-2"></i>
          Entradas sin costear ({data.documentos.length})
        </h3>
        <p style={{ fontSize: "0.85rem", color: "var(--c-ink-3)" }}>
          Al completar los costos se genera el egreso en Contabilidad (categoría REPUESTOS).
        </p>
        {data.documentos.length === 0 ? (
          <p style={{ color: "var(--c-ink-3)", fontSize: "0.9rem" }}>Ninguna entrada quedó sin costo. 👌</p>
        ) : (
          <div className="adf-table-wrap">
            <table className="adf-table">
              <thead>
                <tr><th>Documento</th><th>Fecha</th><th>Proveedor</th><th>Factura</th><th className="amount">Renglones</th><th className="amount">Sin costo</th><th></th></tr>
              </thead>
              <tbody>
                {data.documentos.map((d) => (
                  <tr key={d.id_documento}>
                    <td className="inv-codigo">{d.correlativo}</td>
                    <td>{fecha(d.fecha)}</td>
                    <td>{d.proveedor || <span style={{ color: "var(--c-ink-4)" }}>—</span>}</td>
                    <td>{d.factura_no || <span style={{ color: "var(--c-ink-4)" }}>—</span>}</td>
                    <td className="amount">{d.renglones}</td>
                    <td className="amount">{d.renglones_sin_costo}</td>
                    <td>
                      <button className="adf-btn small secondary" onClick={() => setAbierto(d.id_documento)}>Costear</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="adf-card" style={{ marginTop: "var(--sp-4)" }}>
        <h3 className="adf-card__title">
          <i className="bi bi-box-seam me-2"></i>
          Ítems sin costo ({data.items.length})
        </h3>
        <p style={{ fontSize: "0.85rem", color: "var(--c-ink-3)" }}>
          Ordenados por existencia: los de arriba son los que más distorsionan el valor del inventario.
        </p>
        {data.items.length === 0 ? (
          <p style={{ color: "var(--c-ink-3)", fontSize: "0.9rem" }}>Todos los ítems tienen costo. 👌</p>
        ) : (
          <div className="adf-table-wrap">
            <table className="adf-table">
              <thead>
                <tr><th>Código</th><th>Descripción</th><th>N° parte</th><th className="amount">Existencia</th><th style={{ width: 200 }}>Costo unitario</th></tr>
              </thead>
              <tbody>
                {data.items.map((it) => (
                  <FilaItem key={it.id_repuesto} item={it} onGuardado={cargar} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {abierto && (
        <CostearModal id={abierto} onClose={() => setAbierto(null)} onGuardado={() => { setAbierto(null); cargar(); }} />
      )}
    </>
  );
}

/** Fila con edición en línea del costo del ítem. */
function FilaItem({ item, onGuardado }) {
  const [v, setV] = useState("");
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    const n = Number(v);
    if (v === "" || isNaN(n) || n <= 0) return toast.error("Poné un costo mayor que cero");
    setGuardando(true);
    try {
      await actualizarItem(item.id_repuesto, { costo_unitario: n });
      toast.success(`${item.codigo} costeado`);
      onGuardado();
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <tr>
      <td className="inv-codigo">{item.codigo}</td>
      <td>{item.descripcion}</td>
      <td>{item.parte_no || "—"}</td>
      <td className="amount">{fmt(item.stock_actual, 0)} {item.unidad}</td>
      <td>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="number" step="0.0001" min="0" value={v}
            onChange={(e) => setV(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") guardar(); }}
            placeholder="0.00"
          />
          <button className="adf-icon-btn" title="Guardar" disabled={guardando} onClick={guardar}>
            <i className="bi bi-check-lg"></i>
          </button>
        </div>
      </td>
    </tr>
  );
}

function CostearModal({ id, onClose, onGuardado }) {
  const [data, setData] = useState(null);
  const [costos, setCostos] = useState({});
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    getDocumento(id)
      .then((d) => {
        setData(d);
        const ini = {};
        for (const r of d.renglones) ini[r.id_mov] = r.costo_unitario ?? "";
        setCostos(ini);
      })
      .catch((e) => toast.error(e.response?.data?.message || "No se pudo abrir"));
  }, [id]);

  const total = data?.renglones.reduce((s, r) => {
    const c = Number(costos[r.id_mov]);
    return s + (isNaN(c) ? 0 : Math.abs(Number(r.cantidad)) * c);
  }, 0) ?? 0;

  const guardar = async () => {
    const lista = Object.entries(costos)
      .filter(([, v]) => v !== "" && !isNaN(Number(v)))
      .map(([id_mov, v]) => ({ id_mov: Number(id_mov), costo_unitario: Number(v) }));
    if (!lista.length) return toast.error("No cargaste ningún costo");
    setGuardando(true);
    try {
      const r = await completarCostos(id, lista);
      toast.success(r.id_egreso ? `Costeado. Egreso #${r.id_egreso} por $${Number(r.total).toFixed(2)}` : "Costos guardados");
      onGuardado();
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="adf-modal-backdrop" onClick={onClose}>
      <div className="adf-card adf-modal-card" style={{ padding: 0, maxWidth: 820 }} onClick={(e) => e.stopPropagation()}>
        <div className="adf-edit-head">
          <span className="adf-edit-head__title">
            <span className="adf-edit-head__chip"><i className="bi bi-cash-coin"></i></span>
            Costear {data?.documento?.correlativo || "…"}
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="adf-btn" disabled={guardando || !data} onClick={guardar}><i className="bi bi-check"></i>Guardar</button>
            <button type="button" className="adf-btn secondary" onClick={onClose}>Cerrar</button>
          </div>
        </div>
        <div style={{ padding: "0 var(--sp-5) var(--sp-5)" }}>
          {!data ? <p style={{ color: "var(--c-ink-3)" }}>Cargando…</p> : (
            <>
              <div className="adf-table-wrap">
                <table className="adf-table">
                  <thead>
                    <tr><th>Código</th><th>Descripción</th><th className="amount">Cantidad</th><th style={{ width: 160 }}>Costo u.</th><th className="amount">Importe</th></tr>
                  </thead>
                  <tbody>
                    {data.renglones.map((r) => {
                      const c = Number(costos[r.id_mov]);
                      const imp = isNaN(c) ? 0 : Math.abs(Number(r.cantidad)) * c;
                      return (
                        <tr key={r.id_mov}>
                          <td className="inv-codigo">{r.codigo}</td>
                          <td>{r.descripcion}</td>
                          <td className="amount">{fmt(Math.abs(r.cantidad), 0)} {r.unidad}</td>
                          <td>
                            <input
                              type="number" step="0.0001" min="0"
                              value={costos[r.id_mov] ?? ""}
                              onChange={(e) => setCostos({ ...costos, [r.id_mov]: e.target.value })}
                            />
                          </td>
                          <td className="amount">{imp > 0 ? money(imp) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr><th colSpan={4}>Total de la factura</th><th className="amount">{money(total)}</th></tr>
                  </tfoot>
                </table>
              </div>
              <p className="adf-note" style={{ marginTop: 12 }}>
                Cada costo pasa además a ser el <strong>último costo conocido</strong> de su ítem, que es el
                método de costeo del inventario.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
