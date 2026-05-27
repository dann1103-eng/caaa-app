import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { getRecibos, anularRecibo, descargarPdfRecibo } from "../../services/administracionApi";

const MOCK = [
  { id: 1, numero_correlativo: 1799, fecha: "2025-09-08", alumno_username: "juan.oporto",   monto_usd: 2771.67, metodo: "TRANSFERENCIA", referencia: "TR-50231", anulado: false },
  { id: 2, numero_correlativo: 1798, fecha: "2025-09-05", alumno_username: "maria.lopez",   monto_usd: 1500.00, metodo: "EFECTIVO",      referencia: "",        anulado: false },
  { id: 3, numero_correlativo: 1797, fecha: "2025-09-03", alumno_username: "carlos.solano", monto_usd: 4500.00, metodo: "TARJETA",       referencia: "AUTH-991",anulado: false },
  { id: 4, numero_correlativo: 1796, fecha: "2025-09-01", alumno_username: "ana.morales",   monto_usd: 1000.00, metodo: "EFECTIVO",      referencia: "",        anulado: true,  motivo_anulacion: "Devolución por desistimiento" }
];

export default function Recibos() {
  const [recibos, setRecibos] = useState([]);
  const [usingMock, setUsingMock] = useState(false);

  const load = async () => {
    try {
      const r = await getRecibos();
      if (r?.ok) { setRecibos(r.data); setUsingMock(false); } else throw new Error();
    } catch { setRecibos(MOCK); setUsingMock(true); }
  };
  useEffect(() => { load(); }, []);

  const handleAnular = async (id) => {
    const motivo = prompt("Motivo de anulación:");
    if (!motivo) return;
    try { await anularRecibo(id, motivo); toast.success("Recibo anulado"); load(); }
    catch (e) { toast.error(e?.response?.data?.message || "Error"); }
  };

  return (
    <div>
      <h1 className="adf-section-title"><i className="bi bi-receipt"></i>Recibos de Depósito</h1>
      <p className="adf-section-subtitle">
        Registro de pagos recibidos de los alumnos. Cada recibo abona automáticamente al saldo de la cuenta corriente.
        {usingMock && <span className="adf-tag amber" style={{ marginLeft: 10 }}>Datos demo</span>}
      </p>

      <table className="adf-table">
        <thead>
          <tr>
            <th># Recibo</th><th>Fecha</th><th>Alumno</th><th>Método</th><th>Referencia</th>
            <th style={{ textAlign: "right" }}>Monto USD</th>
            <th>Estado</th><th></th>
          </tr>
        </thead>
        <tbody>
          {recibos.map(r => (
            <tr key={r.id}>
              <td><strong>#{r.numero_correlativo}</strong></td>
              <td>{new Date(r.fecha).toLocaleDateString("es-SV")}</td>
              <td><i className="bi bi-person me-1"></i>{r.alumno_username}</td>
              <td><span className="adf-tag blue">{r.metodo}</span></td>
              <td style={{ color: "var(--c-ink-3)", fontSize: "0.85rem" }}>{r.referencia || "—"}</td>
              <td className="amount pos" style={{ textAlign: "right" }}>${Number(r.monto_usd).toFixed(2)}</td>
              <td>
                {r.anulado
                  ? <span className="adf-tag red" title={r.motivo_anulacion}>ANULADO</span>
                  : <span className="adf-tag green">VIGENTE</span>}
              </td>
              <td style={{ textAlign: "right" }}>
                <button className="adf-btn small secondary" title="Descargar PDF"
                  onClick={async () => {
                    try { await descargarPdfRecibo(r.id, `recibo-${r.numero_correlativo}.pdf`); }
                    catch { toast.error("No se pudo descargar el PDF (recibo demo)."); }
                  }}>
                  <i className="bi bi-file-pdf"></i>
                </button>
                {!r.anulado && (
                  <button className="adf-btn small danger" style={{ marginLeft: 6 }} onClick={() => handleAnular(r.id)}>
                    <i className="bi bi-x-octagon"></i>
                  </button>
                )}
              </td>
            </tr>
          ))}
          {recibos.length === 0 && (
            <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--c-ink-4)", padding: 30 }}>
              Sin recibos registrados aún.
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
