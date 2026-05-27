import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getFacturas, emitirFactura, anularFactura,
  descargarPdfFactura, getAlumnosConSaldo, getAeronaveTarifas
} from "../../services/administracionApi";

const MOCK = [
  { id: 9, numero_correlativo: 174759, fecha_emision: "2025-09-12", alumno_username: "juan.oporto", total_usd: 169.00, estado: "EMITIDA", concepto: "Vuelo YS-333PE 1.3h" },
  { id: 8, numero_correlativo: 174689, fecha_emision: "2025-09-08", alumno_username: "juan.oporto", total_usd: 130.00, estado: "EMITIDA", concepto: "Vuelo YS-334PE 1.0h" },
  { id: 7, numero_correlativo: 174378, fecha_emision: "2025-08-12", alumno_username: "juan.oporto", total_usd: 156.00, estado: "EMITIDA", concepto: "Vuelo YS-333PE 1.2h" },
  { id: 6, numero_correlativo: 174292, fecha_emision: "2025-07-30", alumno_username: "juan.oporto", total_usd: 130.00, estado: "EMITIDA", concepto: "Vuelo YS-333PE 1.0h" },
  { id: 5, numero_correlativo: 174313, fecha_emision: "2025-07-28", alumno_username: "maria.lopez", total_usd: 130.00, estado: "ANULADA", concepto: "Vuelo YS-334PE 1.0h" }
];

const MOCK_ALUMNOS = [
  { id_alumno: 1, username: "juan.oporto" },
  { id_alumno: 2, username: "maria.lopez" },
  { id_alumno: 3, username: "carlos.solano" }
];

const MOCK_TARIFAS = [
  { id: 1, modelo_aeronave: "Cessna 152",     tarifa_hora_usd: 135.00 },
  { id: 3, modelo_aeronave: "Cherokee 180",   tarifa_hora_usd: 200.00 },
  { id: 4, modelo_aeronave: "Cherokee Arrow", tarifa_hora_usd: 220.00 },
  { id: 5, modelo_aeronave: "Bimotor",        tarifa_hora_usd: 600.00 },
  { id: 6, modelo_aeronave: "BATD II",        tarifa_hora_usd:  90.00 }
];

const EMPTY_LINE = { descripcion: "", cantidad_horas: "", tarifa_hora_usd: "", subtotal_usd: "", id_aeronave_tarifa: null };

export default function Facturas() {
  const [facturas, setFacturas] = useState([]);
  const [alumnos, setAlumnos]   = useState([]);
  const [tarifas, setTarifas]   = useState([]);
  const [usingMock, setUsingMock] = useState(false);
  const [estado, setEstado] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    id_alumno: "",
    concepto: "",
    fecha_emision: new Date().toISOString().slice(0, 10),
    iva_usd: "0",
    lineas: [{ ...EMPTY_LINE }]
  });

  const loadFacturas = async () => {
    try {
      const r = await getFacturas(estado ? { estado } : {});
      if (r?.ok) { setFacturas(r.data); setUsingMock(false); } else throw new Error();
    } catch { setFacturas(MOCK); setUsingMock(true); }
  };
  const loadAux = async () => {
    try {
      const [al, ta] = await Promise.all([getAlumnosConSaldo(), getAeronaveTarifas()]);
      setAlumnos(al?.ok ? al.data : MOCK_ALUMNOS);
      setTarifas(ta?.ok ? ta.data : MOCK_TARIFAS);
    } catch {
      setAlumnos(MOCK_ALUMNOS); setTarifas(MOCK_TARIFAS);
    }
  };

  useEffect(() => { loadFacturas(); }, [estado]);
  useEffect(() => { loadAux(); }, []);

  // ── Cálculos del formulario ───────────────────────────────────────
  const subtotalLineas = form.lineas.reduce((s, l) => {
    const sub = l.subtotal_usd !== "" ? Number(l.subtotal_usd) : Number(l.cantidad_horas || 0) * Number(l.tarifa_hora_usd || 0);
    return s + (isNaN(sub) ? 0 : sub);
  }, 0);
  const ivaTotal = Number(form.iva_usd || 0);
  const totalFactura = subtotalLineas + ivaTotal;

  const updateLinea = (idx, patch) => {
    const nuevas = form.lineas.map((l, i) => i === idx ? { ...l, ...patch } : l);
    setForm({ ...form, lineas: nuevas });
  };

  const seleccionarTarifa = (idx, tarifaId) => {
    const t = tarifas.find(x => String(x.id) === String(tarifaId));
    if (!t) return updateLinea(idx, { id_aeronave_tarifa: null, tarifa_hora_usd: "" });
    updateLinea(idx, {
      id_aeronave_tarifa: t.id,
      tarifa_hora_usd: Number(t.tarifa_hora_usd).toFixed(2),
      descripcion: form.lineas[idx].descripcion || `Hora de vuelo - ${t.modelo_aeronave}`
    });
  };

  const recalcLineaSubtotal = (idx) => {
    const l = form.lineas[idx];
    const calc = Number(l.cantidad_horas || 0) * Number(l.tarifa_hora_usd || 0);
    if (!isNaN(calc) && calc > 0) updateLinea(idx, { subtotal_usd: calc.toFixed(2) });
  };

  const agregarLinea = () => setForm({ ...form, lineas: [...form.lineas, { ...EMPTY_LINE }] });
  const eliminarLinea = (idx) => setForm({ ...form, lineas: form.lineas.filter((_, i) => i !== idx) });

  const handleEmitir = async (e) => {
    e.preventDefault();
    if (!form.id_alumno) return toast.error("Selecciona un alumno");
    const lineasValidas = form.lineas.filter(l => l.descripcion && (Number(l.subtotal_usd) > 0 || (Number(l.cantidad_horas) > 0 && Number(l.tarifa_hora_usd) > 0)));
    if (lineasValidas.length === 0) return toast.error("Debes incluir al menos una línea con monto");

    try {
      const r = await emitirFactura({
        id_alumno: Number(form.id_alumno),
        concepto: form.concepto,
        fecha_emision: form.fecha_emision,
        iva_usd: Number(form.iva_usd || 0),
        lineas: lineasValidas.map(l => ({
          descripcion: l.descripcion,
          cantidad_horas: Number(l.cantidad_horas || 1),
          tarifa_hora_usd: Number(l.tarifa_hora_usd || 0),
          subtotal_usd: l.subtotal_usd !== "" ? Number(l.subtotal_usd) : Number(l.cantidad_horas || 0) * Number(l.tarifa_hora_usd || 0),
          id_aeronave_tarifa: l.id_aeronave_tarifa
        }))
      });
      toast.success(`Factura #${r.data.numero_correlativo} emitida — total $${Number(r.data.total_usd).toFixed(2)}`);
      setShowForm(false);
      setForm({
        id_alumno: "",
        concepto: "",
        fecha_emision: new Date().toISOString().slice(0, 10),
        iva_usd: "0",
        lineas: [{ ...EMPTY_LINE }]
      });
      // Descargar el PDF automáticamente
      try { await descargarPdfFactura(r.data.id, `factura-${r.data.numero_correlativo}.pdf`); } catch {}
      loadFacturas();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Error al emitir factura");
    }
  };

  const handleAnular = async (id) => {
    const motivo = prompt("Motivo de anulación de la factura:");
    if (!motivo) return;
    try { await anularFactura(id, motivo); toast.success("Factura anulada"); loadFacturas(); }
    catch (e) { toast.error(e?.response?.data?.message || "Error"); }
  };

  const handleDescargar = async (f) => {
    try {
      await descargarPdfFactura(f.id, `factura-${f.numero_correlativo}.pdf`);
    } catch (e) {
      toast.error("No se pudo descargar el PDF. Verifica que la factura exista en la base de datos (las demo no son descargables).");
    }
  };

  return (
    <div>
      <h1 className="adf-section-title"><i className="bi bi-file-earmark-text"></i>Facturas</h1>
      <p className="adf-section-subtitle">
        Emisión y consulta de facturas. Numeración correlativa única gestionada por la base de datos.
        Las facturas se descuentan automáticamente del saldo de la cuenta corriente del alumno.
        {usingMock && <span className="adf-tag amber" style={{ marginLeft: 10 }}>Datos demo</span>}
      </p>

      <div className="adf-card" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div className="adf-form-field" style={{ maxWidth: 220 }}>
          <label>Filtrar por estado</label>
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todas</option>
            <option value="EMITIDA">Emitidas</option>
            <option value="ANULADA">Anuladas</option>
          </select>
        </div>
        <button className="adf-btn" onClick={() => setShowForm(!showForm)}>
          <i className={`bi ${showForm ? 'bi-x-circle' : 'bi-plus-circle'}`}></i>
          {showForm ? "Cancelar emisión" : "Emitir nueva factura"}
        </button>
      </div>

      {showForm && (
        <div className="adf-card">
          <h3><i className="bi bi-receipt-cutoff me-2"></i>Emitir nueva factura</h3>
          <p style={{ color: "var(--c-ink-3)", fontSize: "0.85rem", marginTop: -10, marginBottom: 14 }}>
            La factura se generará con el siguiente número correlativo disponible. El total se debitará automáticamente del saldo del alumno y se descargará el PDF.
          </p>
          <form onSubmit={handleEmitir}>
            <div className="adf-form-grid">
              <div className="adf-form-field">
                <label>Alumno *</label>
                <select required value={form.id_alumno} onChange={(e) => setForm({...form, id_alumno: e.target.value})}>
                  <option value="">Selecciona...</option>
                  {alumnos.map(a => <option key={a.id_alumno} value={a.id_alumno}>{a.username}</option>)}
                </select>
              </div>
              <div className="adf-form-field">
                <label>Fecha emisión</label>
                <input type="date" value={form.fecha_emision}
                  onChange={(e) => setForm({...form, fecha_emision: e.target.value})} />
              </div>
              <div className="adf-form-field" style={{ gridColumn: "1 / -1" }}>
                <label>Concepto general</label>
                <input value={form.concepto}
                  placeholder="Ej: Hora de vuelo curso Piloto Privado - Septiembre 2026"
                  onChange={(e) => setForm({...form, concepto: e.target.value})} />
              </div>
            </div>

            <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--c-line-1)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <h4 style={{ margin: 0, color: "var(--c-brand-700)", fontSize: "0.95rem" }}>
                  <i className="bi bi-list-ul me-2"></i>Líneas de detalle
                </h4>
                <button type="button" className="adf-btn small secondary" onClick={agregarLinea}>
                  <i className="bi bi-plus-circle"></i>Agregar línea
                </button>
              </div>

              <table className="adf-table" style={{ minWidth: 0 }}>
                <thead>
                  <tr>
                    <th>Descripción</th>
                    <th style={{ width: 130 }}>Aeronave (auto-tarifa)</th>
                    <th style={{ width: 80, textAlign: "right" }}>Horas</th>
                    <th style={{ width: 100, textAlign: "right" }}>Tarifa/h</th>
                    <th style={{ width: 110, textAlign: "right" }}>Subtotal</th>
                    <th style={{ width: 44 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {form.lineas.map((l, idx) => (
                    <tr key={idx}>
                      <td>
                        <input value={l.descripcion}
                          placeholder="Hora de vuelo, materiales, examen..."
                          style={{ width: "100%", padding: 6, border: "1px solid var(--c-line-2)", borderRadius: 6 }}
                          onChange={(e) => updateLinea(idx, { descripcion: e.target.value })} />
                      </td>
                      <td>
                        <select value={l.id_aeronave_tarifa || ""}
                          style={{ width: "100%", padding: 6, border: "1px solid var(--c-line-2)", borderRadius: 6 }}
                          onChange={(e) => seleccionarTarifa(idx, e.target.value)}>
                          <option value="">— Manual —</option>
                          {tarifas.map(t => (
                            <option key={t.id} value={t.id}>
                              {t.modelo_aeronave} (${Number(t.tarifa_hora_usd).toFixed(0)}/h)
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input type="number" step="0.1" min="0" value={l.cantidad_horas}
                          style={{ width: "100%", padding: 6, textAlign: "right", border: "1px solid var(--c-line-2)", borderRadius: 6 }}
                          onChange={(e) => updateLinea(idx, { cantidad_horas: e.target.value })}
                          onBlur={() => recalcLineaSubtotal(idx)} />
                      </td>
                      <td>
                        <input type="number" step="0.01" min="0" value={l.tarifa_hora_usd}
                          style={{ width: "100%", padding: 6, textAlign: "right", border: "1px solid var(--c-line-2)", borderRadius: 6 }}
                          onChange={(e) => updateLinea(idx, { tarifa_hora_usd: e.target.value })}
                          onBlur={() => recalcLineaSubtotal(idx)} />
                      </td>
                      <td>
                        <input type="number" step="0.01" min="0" value={l.subtotal_usd}
                          placeholder={(Number(l.cantidad_horas || 0) * Number(l.tarifa_hora_usd || 0)).toFixed(2)}
                          style={{ width: "100%", padding: 6, textAlign: "right", border: "1px solid var(--c-line-2)", borderRadius: 6, fontWeight: 600 }}
                          onChange={(e) => updateLinea(idx, { subtotal_usd: e.target.value })} />
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {form.lineas.length > 1 && (
                          <button type="button" className="adf-btn small danger"
                            onClick={() => eliminarLinea(idx)} title="Eliminar línea">
                            <i className="bi bi-trash"></i>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
              <div style={{ minWidth: 280 }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                  <span style={{ color: "var(--c-ink-3)" }}>Subtotal:</span>
                  <strong>${subtotalLineas.toFixed(2)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", alignItems: "center" }}>
                  <span style={{ color: "var(--c-ink-3)" }}>IVA (opcional):</span>
                  <input type="number" step="0.01" min="0" value={form.iva_usd}
                    style={{ width: 100, padding: 6, textAlign: "right", border: "1px solid var(--c-line-2)", borderRadius: 6 }}
                    onChange={(e) => setForm({...form, iva_usd: e.target.value})} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", marginTop: 8,
                              background: "var(--c-accent-700)", color: "white", borderRadius: 8 }}>
                  <strong>TOTAL USD:</strong>
                  <strong style={{ fontSize: "1.2rem" }}>${totalFactura.toFixed(2)}</strong>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" className="adf-btn secondary" onClick={() => setShowForm(false)}>Cancelar</button>
              <button type="submit" className="adf-btn">
                <i className="bi bi-check-circle"></i>Emitir factura y descargar PDF
              </button>
            </div>
          </form>
        </div>
      )}

      <table className="adf-table">
        <thead>
          <tr>
            <th># Factura</th><th>Fecha</th><th>Alumno</th><th>Concepto</th>
            <th style={{ textAlign: "right" }}>Total USD</th>
            <th>Estado</th><th style={{ width: 130 }}></th>
          </tr>
        </thead>
        <tbody>
          {facturas.map(f => (
            <tr key={f.id}>
              <td><strong>#{f.numero_correlativo}</strong></td>
              <td>{new Date(f.fecha_emision).toLocaleDateString("es-SV")}</td>
              <td><i className="bi bi-person me-1"></i>{f.alumno_username}</td>
              <td style={{ color: "var(--c-ink-3)", fontSize: "0.88rem" }}>{f.concepto}</td>
              <td className="amount" style={{ textAlign: "right" }}>${Number(f.total_usd).toFixed(2)}</td>
              <td>
                {f.estado === 'EMITIDA'
                  ? <span className="adf-tag green">EMITIDA</span>
                  : <span className="adf-tag red">ANULADA</span>}
              </td>
              <td style={{ textAlign: "right" }}>
                <button className="adf-btn small secondary" onClick={() => handleDescargar(f)} title="Descargar PDF">
                  <i className="bi bi-file-pdf"></i>PDF
                </button>
                {f.estado === 'EMITIDA' && (
                  <button className="adf-btn small danger" style={{ marginLeft: 6 }}
                          onClick={() => handleAnular(f.id)} title="Anular">
                    <i className="bi bi-x-octagon"></i>
                  </button>
                )}
              </td>
            </tr>
          ))}
          {facturas.length === 0 && (
            <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--c-ink-4)", padding: 30 }}>
              Sin facturas emitidas aún. Emite una con el botón verde de arriba.
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
