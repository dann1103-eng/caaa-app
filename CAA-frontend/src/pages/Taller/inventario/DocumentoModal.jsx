import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  crearDocumento, getAeronavesBodega, getMantenimientosAeronave,
} from "../../../services/tallerApi";
import ItemPicker from "./ItemPicker";
import { fmt, hoy, META_TIPO } from "./formato";

const VACIO = { item: null, cantidad: "", costo_unitario: "", nota: "" };

/**
 * Alta de un documento de bodega: entrada (FA), salida (REQ) o ajuste (AJ).
 *
 * El correlativo lo pone el servidor. En el AJUSTE la cantidad que se teclea es
 * la EXISTENCIA CONTADA, no un delta: el servidor calcula la diferencia contra
 * el sistema (así el mecánico escribe lo que ve en el estante).
 */
export default function DocumentoModal({ tipo, onClose, onGuardado }) {
  const meta = META_TIPO[tipo];
  const [cab, setCab] = useState({
    fecha: hoy(), proveedor: "", factura_no: "",
    id_aeronave: "", motivo: "", origen_mant: "", nota: "",
  });
  const [lineas, setLineas] = useState([{ ...VACIO }]);
  const [aeronaves, setAeronaves] = useState([]);
  const [mants, setMants] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [faltantes, setFaltantes] = useState(null);
  const [forzable, setForzable] = useState(false);
  const [motivoForzado, setMotivoForzado] = useState("");

  useEffect(() => {
    if (tipo === "SALIDA") getAeronavesBodega().then(setAeronaves).catch(() => {});
  }, [tipo]);

  useEffect(() => {
    if (tipo !== "SALIDA" || !cab.id_aeronave) { setMants([]); return; }
    getMantenimientosAeronave(cab.id_aeronave).then(setMants).catch(() => setMants([]));
  }, [tipo, cab.id_aeronave]);

  const setC = (k, v) => setCab((p) => ({ ...p, [k]: v }));
  const setL = (i, k, v) => setLineas((p) => p.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const quitar = (i) => setLineas((p) => (p.length === 1 ? [{ ...VACIO }] : p.filter((_, j) => j !== i)));

  const llenas = lineas.filter((l) => l.item && l.cantidad !== "");
  const total = llenas.reduce(
    (s, l) => s + (l.costo_unitario === "" ? 0 : Number(l.cantidad) * Number(l.costo_unitario)), 0
  );

  const enviar = async (forzar = false) => {
    if (!llenas.length) return toast.error("Agregá al menos un renglón con ítem y cantidad");
    if (tipo === "SALIDA" && !cab.id_aeronave) return toast.error("Elegí la aeronave");
    if (tipo === "AJUSTE" && !cab.motivo.trim()) return toast.error("Escribí el motivo del ajuste");
    if (forzar && !motivoForzado.trim()) return toast.error("Escribí por qué se fuerza la salida");

    // El selector de mantenimiento devuelve "CUMPLIMIENTO:12" o "MANTENIMIENTO:7".
    const [origen, idOrigen] = (cab.origen_mant || "").split(":");

    setGuardando(true);
    try {
      const r = await crearDocumento({
        tipo,
        fecha: cab.fecha || null,
        nota: cab.nota || null,
        proveedor: cab.proveedor || null,
        factura_no: cab.factura_no || null,
        id_aeronave: cab.id_aeronave ? Number(cab.id_aeronave) : null,
        motivo: cab.motivo || null,
        id_cumplimiento: origen === "CUMPLIMIENTO" ? Number(idOrigen) : null,
        id_mantenimiento: origen === "MANTENIMIENTO" ? Number(idOrigen) : null,
        renglones: llenas.map((l) => ({
          id_repuesto: l.item.id_repuesto,
          cantidad: Number(l.cantidad),
          costo_unitario: l.costo_unitario === "" ? null : Number(l.costo_unitario),
          nota: l.nota || null,
        })),
        forzar,
        motivo_forzado: forzar ? motivoForzado : null,
      });
      toast.success(`${meta.label} ${r.documento.correlativo} registrada`);
      onGuardado();
    } catch (err) {
      const res = err.response;
      if (res?.status === 409 && res.data?.faltantes) {
        // No alcanza la existencia. Solo quien tenga la capacidad de jefe de
        // taller puede pasar el bloqueo, y escribiendo por qué.
        setFaltantes(res.data.faltantes);
        setForzable(!!res.data.forzable);
        toast.error(res.data.message || "No hay existencia suficiente");
      } else {
        toast.error(res?.data?.message || "No se pudo registrar el documento");
      }
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="adf-modal-backdrop" onClick={onClose}>
      <div className="adf-card adf-modal-card" style={{ padding: 0, maxWidth: 940 }} onClick={(e) => e.stopPropagation()}>
        <div className="adf-edit-head">
          <span className="adf-edit-head__title">
            <span className="adf-edit-head__chip"><i className={`bi ${meta.icon}`}></i></span>
            Nueva {meta.label.toLowerCase()} de bodega
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="adf-btn" disabled={guardando} onClick={() => enviar(false)}>
              <i className="bi bi-check"></i>Registrar
            </button>
            <button type="button" className="adf-btn secondary" onClick={onClose}>Cerrar</button>
          </div>
        </div>

        <div style={{ padding: "0 var(--sp-5) var(--sp-5)" }}>
          <div className="adf-form-grid">
            <div className="adf-form-field">
              <label>Fecha</label>
              <input type="date" value={cab.fecha} onChange={(e) => setC("fecha", e.target.value)} />
            </div>

            {tipo === "ENTRADA" && (
              <>
                <div className="adf-form-field">
                  <label>Proveedor</label>
                  <input value={cab.proveedor} onChange={(e) => setC("proveedor", e.target.value)} />
                </div>
                <div className="adf-form-field">
                  <label>N° de factura</label>
                  <input value={cab.factura_no} onChange={(e) => setC("factura_no", e.target.value)} placeholder="El de la factura del proveedor" />
                </div>
              </>
            )}

            {tipo === "SALIDA" && (
              <>
                <div className="adf-form-field">
                  <label>Aeronave</label>
                  <select value={cab.id_aeronave} onChange={(e) => setC("id_aeronave", e.target.value)}>
                    <option value="">— Elegir —</option>
                    {aeronaves.map((a) => (
                      <option key={a.id_aeronave} value={a.id_aeronave}>
                        {a.codigo}{a.es_externa ? " (tercero)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="adf-form-field">
                  <label>Mantenimiento (opcional)</label>
                  <select value={cab.origen_mant} onChange={(e) => setC("origen_mant", e.target.value)} disabled={!cab.id_aeronave}>
                    <option value="">— Ninguno, solo el motivo —</option>
                    {mants.map((m) => (
                      <option key={`${m.origen}:${m.id}`} value={`${m.origen}:${m.id}`}>
                        {String(m.fecha).slice(0, 10)} · {m.etiqueta}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div className="adf-form-field" style={{ gridColumn: "1 / -1" }}>
              <label>{tipo === "AJUSTE" ? "Motivo del ajuste" : "Motivo / trabajo"}</label>
              <input
                value={cab.motivo}
                onChange={(e) => setC("motivo", e.target.value)}
                placeholder={tipo === "SALIDA" ? "Ej. Inspección de 50 horas" : tipo === "AJUSTE" ? "Ej. Conteo físico de bodega" : "Opcional"}
              />
            </div>
          </div>

          <h4 style={{ fontSize: "0.9rem", margin: "var(--sp-4) 0 var(--sp-2)" }}>Renglones</h4>
          <div className="adf-table-wrap">
            <table className="adf-table inv-renglones">
              <thead>
                <tr>
                  <th style={{ width: "45%" }}>Ítem</th>
                  <th style={{ width: 130 }} className="amount">
                    {tipo === "AJUSTE" ? "Existencia contada" : "Cantidad"}
                  </th>
                  {tipo === "ENTRADA" && <th style={{ width: 130 }} className="amount">Costo u.</th>}
                  <th>Nota</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <ItemPicker
                        valor={l.item}
                        autoFocus={i === 0}
                        onElegir={(it) => {
                          setL(i, "item", it);
                          // Agrega una fila vacía al final para seguir cargando sin clics.
                          if (it && i === lineas.length - 1) setLineas((p) => [...p, { ...VACIO }]);
                        }}
                      />
                      {l.item && (
                        <div style={{ fontSize: "0.75rem", color: "var(--c-ink-3)", marginTop: 2 }}>
                          Existencia: {fmt(l.item.stock_actual, 0)} {l.item.unidad}
                        </div>
                      )}
                    </td>
                    <td><input type="number" step="0.01" min="0" value={l.cantidad} onChange={(e) => setL(i, "cantidad", e.target.value)} /></td>
                    {tipo === "ENTRADA" && (
                      <td><input type="number" step="0.0001" min="0" value={l.costo_unitario} onChange={(e) => setL(i, "costo_unitario", e.target.value)} placeholder="opcional" /></td>
                    )}
                    <td><input value={l.nota} onChange={(e) => setL(i, "nota", e.target.value)} /></td>
                    <td>
                      <button type="button" className="adf-icon-btn" title="Quitar" onClick={() => quitar(i)}>
                        <i className="bi bi-trash"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {tipo === "ENTRADA" && (
            <p className="adf-note" style={{ marginTop: 12 }}>
              {total > 0 ? (
                <>Total <strong>${total.toFixed(2)}</strong>. Al registrar se crea el egreso en Contabilidad (categoría REPUESTOS).</>
              ) : (
                <>Sin costo no se genera egreso: la entrada queda en <strong>Costos pendientes</strong> para que Taller y Contabilidad la completen después.</>
              )}
            </p>
          )}
          {tipo === "AJUSTE" && (
            <p className="adf-note" style={{ marginTop: 12 }}>
              Escribí la existencia que contaste en bodega. El sistema guarda la diferencia contra lo que tenía registrado.
            </p>
          )}

          {faltantes && (
            <div className="inv-faltantes">
              <h4><i className="bi bi-exclamation-triangle"></i> No hay existencia suficiente</h4>
              <ul>
                {faltantes.map((x) => (
                  <li key={x.id_repuesto}>
                    <strong>{x.codigo}</strong> {x.descripcion}: hay {fmt(x.disponible, 0)} {x.unidad},
                    se piden {fmt(x.solicitado, 0)} (faltan {fmt(x.faltan, 0)})
                  </li>
                ))}
              </ul>
              {forzable ? (
                <>
                  <div className="adf-form-field">
                    <label>Motivo para registrarla igual</label>
                    <input
                      value={motivoForzado}
                      onChange={(e) => setMotivoForzado(e.target.value)}
                      placeholder="Ej. la factura del repuesto aún no llega a oficina"
                    />
                  </div>
                  <button type="button" className="adf-btn danger small" style={{ marginTop: 8 }} disabled={guardando} onClick={() => enviar(true)}>
                    Registrar de todos modos
                  </button>
                </>
              ) : (
                <p style={{ fontSize: "0.85rem", margin: 0 }}>
                  Registrá primero la entrada que falta, o pedile a un jefe de taller que autorice la salida.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
