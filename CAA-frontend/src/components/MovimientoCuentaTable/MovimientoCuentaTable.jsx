import React from "react";
import { fmtFechaCorta } from "../../utils/fechas";
import "./MovimientoCuentaTable.css";

/**
 * Réplica digital de la hoja "CUENTA CORRIENTE — PILOTO ESTUDIANTE" CAAA.
 *
 * Columnas (mismo orden que la hoja física):
 *   FECHA · INSTRUCTOR · FACTURA NO. · AVION · H.V. · H.T. · NOTA · DEBE · HABER · SALDO
 *
 * Props:
 *   movimientos: Array de movimientos
 *   onEditar:    (mov) => void   (botón editar en cada fila)
 *   onAnular:    (mov) => void   (botón anular en cada fila)
 *   showActions: boolean         (mostrar columna de acciones)
 */
export default function MovimientoCuentaTable({ movimientos = [], onEditar, onAnular, showActions = true }) {
  const fmt = (n) => (n != null && n !== "")
    ? Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "";

  return (
    <div className="adf-hoja-wrap">
      <table className="adf-hoja">
        <thead>
          <tr>
            <th style={{ width: 90 }}>Fecha</th>
            <th style={{ width: 140 }}>Instructor</th>
            <th style={{ width: 110 }}>Factura</th>
            <th style={{ width: 110 }}>Avión</th>
            <th style={{ width: 64,  textAlign: "right" }}>H.V.</th>
            <th style={{ width: 70,  textAlign: "right" }}>H.T.</th>
            <th style={{ width: 150 }}>Nota</th>
            <th style={{ width: 110, textAlign: "right" }}>Debe</th>
            <th style={{ width: 110, textAlign: "right" }}>Haber</th>
            <th style={{ width: 124, textAlign: "right" }}>Saldo</th>
            {showActions && <th style={{ width: 86 }}></th>}
          </tr>
        </thead>
        <tbody>
          {movimientos.length === 0 && (
            <tr>
              <td colSpan={showActions ? 11 : 10} className="adf-hoja__empty">
                Sin movimientos aún. Los cargos por vuelos y depósitos aparecerán aquí.
              </td>
            </tr>
          )}
          {movimientos.map((m) => {
            const monto = Number(m.monto_usd);
            const esCargo = monto < 0;
            const debe  = esCargo ? Math.abs(monto) : null;
            const haber = !esCargo ? monto : null;
            const facturaNo = m.factura_correlativo || m.recibo_correlativo || null;
            const instructorTxt = m.instructor_nombre
              ? m.instructor_nombre
              : (m.tipo === 'DEPOSITO' || m.recibo_correlativo) ? 'Recibo'
              : (m.tipo === 'AJUSTE_HABER' || m.tipo === 'AJUSTE_DEBE') ? 'Ajuste'
              : (m.tipo === 'ANULACION') ? 'Anulación'
              : '';
            return (
              <tr key={m.id} className={m.anulado ? "anulado" : ""}>
                <td className="adf-hoja__date">
                  {fmtFechaCorta(m.fecha)}
                </td>
                <td className="adf-hoja__instructor">{instructorTxt}</td>
                <td className="adf-hoja__doc">{facturaNo ? <span className="mono"><span className="muted">#</span>{facturaNo}</span> : <span className="muted">—</span>}</td>
                <td className="adf-hoja__avion">{m.avion_codigo || <span className="muted">—</span>}</td>
                <td className="adf-hoja__num">{m.horas_vuelo != null ? Number(m.horas_vuelo).toFixed(1) : ""}</td>
                <td className="adf-hoja__num">{m.horas_totales != null ? Number(m.horas_totales).toFixed(1) : ""}</td>
                <td className="adf-hoja__nota">{m.nota || ""}</td>
                <td className="adf-hoja__num adf-hoja__debe">{debe != null ? fmt(debe) : ""}</td>
                <td className="adf-hoja__num adf-hoja__haber">{haber != null ? fmt(haber) : ""}</td>
                <td className="adf-hoja__num adf-hoja__saldo">{fmt(m.saldo_corrido ?? m.saldo_resultante_usd)}</td>
                {showActions && (
                  <td className="adf-hoja__actions">
                    {!m.anulado && (
                      <>
                        <button
                          className="adf-hoja__action-btn"
                          title="Editar movimiento"
                          onClick={() => onEditar && onEditar(m)}
                          aria-label="Editar"
                        >
                          <i className="bi bi-pencil"></i>
                        </button>
                        <button
                          className="adf-hoja__action-btn adf-hoja__action-btn--danger"
                          title="Borrar movimiento"
                          onClick={() => onAnular && onAnular(m)}
                          aria-label="Borrar"
                        >
                          <i className="bi bi-trash"></i>
                        </button>
                      </>
                    )}
                    {m.editado_en && (
                      <i
                        className="bi bi-pencil-square adf-hoja__edited-mark"
                        title={`Editado${m.editado_por_username ? ' por ' + m.editado_por_username : ''}${m.motivo_edicion ? ': ' + m.motivo_edicion : ''}`}
                      ></i>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
