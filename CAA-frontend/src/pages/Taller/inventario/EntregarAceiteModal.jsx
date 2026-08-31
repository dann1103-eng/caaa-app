import { useEffect, useState } from "react";
import { toast } from "sonner";
import { crearDocumento, getAeronavesBodega } from "../../../services/tallerApi";
import { fmt, hoy } from "./formato";

/**
 * Entrega de aceite de mostrador.
 *
 * Es el caso más frecuente del taller y el que más fricción tenía: el instructor
 * llega, pide un cuarto para tal avión y se va. No hay orden de trabajo ni
 * requisición de por medio, así que este formulario pide lo mínimo — aceite,
 * cuántos, para qué avión y quién lo recibe — y por debajo crea la salida normal
 * de bodega, que es la que descuenta y alimenta el kardex.
 */
export default function EntregarAceiteModal({ aceites, onClose, onGuardado }) {
  const [aeronaves, setAeronaves] = useState([]);
  const [f, setF] = useState({
    id_repuesto: aceites[0]?.id_repuesto || "",
    cantidad: "1",
    id_aeronave: "",
    entregado_a: "",
    motivo: "Servicio de aceite de motor",
  });
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => { getAeronavesBodega().then(setAeronaves).catch(() => {}); }, []);

  const elegido = aceites.find((a) => String(a.id_repuesto) === String(f.id_repuesto));

  const guardar = async () => {
    const c = Number(f.cantidad);
    if (!f.id_repuesto) return toast.error("Elegí el aceite");
    if (!c || c <= 0) return toast.error("Poné cuántos vas a entregar");
    if (!f.id_aeronave) return toast.error("Elegí el avión");
    setGuardando(true);
    try {
      const aero = aeronaves.find((a) => String(a.id_aeronave) === String(f.id_aeronave));
      const r = await crearDocumento({
        tipo: "SALIDA",
        fecha: hoy(),
        id_aeronave: Number(f.id_aeronave),
        entregado_a: f.entregado_a || null,
        // El concepto queda como en el cuaderno: trabajo + matrícula.
        motivo: `${f.motivo} ${aero?.codigo || ""}`.trim(),
        renglones: [{ id_repuesto: Number(f.id_repuesto), cantidad: c }],
      });
      toast.success(`Entregado · ${r.documento.correlativo}`);
      onGuardado();
    } catch (err) {
      const d = err.response?.data;
      // Sin existencia el servidor responde 409; acá no se ofrece forzar, se
      // manda a la pantalla que sí sabe hacerlo.
      if (err.response?.status === 409 && d?.faltantes) {
        const x = d.faltantes[0];
        toast.error(`Solo quedan ${fmt(x.disponible, 0)} ${x.unidad} de ${x.descripcion}. Registrá la entrada o pedile al jefe de taller que lo autorice desde Salidas.`);
      } else {
        toast.error(d?.message || "No se pudo registrar la entrega");
      }
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="adf-modal-backdrop" onClick={onClose}>
      <div className="adf-card adf-modal-card" style={{ padding: 0, maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="adf-edit-head">
          <span className="adf-edit-head__title">
            <span className="adf-edit-head__chip"><i className="bi bi-droplet-half"></i></span>
            Entregar aceite
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="adf-btn" disabled={guardando} onClick={guardar}><i className="bi bi-check"></i>Entregar</button>
            <button type="button" className="adf-btn secondary" onClick={onClose}>Cerrar</button>
          </div>
        </div>

        <div style={{ padding: "0 var(--sp-5) var(--sp-5)" }}>
          <div className="adf-form-field">
            <label>Aceite</label>
            <select value={f.id_repuesto} onChange={(e) => set("id_repuesto", e.target.value)}>
              {aceites.map((a) => (
                <option key={a.id_repuesto} value={a.id_repuesto}>
                  {a.descripcion} — quedan {fmt(a.stock_actual, 0)} {a.unidad}
                </option>
              ))}
            </select>
          </div>

          <div className="adf-form-field" style={{ marginTop: 12 }}>
            <label>¿Cuántos {elegido?.unidad === "QT" ? "cuartos" : "unidades"}?</label>
            <input
              type="number" step="1" min="1" inputMode="numeric"
              value={f.cantidad} onChange={(e) => set("cantidad", e.target.value)}
              style={{ fontSize: "1.4rem", textAlign: "center", padding: "10px" }}
            />
          </div>

          <div className="adf-form-field" style={{ marginTop: 12 }}>
            <label>¿Para qué avión?</label>
            <select value={f.id_aeronave} onChange={(e) => set("id_aeronave", e.target.value)}>
              <option value="">— Elegir —</option>
              {aeronaves.map((a) => (
                <option key={a.id_aeronave} value={a.id_aeronave}>
                  {a.codigo}{a.es_externa ? " (tercero)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="adf-form-field" style={{ marginTop: 12 }}>
            <label>¿Quién lo recibe?</label>
            <input
              value={f.entregado_a} onChange={(e) => set("entregado_a", e.target.value)}
              placeholder="Nombre del instructor o mecánico"
            />
          </div>

          <div className="adf-form-field" style={{ marginTop: 12 }}>
            <label>Concepto</label>
            <input value={f.motivo} onChange={(e) => set("motivo", e.target.value)} />
          </div>

          {elegido && Number(elegido.stock_actual) <= 0 && (
            <p className="adf-note" style={{ marginTop: 12, color: "var(--c-danger-700)" }}>
              Ese aceite está en <strong>{fmt(elegido.stock_actual, 0)}</strong> en el sistema. Faltan
              entradas por digitar: registralas primero, o que el jefe de taller autorice la salida.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
