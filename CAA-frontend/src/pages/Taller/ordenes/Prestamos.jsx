import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getPrestamos } from "../../../services/tallerApi";
import PrestamoModal from "./PrestamoModal";
import DevolverPrestamoModal from "./DevolverPrestamoModal";
import { fecha, fmt } from "../inventario/formato";

const DIR = {
  RECIBIDO: { label: "Nos prestaron", icono: "bi-box-arrow-in-down", tag: "green" },
  ENTREGADO: { label: "Prestamos", icono: "bi-box-arrow-up", tag: "" },
};

/**
 * Bitácora de préstamos entre talleres del aeropuerto.
 *
 * Reemplaza la hoja corrida del papel, donde la dirección y la contraparte iban
 * embebidas en la celda del solicitante y el estado se escribía a mano.
 */
export default function Prestamos() {
  const [prestamos, setPrestamos] = useState([]);
  const [f, setF] = useState({ q: "", estado: "PENDIENTE", direccion: "" });
  const [cargando, setCargando] = useState(true);
  const [nuevo, setNuevo] = useState(false);
  const [devolviendo, setDevolviendo] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setPrestamos(await getPrestamos(f));
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudieron cargar los préstamos");
    } finally {
      setCargando(false);
    }
  }, [f]);

  useEffect(() => {
    const t = setTimeout(cargar, 250);
    return () => clearTimeout(t);
  }, [cargar]);

  const vencidos = prestamos.filter((p) => p.vencido).length;

  return (
    <>
      <button className="inv-accion" onClick={() => setNuevo(true)}>
        <i className="bi bi-arrow-left-right"></i>
        <span>Registrar préstamo</span>
      </button>
      <p className="inv-ayuda">
        Lo que se presta entre talleres del aeropuerto, en las dos direcciones. Si la pieza está en
        el catálogo, el préstamo mueve la existencia.
      </p>

      {vencidos > 0 && (
        <div className="inv-faltantes" style={{ marginBottom: "var(--sp-4)" }}>
          <h4>
            <i className="bi bi-clock-history"></i>{" "}
            {vencidos === 1 ? "1 préstamo vencido" : `${vencidos} préstamos vencidos`}
          </h4>
          <p style={{ fontSize: "0.85rem", margin: 0 }}>
            Pasó la fecha comprometida, o llevan más de un mes afuera sin fecha.
          </p>
        </div>
      )}

      <div className="adf-card">
        <div className="inv-filtros">
          <div className="inv-buscador">
            <label>Buscar</label>
            <input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="N°, taller o quién pidió" />
          </div>
          <div>
            <label>Estado</label>
            <select value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })}>
              <option value="PENDIENTE">Pendientes</option>
              <option value="DEVUELTO">Devueltos</option>
              <option value="">Todos</option>
            </select>
          </div>
          <div>
            <label>Dirección</label>
            <select value={f.direccion} onChange={(e) => setF({ ...f, direccion: e.target.value })}>
              <option value="">Las dos</option>
              <option value="ENTREGADO">Prestamos nosotros</option>
              <option value="RECIBIDO">Nos prestaron</option>
            </select>
          </div>
        </div>

        {cargando ? (
          <p style={{ color: "var(--c-ink-3)" }}>Cargando…</p>
        ) : prestamos.length === 0 ? (
          <p style={{ color: "var(--c-ink-3)", fontSize: "0.9rem" }}>No hay préstamos con ese filtro.</p>
        ) : (
          <div className="adf-table-wrap">
            <table className="adf-table">
              <thead>
                <tr>
                  <th>N°</th><th>Dirección</th><th>Taller</th><th>Entrega</th>
                  <th>Compromiso</th><th>Estado</th><th className="amount">Ítems</th><th></th>
                </tr>
              </thead>
              <tbody>
                {prestamos.map((p) => {
                  const dir = DIR[p.direccion] || {};
                  return (
                    <tr key={p.id_prestamo} className={p.vencido ? "inv-fila--negativo" : ""}>
                      <td className="inv-codigo">{p.correlativo}</td>
                      <td>
                        <span className={`adf-tag ${dir.tag}`}>
                          <i className={`bi ${dir.icono}`}></i> {dir.label}
                        </span>
                      </td>
                      <td>{p.contraparte}</td>
                      <td>{fecha(p.fecha_entrega)}</td>
                      <td>
                        {p.fecha_compromiso ? fecha(p.fecha_compromiso) : <span style={{ color: "var(--c-ink-4)" }}>sin fecha</span>}
                        {p.vencido && <span className="adf-tag red" style={{ marginLeft: 6 }}>Vencido</span>}
                      </td>
                      <td><span className="adf-tag">{p.estado}</span></td>
                      <td className="amount">{p.lineas}</td>
                      <td>
                        {p.estado === "PENDIENTE" && (
                          <button className="adf-btn small secondary" onClick={() => setDevolviendo(p)}>
                            Devolución
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {nuevo && <PrestamoModal onClose={() => setNuevo(false)} onGuardado={() => { setNuevo(false); cargar(); }} />}
      {devolviendo && (
        <DevolverPrestamoModal
          prestamo={devolviendo}
          onClose={() => setDevolviendo(null)}
          onGuardado={() => { setDevolviendo(null); cargar(); }}
        />
      )}
    </>
  );
}
