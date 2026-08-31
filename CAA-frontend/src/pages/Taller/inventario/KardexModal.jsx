import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getKardex } from "../../../services/tallerApi";
import { fmt, money, fecha, META_TIPO } from "./formato";

/**
 * Kardex de un ítem: entrada, salida y SALDO CORRIDO, como en cualquier sistema
 * de inventario.
 *
 * El saldo lo calcula el servidor al leer (nunca se guarda), y cuando hay
 * filtro de fechas la primera fila es el SALDO INICIAL con todo lo anterior al
 * rango — sin eso el kardex filtrado arranca en cero y no cuadra con la
 * existencia.
 */
export default function KardexModal({ item, onClose }) {
  const [data, setData] = useState(null);
  const [rango, setRango] = useState({ desde: "", hasta: "" });
  const [verAnulados, setVerAnulados] = useState(false);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    getKardex(item.id_repuesto, {
      desde: rango.desde || undefined,
      hasta: rango.hasta || undefined,
      incluir_anulados: verAnulados ? "true" : undefined,
    })
      .then((d) => { if (vivo) setData(d); })
      .catch((e) => toast.error(e.response?.data?.message || "No se pudo cargar el kardex"))
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [item.id_repuesto, rango, verAnulados]);

  const it = data?.item || item;
  const hayRango = !!rango.desde;

  return (
    <div className="adf-modal-backdrop" onClick={onClose}>
      <div className="adf-card adf-modal-card" style={{ padding: 0, maxWidth: 1000 }} onClick={(e) => e.stopPropagation()}>
        <div className="adf-edit-head">
          <span className="adf-edit-head__title">
            <span className="adf-edit-head__chip"><i className="bi bi-journal-text"></i></span>
            Kardex · <span className="inv-codigo">{it.codigo}</span> {it.descripcion}
          </span>
          <button type="button" className="adf-btn secondary" onClick={onClose}>Cerrar</button>
        </div>

        <div style={{ padding: "0 var(--sp-5) var(--sp-5)" }}>
          <div className="inv-kardex__ficha">
            <Dato label="N° de parte" valor={it.parte_no || "—"} />
            <Dato label="Ubicación" valor={it.ubicacion || "—"} />
            <Dato label="Clasificación" valor={it.categoria || "—"} />
            <Dato label="Unidad" valor={it.unidad} />
            <Dato label="Existencia" valor={`${fmt(it.stock_actual, 0)} ${it.unidad}`} alerta={Number(it.stock_actual) < 0} />
            <Dato label="Último costo" valor={money(it.costo_unitario)} />
            <Dato label="Importe" valor={money(it.importe)} />
            <Dato label="Últ. entrada" valor={fecha(it.ultima_entrada_en)} />
          </div>

          <div className="inv-filtros">
            <div>
              <label>Desde</label>
              <input type="date" value={rango.desde} onChange={(e) => setRango({ ...rango, desde: e.target.value })} />
            </div>
            <div>
              <label>Hasta</label>
              <input type="date" value={rango.hasta} onChange={(e) => setRango({ ...rango, hasta: e.target.value })} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", textTransform: "none", letterSpacing: 0 }}>
              <input type="checkbox" checked={verAnulados} onChange={(e) => setVerAnulados(e.target.checked)} />
              Ver anulados
            </label>
          </div>

          {cargando ? (
            <p style={{ color: "var(--c-ink-3)" }}>Cargando…</p>
          ) : !data?.movimientos.length ? (
            <p style={{ color: "var(--c-ink-3)", fontSize: "0.9rem" }}>
              Este ítem no tiene movimientos{hayRango ? " en el rango elegido" : ""}.
            </p>
          ) : (
            <div className="adf-table-wrap">
              <table className="adf-table">
                <thead>
                  <tr>
                    <th>Fecha</th><th>Documento</th><th>Detalle</th>
                    <th className="amount">Entrada</th><th className="amount">Salida</th>
                    <th className="amount">Saldo</th>
                    <th className="amount">Costo u.</th><th className="amount">Valor</th>
                    <th>Registró</th>
                  </tr>
                </thead>
                <tbody>
                  {hayRango && (
                    <tr className="inv-fila-inicial">
                      <td colSpan={5}>Saldo inicial al {rango.desde}</td>
                      <td className="amount inv-saldo">{fmt(data.saldo_inicial, 0)}</td>
                      <td colSpan={3}></td>
                    </tr>
                  )}
                  {data.movimientos.map((m) => {
                    const cant = Number(m.cantidad);
                    const meta = META_TIPO[m.tipo] || {};
                    return (
                      <tr key={m.id_mov} className={m.estado === "ANULADO" ? "inv-anulado" : ""}>
                        <td>{fecha(m.fecha)}</td>
                        <td>
                          <span className="inv-codigo">{m.correlativo}</span>
                          {m.forzado && (
                            <span className="adf-tag red" style={{ marginLeft: 6 }} title={m.motivo_forzado}>
                              Forzado
                            </span>
                          )}
                        </td>
                        <td>{detalle(m)}</td>
                        <td className="amount">{cant > 0 ? fmt(cant, 0) : ""}</td>
                        <td className="amount">{cant < 0 ? fmt(-cant, 0) : ""}</td>
                        <td className="amount inv-saldo" style={Number(m.saldo_corrido) < 0 ? { color: "var(--c-danger-700)" } : undefined}>
                          {m.estado === "ANULADO" ? "—" : fmt(m.saldo_corrido, 0)}
                        </td>
                        <td className="amount">{m.costo_unitario ? money(m.costo_unitario) : "—"}</td>
                        <td className="amount">{m.costo_unitario ? money(Math.abs(cant) * Number(m.costo_unitario)) : "—"}</td>
                        <td style={{ color: "var(--c-ink-3)", fontSize: "0.82rem" }}>{m.registrado_por_nombre || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="adf-note" style={{ marginTop: 12 }}>
            El saldo se recalcula al leer, así que un movimiento cargado con fecha anterior
            reordena la columna sin descuadrar nada.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Texto de la columna Detalle según de dónde venga el movimiento. */
function detalle(m) {
  if (m.tipo === "ENTRADA") {
    const partes = [m.proveedor, m.factura_no && `fact. ${m.factura_no}`].filter(Boolean);
    return partes.length ? partes.join(" · ") : <span style={{ color: "var(--c-ink-4)" }}>sin proveedor</span>;
  }
  if (m.tipo === "SALIDA") {
    const trabajo = m.tarea_nombre || m.mantenimiento_tipo || m.motivo;
    return [m.aeronave_codigo, trabajo].filter(Boolean).join(" · ") || "—";
  }
  return m.motivo || "Ajuste";
}

function Dato({ label, valor, alerta }) {
  return (
    <div>
      <div className="inv-kpi__label">{label}</div>
      <div style={{ fontSize: "0.95rem", color: alerta ? "var(--c-danger-700)" : "var(--c-ink-1)" }}>{valor}</div>
    </div>
  );
}
