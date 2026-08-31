import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  crearDocumento, editarRequisicion, getAeronavesBodega,
  getMantenimientosAeronave, getDocumento, getRetornables,
} from "../../../services/tallerApi";
import ItemPicker from "./ItemPicker";
import { fmt, hoy, META_TIPO } from "./formato";

const VACIO = { item: null, cantidad: "", costo_unitario: "", nota: "" };

// El taller es una OMA de la propia escuela: salvo que el avión sea de un
// tercero, el cliente es siempre este. Se precarga y se puede cambiar.
const CLIENTE_PROPIO = "CAAA / OMA";
// Quien está llenando el papel es quien tiene la sesión abierta.
const yo = () => {
  try {
    const u = JSON.parse(localStorage.getItem("user") || "{}");
    return [u.nombre, u.apellido].filter(Boolean).join(" ").trim();
  } catch { return ""; }
};

/**
 * Alta de un documento de bodega.
 *
 *   REQUISICION  borrador del técnico · NO mueve stock · editable
 *   ENTRADA      compra · genera el egreso si trae costo
 *   SALIDA       la Solicitud al almacén CAAA-004-F · descarga el inventario
 *   RETORNO      los sobrantes que vuelven · apunta a su solicitud
 *   AJUSTE       la cantidad es la EXISTENCIA CONTADA; el servidor saca el delta
 *
 * `desde` precarga desde otro documento: una requisición al despacharla, o una
 * solicitud al registrar su retorno.
 */
export default function DocumentoModal({ tipo, desde, editar, contexto, onClose, onGuardado }) {
  const meta = META_TIPO[tipo];
  const esReq = tipo === "REQUISICION";
  const esSol = tipo === "SALIDA";
  const esRet = tipo === "RETORNO";
  const esEnt = tipo === "ENTRADA";
  const esAju = tipo === "AJUSTE";

  const [cab, setCab] = useState({
    fecha: hoy(), proveedor: "", factura_no: "",
    id_aeronave: "", motivo: "", origen_mant: "", nota: "",
    // El papel se llena solo donde el sistema ya sabe la respuesta: el cliente
    // es la propia escuela salvo que el avión sea de un tercero, y el
    // solicitante es quien tiene la sesión abierta. Los dos quedan editables.
    cliente: CLIENTE_PROPIO, solicitante: yo(), tacometro: "", observaciones: "",
    orden_trabajo_no: "", numero_solicitud: "", entregado_por: "", entregado_a: "",
  });
  const [lineas, setLineas] = useState([{ ...VACIO }]);
  const [retornables, setRetornables] = useState(null); // solo RETORNO
  const [aeronaves, setAeronaves] = useState([]);
  const [mants, setMants] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [faltantes, setFaltantes] = useState(null);
  const [forzable, setForzable] = useState(false);
  const [motivoForzado, setMotivoForzado] = useState("");

  useEffect(() => {
    if (esSol || esReq || esRet) getAeronavesBodega().then(setAeronaves).catch(() => {});
  }, [esSol, esReq, esRet]);

  // Contexto del trabajo en curso (pantalla del técnico): el avión, el
  // tacómetro y la orden ya vienen puestos y no se vuelven a preguntar. Es lo
  // que en papel obliga a escribir el tacómetro tres veces.
  useEffect(() => {
    if (!contexto) return;
    setCab((p) => ({
      ...p,
      id_aeronave: contexto.id_aeronave ?? p.id_aeronave,
      tacometro: contexto.tacometro ?? p.tacometro,
      orden_trabajo_no: contexto.orden_trabajo_no ?? p.orden_trabajo_no,
      motivo: contexto.motivo ?? p.motivo,
    }));
  }, [contexto]);

  // El N° de solicitud del papel son los últimos 4 dígitos de la orden de trabajo
  // (CAAA/2026-0001 -> 0001). Si ya se sabe la orden, no hay que teclearlo; solo
  // se rellena cuando está vacío, para no pisar lo que alguien haya escrito.
  useEffect(() => {
    const m = String(cab.orden_trabajo_no || "").match(/(\d{3,})\s*$/);
    if (!m) return;
    setCab((p) => (p.numero_solicitud ? p : { ...p, numero_solicitud: m[1] }));
  }, [cab.orden_trabajo_no]);

  useEffect(() => {
    if (!esSol || !cab.id_aeronave) { setMants([]); return; }
    getMantenimientosAeronave(cab.id_aeronave).then(setMants).catch(() => setMants([]));
  }, [esSol, cab.id_aeronave]);

  // Precarga: despachar una requisición, o editar una que aún no se despachó.
  useEffect(() => {
    const origen = desde || editar;
    if (!origen) return;
    getDocumento(origen.id_documento).then(({ documento: d, renglones }) => {
      setCab((p) => ({
        ...p,
        fecha: editar ? String(d.fecha).slice(0, 10) : hoy(),
        id_aeronave: d.id_aeronave || "",
        cliente: d.cliente || CLIENTE_PROPIO, solicitante: d.solicitante || yo(),
        tacometro: d.tacometro ?? "", motivo: d.motivo || "",
        observaciones: d.observaciones || "", nota: d.nota || "",
        // El N° de solicitud son los últimos 4 dígitos de la orden de trabajo.
        numero_solicitud: d.numero_solicitud || "",
        orden_trabajo_no: d.orden_trabajo_no || "",
      }));
      setLineas([
        ...renglones.map((r) => ({
          item: { id_repuesto: r.id_repuesto, codigo: r.codigo, descripcion: r.descripcion, unidad: r.unidad, stock_actual: 0 },
          cantidad: String(Math.abs(Number(r.cantidad))),
          costo_unitario: "", nota: r.nota || "",
        })),
        { ...VACIO },
      ]);
    }).catch(() => toast.error("No se pudo precargar el documento"));
  }, [desde, editar]);

  // Retorno: los renglones salen de lo que queda por devolver, no se eligen.
  useEffect(() => {
    if (!esRet || !desde) return;
    getRetornables(desde.id_documento).then((r) => {
      setRetornables(r);
      setLineas(r.items.filter((x) => x.retornable > 0).map((x) => ({
        item: { id_repuesto: x.id_repuesto, codigo: x.codigo, descripcion: x.descripcion, unidad: x.unidad },
        cantidad: "", maximo: x.retornable, salio: x.salio, devuelto: x.devuelto,
      })));
    }).catch(() => toast.error("No se pudo leer la solicitud"));
  }, [esRet, desde]);

  const setC = (k, v) => setCab((p) => ({ ...p, [k]: v }));
  const setL = (i, k, v) => setLineas((p) => p.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const quitar = (i) => setLineas((p) => (p.length === 1 ? [{ ...VACIO }] : p.filter((_, j) => j !== i)));

  const llenas = lineas.filter((l) => l.item && l.cantidad !== "" && Number(l.cantidad) > 0);
  const total = llenas.reduce(
    (s, l) => s + (l.costo_unitario === "" ? 0 : Number(l.cantidad) * Number(l.costo_unitario)), 0
  );

  const enviar = async (forzar = false) => {
    if (!llenas.length) return toast.error("Agregá al menos un renglón con ítem y cantidad");
    if (esSol && !cab.id_aeronave) return toast.error("Elegí la aeronave");
    if (esAju && !cab.motivo.trim()) return toast.error("Escribí el motivo del ajuste");
    if (forzar && !motivoForzado.trim()) return toast.error("Escribí por qué se fuerza la salida");
    // Excedente atajado en el cliente para no gastar un viaje al servidor.
    const pasado = esRet && lineas.find((l) => l.maximo != null && Number(l.cantidad || 0) > l.maximo);
    if (pasado) return toast.error(`${pasado.item.descripcion}: solo se pueden devolver ${fmt(pasado.maximo, 0)}`);

    const [origen, idOrigen] = (cab.origen_mant || "").split(":");
    const payload = {
      tipo,
      fecha: cab.fecha || null,
      nota: cab.nota || null,
      id_aeronave: cab.id_aeronave ? Number(cab.id_aeronave) : null,
      motivo: cab.motivo || null,
      cliente: cab.cliente || null,
      solicitante: cab.solicitante || null,
      tacometro: cab.tacometro === "" ? null : Number(cab.tacometro),
      observaciones: cab.observaciones || null,
      proveedor: cab.proveedor || null,
      factura_no: cab.factura_no || null,
      orden_trabajo_no: cab.orden_trabajo_no || null,
      numero_solicitud: cab.numero_solicitud || null,
      entregado_por: cab.entregado_por || null,
      entregado_a: cab.entregado_a || null,
      id_requisicion: esSol && desde ? desde.id_documento : null,
      id_solicitud_origen: esRet && desde ? desde.id_documento : null,
      id_orden_trabajo: contexto?.id_orden_trabajo || null,
      id_cumplimiento: origen === "CUMPLIMIENTO" ? Number(idOrigen) : null,
      id_mantenimiento: origen === "MANTENIMIENTO" ? Number(idOrigen) : null,
      renglones: llenas.map((l) => ({
        id_repuesto: l.item.id_repuesto,
        cantidad: Number(l.cantidad),
        costo_unitario: l.costo_unitario === "" || l.costo_unitario == null ? null : Number(l.costo_unitario),
        nota: l.nota || null,
      })),
      forzar,
      motivo_forzado: forzar ? motivoForzado : null,
    };

    setGuardando(true);
    try {
      if (editar) {
        await editarRequisicion(editar.id_documento, payload);
        toast.success("Requisición actualizada");
      } else {
        const r = await crearDocumento(payload);
        toast.success(`${meta.label} ${r.documento.correlativo} registrada`);
      }
      onGuardado();
    } catch (err) {
      const res = err.response;
      if (res?.status === 409 && res.data?.faltantes) {
        setFaltantes(res.data.faltantes);
        setForzable(!!res.data.forzable);
        toast.error(res.data.message || "No hay existencia suficiente");
      } else if (res?.status === 400 && res.data?.excedidos) {
        toast.error(res.data.message);
      } else {
        toast.error(res?.data?.message || "No se pudo registrar el documento");
      }
    } finally {
      setGuardando(false);
    }
  };

  const titulo = editar
    ? `Editar ${META_TIPO.REQUISICION.label.toLowerCase()} ${editar.correlativo}`
    : esSol && desde ? `Despachar ${desde.correlativo}`
    : esRet && desde ? `Retorno de sobrantes · ${desde.correlativo}`
    : `Nueva ${meta.label.toLowerCase()} de bodega`;

  return (
    <div className="adf-modal-backdrop" onClick={onClose}>
      <div className="adf-card adf-modal-card" style={{ padding: 0, maxWidth: 960 }} onClick={(e) => e.stopPropagation()}>
        <div className="adf-edit-head">
          <span className="adf-edit-head__title">
            <span className="adf-edit-head__chip"><i className={`bi ${meta.icon}`}></i></span>
            {titulo}
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="adf-btn" disabled={guardando} onClick={() => enviar(false)}>
              <i className="bi bi-check"></i>{editar ? "Guardar" : "Registrar"}
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

            {esEnt && (
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

            {(esSol || esReq || esRet) && (
              <div className="adf-form-field">
                <label>Aeronave{esSol ? "" : " (opcional)"}</label>
                <select value={cab.id_aeronave} onChange={(e) => setC("id_aeronave", e.target.value)}>
                  <option value="">— Elegir —</option>
                  {aeronaves.map((a) => (
                    <option key={a.id_aeronave} value={a.id_aeronave}>
                      {a.codigo}{a.es_externa ? " (tercero)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(esSol || esReq) && (
              <>
                <div className="adf-form-field">
                  <label>Cliente</label>
                  <input value={cab.cliente} onChange={(e) => setC("cliente", e.target.value)} placeholder="CAAA / OMA, o el dueño del avión" />
                </div>
                <div className="adf-form-field">
                  <label>Solicitante</label>
                  <input value={cab.solicitante} onChange={(e) => setC("solicitante", e.target.value)} placeholder="Quién pide el material" />
                </div>
                <div className="adf-form-field">
                  <label>Tacómetro</label>
                  <input type="number" step="0.01" value={cab.tacometro} onChange={(e) => setC("tacometro", e.target.value)} placeholder="8271.00" />
                </div>
              </>
            )}

            {esSol && (
              <>
                <div className="adf-form-field">
                  <label>N° de orden de trabajo</label>
                  <input
                    value={cab.orden_trabajo_no}
                    onChange={(e) => {
                      const v = e.target.value;
                      // El N° de solicitud son los últimos 4 dígitos de la OT.
                      const m = v.match(/(\d{3,4})\s*$/);
                      setCab((p) => ({ ...p, orden_trabajo_no: v, numero_solicitud: m ? m[1] : p.numero_solicitud }));
                    }}
                    placeholder="CAAA/2026-0049"
                  />
                </div>
                <div className="adf-form-field">
                  <label>N° de solicitud</label>
                  <input value={cab.numero_solicitud} onChange={(e) => setC("numero_solicitud", e.target.value)} placeholder="0049" />
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
                <div className="adf-form-field">
                  <label>Entrega (bodega)</label>
                  <input value={cab.entregado_por} onChange={(e) => setC("entregado_por", e.target.value)} />
                </div>
                <div className="adf-form-field">
                  <label>Recibe</label>
                  <input value={cab.entregado_a} onChange={(e) => setC("entregado_a", e.target.value)} placeholder="Mecánico o instructor" />
                </div>
              </>
            )}

            {esRet && (
              <div className="adf-form-field">
                <label>Recibe en bodega</label>
                <input value={cab.entregado_por} onChange={(e) => setC("entregado_por", e.target.value)} />
              </div>
            )}

            <div className="adf-form-field" style={{ gridColumn: "1 / -1" }}>
              <label>{esAju ? "Motivo del ajuste" : "Motivo / trabajo"}</label>
              <input
                value={cab.motivo}
                onChange={(e) => setC("motivo", e.target.value)}
                placeholder={esSol || esReq ? "Ej. Inspección de 100 horas" : esAju ? "Ej. Conteo físico de bodega" : "Opcional"}
              />
            </div>

            {esReq && (
              <div className="adf-form-field" style={{ gridColumn: "1 / -1" }}>
                <label>Observaciones y correcciones</label>
                <textarea rows={3} value={cab.observaciones} onChange={(e) => setC("observaciones", e.target.value)} />
              </div>
            )}
          </div>

          <h4 style={{ fontSize: "0.9rem", margin: "var(--sp-4) 0 var(--sp-2)" }}>
            {esRet ? "Partes para retornar al almacén" : "Renglones"}
          </h4>

          {esRet && retornables && lineas.length === 0 ? (
            <p className="adf-note">De esta solicitud ya se devolvió todo lo que se podía.</p>
          ) : (
            <div className="adf-table-wrap">
              <table className="adf-table inv-renglones">
                <thead>
                  <tr>
                    <th style={{ width: esRet ? "40%" : "45%" }}>Ítem</th>
                    {esRet && <th className="amount">Salió</th>}
                    {esRet && <th className="amount">Ya volvió</th>}
                    <th style={{ width: 130 }} className="amount">
                      {esAju ? "Existencia contada" : esRet ? "Devolver" : "Cantidad"}
                    </th>
                    {esEnt && <th style={{ width: 130 }} className="amount">Costo u.</th>}
                    {!esRet && <th>Nota</th>}
                    {!esRet && <th style={{ width: 40 }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l, i) => (
                    <tr key={i}>
                      <td>
                        {esRet ? (
                          <span><span className="inv-codigo">{l.item.codigo}</span> {l.item.descripcion}</span>
                        ) : (
                          <>
                            <ItemPicker
                              valor={l.item}
                              autoFocus={i === 0 && !desde && !editar}
                              onElegir={(it) => {
                                setL(i, "item", it);
                                if (it && i === lineas.length - 1) setLineas((p) => [...p, { ...VACIO }]);
                              }}
                            />
                            {l.item && l.item.stock_actual != null && (
                              <div style={{ fontSize: "0.75rem", color: "var(--c-ink-3)", marginTop: 2 }}>
                                Existencia: {fmt(l.item.stock_actual, 0)} {l.item.unidad}
                              </div>
                            )}
                          </>
                        )}
                      </td>
                      {esRet && <td className="amount">{fmt(l.salio, 0)}</td>}
                      {esRet && <td className="amount">{fmt(l.devuelto, 0)}</td>}
                      <td>
                        <input
                          type="number" step="0.01" min="0" max={l.maximo ?? undefined}
                          value={l.cantidad} onChange={(e) => setL(i, "cantidad", e.target.value)}
                          placeholder={esRet ? `máx ${fmt(l.maximo, 0)}` : ""}
                        />
                      </td>
                      {esEnt && (
                        <td><input type="number" step="0.0001" min="0" value={l.costo_unitario} onChange={(e) => setL(i, "costo_unitario", e.target.value)} placeholder="opcional" /></td>
                      )}
                      {!esRet && <td><input value={l.nota} onChange={(e) => setL(i, "nota", e.target.value)} /></td>}
                      {!esRet && (
                        <td>
                          <button type="button" className="adf-icon-btn" title="Quitar" onClick={() => quitar(i)}>
                            <i className="bi bi-trash"></i>
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {esReq && (
            <p className="adf-note" style={{ marginTop: 12 }}>
              La requisición <strong>no descuenta existencia</strong>: es el borrador de lo que se va a
              necesitar. El stock se mueve cuando bodega la despacha.
            </p>
          )}
          {esEnt && (
            <p className="adf-note" style={{ marginTop: 12 }}>
              {total > 0
                ? <>Total <strong>${total.toFixed(2)}</strong>. Al registrar se crea el egreso en Contabilidad (categoría REPUESTOS).</>
                : <>Sin costo no se genera egreso: la entrada queda en <strong>Costos pendientes</strong>.</>}
            </p>
          )}
          {esAju && (
            <p className="adf-note" style={{ marginTop: 12 }}>
              Escribí la existencia que contaste en bodega. El sistema guarda la diferencia contra lo registrado.
            </p>
          )}
          {esRet && (
            <p className="adf-note" style={{ marginTop: 12 }}>
              El sobrante vuelve al estante con <strong>la fecha de hoy</strong>, no con la de la solicitud.
              El kardex muestra los dos movimientos por separado.
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
                    <input value={motivoForzado} onChange={(e) => setMotivoForzado(e.target.value)}
                      placeholder="Ej. la factura del repuesto aún no llega a oficina" />
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
