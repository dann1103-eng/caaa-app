import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getPrestamo, devolverPrestamo } from "../../../services/tallerApi";
import { fecha, fmt, hoy } from "../inventario/formato";

/**
 * Registrar la devolución de un préstamo.
 *
 * Admite parcial: se anota lo que volvió y el préstamo sigue pendiente por el
 * resto. Y admite cerrarlo sin devolución física, para cuando se paga o se
 * cruza en cuenta con el taller vecino.
 */
export default function DevolverPrestamoModal({ prestamo, onClose, onGuardado }) {
  const [d, setD] = useState(null);
  const [f, setF] = useState({ fecha_devolucion: hoy(), devuelto_por: "", recibido_por: "", nota: "" });
  const [cant, setCant] = useState({});
  const [sinDevolucion, setSinDevolucion] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    getPrestamo(prestamo.id_prestamo)
      .then((r) => {
        setD(r);
        const ini = {};
        // Precarga lo que falta de cada renglón: el caso normal es devolver todo.
        for (const l of r.lineas) ini[l.id_linea] = String(Number(l.cantidad) - Number(l.devuelto));
        setCant(ini);
      })
      .catch(() => toast.error("No se pudo leer el préstamo"));
  }, [prestamo.id_prestamo]);

  const guardar = async () => {
    setGuardando(true);
    try {
      const payload = sinDevolucion
        ? { sin_devolucion: true, fecha_devolucion: f.fecha_devolucion, nota: f.nota }
        : {
            ...f,
            lineas: d.lineas
              .map((l) => ({ id_linea: l.id_linea, cantidad: Number(cant[l.id_linea] || 0) }))
              .filter((x) => x.cantidad > 0),
          };
      if (!sinDevolucion && !payload.lineas.length) {
        setGuardando(false);
        return toast.error("Anotá cuánto volvió, o cerrá el préstamo sin devolución");
      }
      const r = await devolverPrestamo(prestamo.id_prestamo, payload);
      toast.success(r.parcial ? "Devolución parcial registrada; el préstamo sigue abierto" : "Préstamo cerrado");
      onGuardado();
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudo registrar la devolución");
    } finally {
      setGuardando(false);
    }
  };

  const recibe = prestamo.direccion === "ENTREGADO";

  return (
    <div className="adf-modal-backdrop" onClick={onClose}>
      <div className="adf-card adf-modal-card" style={{ padding: 0, maxWidth: 660 }} onClick={(e) => e.stopPropagation()}>
        <div className="adf-edit-head">
          <span className="adf-edit-head__title">
            <span className="adf-edit-head__chip"><i className="bi bi-arrow-return-left"></i></span>
            Devolución de {prestamo.correlativo}
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="adf-btn" disabled={guardando || !d} onClick={guardar}><i className="bi bi-check"></i>Guardar</button>
            <button type="button" className="adf-btn secondary" onClick={onClose}>Cerrar</button>
          </div>
        </div>

        <div style={{ padding: "0 var(--sp-5) var(--sp-5)" }}>
          <p style={{ fontSize: "0.9rem", color: "var(--c-ink-3)" }}>
            {recibe
              ? <>Le prestamos a <strong>{prestamo.contraparte}</strong> el {fecha(prestamo.fecha_entrega)}. Lo que vuelva entra al estante.</>
              : <>Nos prestó <strong>{prestamo.contraparte}</strong> el {fecha(prestamo.fecha_entrega)}. Lo que devolvamos sale del estante.</>}
          </p>

          <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "var(--sp-3) 0", fontSize: "0.9rem", cursor: "pointer" }}>
            <input type="checkbox" checked={sinDevolucion} onChange={(e) => setSinDevolucion(e.target.checked)} />
            Cerrar sin devolución física (se pagó o se cruzó en cuenta)
          </label>

          {!sinDevolucion && d && (
            <div className="adf-table-wrap">
              <table className="adf-table inv-renglones">
                <thead>
                  <tr><th>Qué</th><th className="amount">Prestado</th><th className="amount">Ya volvió</th><th style={{ width: 120 }} className="amount">Vuelve ahora</th></tr>
                </thead>
                <tbody>
                  {d.lineas.map((l) => {
                    const falta = Number(l.cantidad) - Number(l.devuelto);
                    return (
                      <tr key={l.id_linea}>
                        <td>
                          {l.codigo && <span className="inv-codigo">{l.codigo} </span>}
                          {l.item_descripcion || l.descripcion}
                          {!l.id_repuesto && <span style={{ color: "var(--c-ink-4)" }}> · no es de bodega</span>}
                        </td>
                        <td className="amount">{fmt(l.cantidad, 0)}</td>
                        <td className="amount">{fmt(l.devuelto, 0)}</td>
                        <td>
                          <input
                            type="number" step="0.01" min="0" max={falta}
                            value={cant[l.id_linea] ?? ""}
                            onChange={(e) => setCant({ ...cant, [l.id_linea]: e.target.value })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="adf-form-grid" style={{ marginTop: 12 }}>
            <div className="adf-form-field">
              <label>Fecha</label>
              <input type="date" value={f.fecha_devolucion} onChange={(e) => set("fecha_devolucion", e.target.value)} />
            </div>
            {!sinDevolucion && (
              <>
                <div className="adf-form-field">
                  <label>Quién devuelve</label>
                  <input value={f.devuelto_por} onChange={(e) => set("devuelto_por", e.target.value)} />
                </div>
                <div className="adf-form-field">
                  <label>Quién recibe</label>
                  <input value={f.recibido_por} onChange={(e) => set("recibido_por", e.target.value)} />
                </div>
              </>
            )}
          </div>

          {sinDevolucion && (
            <div className="adf-form-field" style={{ marginTop: 12 }}>
              <label>¿Cómo se saldó?</label>
              <input value={f.nota} onChange={(e) => set("nota", e.target.value)} placeholder="Se pagó, se cruzó en cuenta…" />
            </div>
          )}

          <p className="adf-note" style={{ marginTop: 12 }}>
            {sinDevolucion
              ? "No se mueve existencia: lo prestado quedó consumido."
              : "Si volvió solo una parte, anotá cuánto y el préstamo sigue abierto por el resto."}
          </p>
        </div>
      </div>
    </div>
  );
}
