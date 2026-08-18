import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getDocumentos, getDocumento, anularDocumento, abrirDocumentoPDF } from "../../../services/tallerApi";
import { fmt, money, fecha, META_TIPO } from "./formato";
import DocumentoModal from "./DocumentoModal";

/** Las hojas ENTRADAS y SALIDAS del Excel, ahora navegables. */
export default function Documentos() {
  const [docs, setDocs] = useState([]);
  const [f, setF] = useState({ tipo: "", desde: "", hasta: "", q: "" });
  const [verAnulados, setVerAnulados] = useState(false);
  const [sinDespachar, setSinDespachar] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setDocs(await getDocumentos({
        ...f,
        incluir_anulados: verAnulados ? "true" : undefined,
        sin_despachar: sinDespachar ? "true" : undefined,
      }));
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudieron cargar los documentos");
    } finally {
      setCargando(false);
    }
  }, [f, verAnulados, sinDespachar]);

  useEffect(() => {
    const t = setTimeout(cargar, 250);
    return () => clearTimeout(t);
  }, [cargar]);

  return (
    <>
      <div className="adf-card">
        <div className="inv-filtros">
          <div className="inv-buscador">
            <label>Buscar</label>
            <input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Correlativo, proveedor, factura o motivo" />
          </div>
          <div>
            <label>Tipo</label>
            <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
              <option value="">Todos</option>
              <option value="REQUISICION">Requisiciones</option>
              <option value="SALIDA">Solicitudes</option>
              <option value="RETORNO">Retornos</option>
              <option value="ENTRADA">Entradas</option>
              <option value="AJUSTE">Ajustes</option>
            </select>
          </div>
          <div>
            <label>Desde</label>
            <input type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} />
          </div>
          <div>
            <label>Hasta</label>
            <input type="date" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem" }}>
            <input type="checkbox" checked={verAnulados} onChange={(e) => setVerAnulados(e.target.checked)} />
            Ver anulados
          </label>
          <button
            className={`inv-chip ${sinDespachar ? "inv-chip--on" : ""}`}
            onClick={() => setSinDespachar((v) => !v)}
            title="Lo que el técnico pidió y bodega todavía no entregó"
          >
            Requisiciones sin despachar
          </button>
        </div>

        {cargando ? (
          <p style={{ color: "var(--c-ink-3)" }}>Cargando…</p>
        ) : docs.length === 0 ? (
          <p style={{ color: "var(--c-ink-3)", fontSize: "0.9rem" }}>No hay documentos con ese filtro.</p>
        ) : (
          <div className="adf-table-wrap">
            <table className="adf-table">
              <thead>
                <tr>
                  <th>Documento</th><th>Fecha</th><th>Tipo</th><th>Detalle</th>
                  <th className="amount">Renglones</th><th className="amount">Unidades</th>
                  <th className="amount">Total</th><th>Registró</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => {
                  const meta = META_TIPO[d.tipo] || {};
                  return (
                    <tr key={d.id_documento} className={`inv-clic ${d.estado === "ANULADO" ? "inv-anulado" : ""}`} onClick={() => setAbierto(d.id_documento)}>
                      <td className="inv-codigo">{d.correlativo}</td>
                      <td>{fecha(d.fecha)}</td>
                      <td>
                        <span className={`adf-tag ${meta.tag || ""}`}>{meta.label}</span>
                        {d.tipo === "REQUISICION" && (
                          <span className="adf-tag" style={{ marginLeft: 6 }}>
                            {d.despachada ? "Despachada" : "Pendiente"}
                          </span>
                        )}
                      </td>
                      <td>
                        {d.tipo === "ENTRADA"
                          ? [d.proveedor, d.factura_no && `fact. ${d.factura_no}`].filter(Boolean).join(" · ") || <span style={{ color: "var(--c-ink-4)" }}>sin proveedor</span>
                          : [d.aeronave_codigo, d.motivo].filter(Boolean).join(" · ") || "—"}
                        {d.aeronave_externa && <span className="adf-tag" style={{ marginLeft: 6 }}>Tercero</span>}
                      </td>
                      <td className="amount">{d.renglones}</td>
                      <td className="amount">{fmt(d.unidades, 0)}</td>
                      <td className="amount">{Number(d.total) > 0 ? money(d.total) : "—"}</td>
                      <td style={{ color: "var(--c-ink-3)", fontSize: "0.82rem" }}>{d.registrado_por_nombre || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {abierto && (
        <DetalleModal id={abierto} onClose={() => setAbierto(null)} onAnulado={() => { setAbierto(null); cargar(); }} />
      )}
    </>
  );
}

function DetalleModal({ id, onClose, onAnulado }) {
  const [data, setData] = useState(null);
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false);
  const [accion, setAccion] = useState(null); // 'despachar' | 'retorno' | 'editar'

  const recargar = () => getDocumento(id).then(setData).catch(() => {});
  useEffect(() => {
    getDocumento(id).then(setData).catch((e) => toast.error(e.response?.data?.message || "No se pudo abrir"));
  }, [id]);

  const anular = async () => {
    if (!motivo.trim()) return toast.error("Escribí el motivo de la anulación");
    setAnulando(true);
    try {
      await anularDocumento(id, motivo);
      toast.success("Documento anulado; la existencia volvió a su lugar");
      onAnulado();
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudo anular");
    } finally {
      setAnulando(false);
    }
  };

  const d = data?.documento;
  const meta = d ? META_TIPO[d.tipo] : {};

  return (
    <div className="adf-modal-backdrop" onClick={onClose}>
      <div className="adf-card adf-modal-card" style={{ padding: 0, maxWidth: 860 }} onClick={(e) => e.stopPropagation()}>
        <div className="adf-edit-head">
          <span className="adf-edit-head__title">
            <span className="adf-edit-head__chip"><i className={`bi ${meta.icon || "bi-file-earmark"}`}></i></span>
            {d ? d.correlativo : "Cargando…"}
            {d?.estado === "ANULADO" && <span className="adf-tag red" style={{ marginLeft: 8 }}>Anulado</span>}
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            {/* Imprime con el formato de su tipo: la requisición interna o el
                CAAA-004-F, que además llena solo el apartado de retornos. */}
            {["REQUISICION", "SALIDA"].includes(d?.tipo) && (
              <button
                className="adf-btn secondary"
                onClick={() => abrirDocumentoPDF(id).catch(() => toast.error("No se pudo generar el PDF"))}
              >
                <i className="bi bi-printer"></i> Imprimir
              </button>
            )}
            {/* La requisición se despacha (o se corrige) mientras no tenga solicitud. */}
            {d?.tipo === "REQUISICION" && d.estado === "VIGENTE" && !data?.despachos?.length && (
              <>
                <button className="adf-btn" onClick={() => setAccion("despachar")}>
                  <i className="bi bi-box-arrow-up"></i> Despachar
                </button>
                <button className="adf-btn secondary" onClick={() => setAccion("editar")}>
                  <i className="bi bi-pencil"></i> Editar
                </button>
              </>
            )}
            {d?.tipo === "SALIDA" && d.estado === "VIGENTE" && (
              <button className="adf-btn secondary" onClick={() => setAccion("retorno")}>
                <i className="bi bi-arrow-return-left"></i> Registrar retorno
              </button>
            )}
            {d?.estado === "VIGENTE" && !pidiendoMotivo && (
              <button className="adf-btn danger" onClick={() => setPidiendoMotivo(true)}>Anular</button>
            )}
            <button type="button" className="adf-btn secondary" onClick={onClose}>Cerrar</button>
          </div>
        </div>

        <div style={{ padding: "0 var(--sp-5) var(--sp-5)" }}>
          {!d ? <p style={{ color: "var(--c-ink-3)" }}>Cargando…</p> : (
            <>
              <div className="inv-kardex__ficha">
                <Dato label="Fecha" valor={fecha(d.fecha)} />
                <Dato label="Tipo" valor={meta.label} />
                {d.tipo === "ENTRADA" && <Dato label="Proveedor" valor={d.proveedor || "—"} />}
                {d.tipo === "ENTRADA" && <Dato label="N° factura" valor={d.factura_no || "—"} />}
                {d.aeronave_codigo && <Dato label="Aeronave" valor={d.aeronave_codigo} />}
                {d.cliente && <Dato label="Cliente" valor={d.cliente} />}
                {d.tacometro != null && <Dato label="Tacómetro" valor={fmt(d.tacometro)} />}
                {d.orden_trabajo_no && <Dato label="Orden de trabajo" valor={d.orden_trabajo_no} />}
                {d.numero_solicitud && <Dato label="N° solicitud" valor={d.numero_solicitud} />}
                {d.solicitante && <Dato label="Solicitante" valor={d.solicitante} />}
                {d.entregado_por && <Dato label="Entrega" valor={d.entregado_por} />}
                {d.entregado_a && <Dato label="Recibe" valor={d.entregado_a} />}
                {d.tipo === "SALIDA" && <Dato label="Mantenimiento" valor={d.tarea_nombre || d.mantenimiento_descripcion || d.mantenimiento_tipo || "—"} />}
                <Dato label="Registró" valor={d.registrado_por_nombre || "—"} />
              </div>
              {d.motivo && <p style={{ fontSize: "0.9rem" }}><strong>Motivo:</strong> {d.motivo}</p>}
              {d.observaciones && <p style={{ fontSize: "0.9rem" }}><strong>Observaciones:</strong> {d.observaciones}</p>}

              {/* Documentos encadenados */}
              {(data.requisicion_origen || data.despachos?.length > 0 || data.retornos?.length > 0) && (
                <p className="adf-note">
                  {data.requisicion_origen && <>Nace de la requisición <strong>{data.requisicion_origen.correlativo}</strong>. </>}
                  {data.despachos?.length > 0 && <>Despachada en <strong>{data.despachos.map((x) => x.correlativo).join(", ")}</strong>. </>}
                  {data.retornos?.length > 0 && <>Retornos: <strong>{data.retornos.map((x) => `${x.correlativo}${x.estado === "ANULADO" ? " (anulado)" : ""}`).join(", ")}</strong>.</>}
                </p>
              )}
              {d.estado === "ANULADO" && (
                <p className="adf-note">Anulado por {d.anulado_por || "—"}: {d.motivo_anulacion}</p>
              )}

              <div className="adf-table-wrap">
                <table className="adf-table">
                  <thead>
                    <tr><th>Código</th><th>Descripción</th><th>N° parte</th><th className="amount">Cantidad</th><th className="amount">Costo u.</th><th className="amount">Importe</th></tr>
                  </thead>
                  <tbody>
                    {data.renglones.map((r) => (
                      <tr key={r.id_mov}>
                        <td className="inv-codigo">{r.codigo}</td>
                        <td>
                          {r.descripcion}
                          {r.forzado && <span className="adf-tag red" style={{ marginLeft: 6 }} title={r.motivo_forzado}>Forzado</span>}
                        </td>
                        <td>{r.parte_no || "—"}</td>
                        <td className="amount">{fmt(Math.abs(r.cantidad), 0)} {r.unidad}</td>
                        <td className="amount">{r.costo_unitario ? money(r.costo_unitario) : "—"}</td>
                        <td className="amount">{Number(r.importe) > 0 ? money(r.importe) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {pidiendoMotivo && (
                <div className="inv-faltantes" style={{ borderColor: "var(--c-line-2)", background: "var(--c-surface-2)" }}>
                  <h4 style={{ color: "var(--c-ink-1)" }}>Anular {d.correlativo}</h4>
                  <p style={{ fontSize: "0.85rem" }}>
                    Se devuelve la existencia de todos los renglones y el documento sale del kardex.
                    El correlativo no se reutiliza.
                    {d.id_egreso ? " También se borra el egreso que generó en Contabilidad." : ""}
                  </p>
                  <div className="adf-form-field">
                    <label>Motivo</label>
                    <input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
                  </div>
                  <button className="adf-btn danger small" style={{ marginTop: 8 }} disabled={anulando} onClick={anular}>
                    Confirmar anulación
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {accion && d && (
        <DocumentoModal
          tipo={accion === "retorno" ? "RETORNO" : accion === "editar" ? "REQUISICION" : "SALIDA"}
          desde={accion === "editar" ? null : d}
          editar={accion === "editar" ? d : null}
          onClose={() => setAccion(null)}
          onGuardado={() => { setAccion(null); recargar(); onAnulado(); }}
        />
      )}
    </div>
  );
}

function Dato({ label, valor }) {
  return (
    <div>
      <div className="inv-kpi__label">{label}</div>
      <div style={{ fontSize: "0.95rem" }}>{valor}</div>
    </div>
  );
}
