import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import {
  getCuentaAlumno, getExtractoAlumno,
  crearRecibo, cargoManualCuenta, descargarPdfRecibo, getRecibo,
  editarMovimiento, anularMovimiento,
  cobrarConceptoCuenta, getConceptosCobro
} from "../../services/administracionApi";
import SaldoBadge from "../../components/SaldoBadge/SaldoBadge";
import MovimientoCuentaTable from "../../components/MovimientoCuentaTable/MovimientoCuentaTable";

const MOCK_CUENTA = { id_alumno: 1, username: "JUAN CARLOS OPORTO MARTINEZ", correo: "juan.oporto@caaa-sv.com", saldo_actual_usd: 4471.00 };
const MOCK_MOV = [
  { id: 1,  fecha: "2025-07-07", instructor_nombre: "Recibo",     factura_correlativo: 1752,  avion_codigo: null,        horas_vuelo: null, horas_totales: 17.4, tipo: "DEPOSITO",    monto_usd:  2771.67, saldo_resultante_usd: 2771.67, recibo_correlativo: 1752 },
  { id: 2,  fecha: "2025-07-28", instructor_nombre: "H. Amaya",   factura_correlativo: 174313, avion_codigo: "YS-334PE",  horas_vuelo: 1.0,  horas_totales: 1.0,  tipo: "CARGO_VUELO", monto_usd:  -130.00, saldo_resultante_usd: 2641.67 },
  { id: 3,  fecha: "2025-07-28", instructor_nombre: "J. Burgos",  factura_correlativo: 173935, avion_codigo: "Batd II",   horas_vuelo: 1.0,  horas_totales: 2.0,  tipo: "CARGO_VUELO", monto_usd:   -85.00, saldo_resultante_usd: 2556.67 },
  { id: 4,  fecha: "2025-07-30", instructor_nombre: "H. Amaya",   factura_correlativo: 173937, avion_codigo: "Batd II",   horas_vuelo: 1.0,  horas_totales: 3.0,  tipo: "CARGO_VUELO", monto_usd:   -85.00, saldo_resultante_usd: 2471.67 },
  { id: 5,  fecha: "2025-07-30", instructor_nombre: "C. Cáceres", factura_correlativo: 174292, avion_codigo: "YS-333PE",  horas_vuelo: 1.0,  horas_totales: 4.0,  tipo: "CARGO_VUELO", monto_usd:  -130.00, saldo_resultante_usd: 2341.67 },
  { id: 6,  fecha: "2025-08-09", instructor_nombre: "Recibo",     factura_correlativo: 1774,  avion_codigo: null,        horas_vuelo: null, horas_totales: null, tipo: "DEPOSITO",    monto_usd:  2771.67, saldo_resultante_usd: 5113.34, recibo_correlativo: 1774 },
  { id: 7,  fecha: "2025-08-07", instructor_nombre: "S. Muñoz",   factura_correlativo: 174401, avion_codigo: "YS-334PE",  horas_vuelo: 1.1,  horas_totales: 5.1,  tipo: "CARGO_VUELO", monto_usd:  -143.00, saldo_resultante_usd: 4970.34 },
  { id: 8,  fecha: "2025-08-08", instructor_nombre: "C. Cáceres", factura_correlativo: 174405, avion_codigo: "YS-334PE",  horas_vuelo: 1.0,  horas_totales: 6.1,  tipo: "CARGO_VUELO", monto_usd:  -130.00, saldo_resultante_usd: 4840.34 }
];

const EMPTY_FORM = {
  fecha: new Date().toISOString().slice(0, 10),
  instructor: "", factura_no: "", avion: "",
  h_v: "", h_t: "",
  debe: "", haber: "", descripcion: "", nota: "", es_multa: false
};
const METODOS = ["EFECTIVO", "TRANSFERENCIA", "CHEQUE", "TARJETA", "OTRO"];

export default function CuentaDetalle() {
  const { id } = useParams();
  const [cuenta, setCuenta] = useState(null);
  const [mov, setMov] = useState([]);
  const [usingMock, setUsingMock] = useState(false);

  const [openPanel, setOpenPanel] = useState(null); // 'recibo' | 'cargo' | null
  const [editing, setEditing] = useState(null);
  const [verRecibo, setVerRecibo] = useState(null); // recibo + items, para el modal "Ver detalle"

  const [recForm, setRecForm] = useState({ monto_usd: "", metodo: "EFECTIVO", referencia: "", descripcion: "", fecha: new Date().toISOString().slice(0, 10) });
  // Ítems del ingreso (opcional): si hay líneas, el total del recibo sale de
  // acá (cantidad × precio unitario) y el campo Monto queda de solo lectura.
  const [recItems, setRecItems] = useState([]);
  const recTotal = recItems.reduce((s, it) => s + (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0), 0);
  const [cargoForm, setCargoForm] = useState(EMPTY_FORM);
  const [editForm, setEditForm] = useState({ ...EMPTY_FORM, motivo_edicion: "" });
  const [conceptos, setConceptos] = useState([]);
  const [conceptoForm, setConceptoForm] = useState({ id_concepto: "", monto_usd: "", fecha: new Date().toISOString().slice(0, 10), descripcion: "" });

  const load = async () => {
    try {
      const [c, m] = await Promise.all([getCuentaAlumno(id), getExtractoAlumno(id)]);
      if (c?.ok && m?.ok) { setCuenta(c.data); setMov(m.data); setUsingMock(false); }
      else throw new Error("offline");
    } catch {
      setCuenta(MOCK_CUENTA); setMov(MOCK_MOV); setUsingMock(true);
    }
  };
  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    getConceptosCobro({ activos: "true" }).then(r => { if (r?.ok) setConceptos(r.data); }).catch(() => {});
  }, []);

  const handleCobrarConcepto = async (e) => {
    e.preventDefault();
    if (!conceptoForm.id_concepto) return toast.error("Elegí un concepto.");
    try {
      await cobrarConceptoCuenta(id, {
        id_concepto: Number(conceptoForm.id_concepto),
        monto_usd: conceptoForm.monto_usd === "" ? null : Number(conceptoForm.monto_usd),
        fecha: conceptoForm.fecha || null,
        descripcion: conceptoForm.descripcion,
      });
      toast.success("Cobro aplicado a la cuenta.");
      setOpenPanel(null);
      setConceptoForm({ id_concepto: "", monto_usd: "", fecha: new Date().toISOString().slice(0, 10), descripcion: "" });
      load();
    } catch (e) { toast.error(e?.response?.data?.message || "Error al aplicar el cobro."); }
  };

  const handleRecibo = async (e) => {
    e.preventDefault();
    try {
      const conItems = recItems.length > 0;
      const r = await crearRecibo({
        id_alumno: Number(id),
        ...recForm,
        fecha: recForm.fecha || null,
        monto_usd: conItems ? undefined : Number(recForm.monto_usd),
        items: conItems ? recItems.map((it) => ({
          descripcion: it.descripcion,
          cantidad: Number(it.cantidad),
          precio_unitario: Number(it.precio_unitario),
        })) : undefined,
      });
      toast.success(`Depósito registrado — Recibo #${r?.data?.numero_correlativo ?? ""}.`);
      setOpenPanel(null);
      setRecForm({ monto_usd: "", metodo: "EFECTIVO", referencia: "", descripcion: "", fecha: new Date().toISOString().slice(0, 10) });
      setRecItems([]);
      load();
      // El recibo recién emitido se descarga solo (PDF).
      if (r?.data?.id) {
        descargarPdfRecibo(r.data.id, `recibo-${r.data.numero_correlativo}.pdf`).catch(() => {});
      }
    } catch (e) { toast.error(e?.response?.data?.message || "Error al registrar depósito."); }
  };

  const handleCargo = async (e) => {
    e.preventDefault();
    if (!cargoForm.debe && !cargoForm.haber) return toast.error("Indica un monto en Debe o Haber.");
    try {
      await cargoManualCuenta(id, cargoForm);
      toast.success(cargoForm.debe ? "Cargo registrado." : "Crédito registrado.");
      setOpenPanel(null);
      setCargoForm(EMPTY_FORM);
      load();
    } catch (e) { toast.error(e?.response?.data?.message || "Error al registrar."); }
  };

  const openEditar = (m) => {
    setEditing(m);
    const debeVal  = Number(m.monto_usd) < 0 ? Math.abs(Number(m.monto_usd)).toFixed(2) : "";
    const haberVal = Number(m.monto_usd) > 0 ? Number(m.monto_usd).toFixed(2)            : "";
    setEditForm({
      fecha: new Date(m.fecha).toISOString().slice(0, 10),
      instructor: m.instructor_nombre || "",
      factura_no: m.factura_correlativo || m.recibo_correlativo || "",
      avion: m.avion_codigo || "",
      h_v: m.horas_vuelo ?? "",
      h_t: m.horas_totales ?? "",
      debe: debeVal, haber: haberVal,
      descripcion: m.descripcion || "",
      nota: m.nota || "",
      motivo_edicion: ""
    });
  };

  const handleGuardarEdicion = async (e) => {
    e.preventDefault();
    if (!editForm.motivo_edicion.trim()) return toast.error("El motivo de edición es obligatorio para auditoría.");
    try {
      await editarMovimiento(editing.id, editForm);
      toast.success("Movimiento actualizado.");
      setEditing(null);
      load();
    } catch (e) { toast.error(e?.response?.data?.message || "Error al editar."); }
  };

  const handleAnular = async (m) => {
    // Borrado tipo Excel: la fila desaparece y los saldos se recalculan solos.
    if (!window.confirm("¿Borrar este movimiento de la cuenta? Los saldos se recalculan automáticamente.")) return;

    // Si tiene un documento fiscal ligado (recibo/factura), preguntar si también
    // se borra ese documento o solo se quita el movimiento de la cuenta.
    const docTxt = m.recibo_correlativo
      ? `recibo #${m.recibo_correlativo}`
      : m.factura_correlativo ? `factura #${m.factura_correlativo}` : null;
    let borrar_documento = false;
    if (docTxt) {
      borrar_documento = window.confirm(
        `Este movimiento tiene un ${docTxt} asociado.\n\n` +
        `• Aceptar → borrar también el ${docTxt}.\n` +
        `• Cancelar → dejar el ${docTxt} en su listado y solo quitar el movimiento de la cuenta.`
      );
    }
    try {
      await anularMovimiento(m.id, { borrar_documento });
      toast.success("Movimiento borrado.");
      load();
    } catch (e) { toast.error(e?.response?.data?.message || "Error al borrar."); }
  };

  const handleVerRecibo = async (m) => {
    try {
      const r = await getRecibo(m.id_recibo);
      if (!r?.ok) throw new Error();
      setVerRecibo(r.data);
    } catch {
      toast.error("No se pudo cargar el detalle del recibo.");
    }
  };

  const handleDescargarRecibo = async (m) => {
    try {
      await descargarPdfRecibo(m.id_recibo, `recibo-${m.recibo_correlativo || m.id_recibo}.pdf`);
    } catch {
      toast.error("No se pudo descargar el PDF. Recargá la página e intentá de nuevo.");
    }
  };

  if (!cuenta) return <p style={{ padding: 24, color: "var(--c-ink-3)" }}>Cargando…</p>;

  const totalCargos = mov.filter(m => Number(m.monto_usd) < 0 && !m.anulado).reduce((s, m) => s + Math.abs(Number(m.monto_usd)), 0);
  const totalAbonos = mov.filter(m => Number(m.monto_usd) > 0 && !m.anulado).reduce((s, m) => s + Number(m.monto_usd), 0);
  const ultimoMov   = mov.length > 0 ? new Date(mov[mov.length - 1].fecha) : null;

  return (
    <div>
      <Link to={`/administracion/alumnos/${id}`} className="adf-btn ghost small" style={{ marginBottom: 12 }}>
        <i className="bi bi-arrow-left"></i> Volver a la ficha
      </Link>

      <header style={{ marginBottom: 24, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <div className="u-label" style={{ marginBottom: 4 }}>Cuenta corriente · Piloto Estudiante</div>
          <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, color: "var(--c-ink-1)", letterSpacing: "var(--tracking-tight)" }}>
            {cuenta.username}
          </h1>
          <p style={{ color: "var(--c-ink-3)", fontSize: "var(--text-sm)", marginTop: 4 }}>
            <i className="bi bi-envelope me-1"></i>{cuenta.correo}
            {usingMock && <span className="adf-tag amber" style={{ marginLeft: 10 }}>Datos demo</span>}
          </p>
        </div>
      </header>

      {/* Resumen + acciones */}
      <div className="adf-card" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 24, alignItems: "center" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 24 }}>
          <div>
            <div className="u-label">Saldo actual</div>
            <div style={{ marginTop: 6 }}>
              <SaldoBadge saldo={cuenta.saldo_actual_usd} size="lg" />
            </div>
          </div>
          <div>
            <div className="u-label">Total cargos</div>
            <div className="u-mono" style={{ fontSize: 22, fontWeight: 600, color: "var(--c-danger-700)", marginTop: 8 }}>
              −${totalCargos.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: 11, color: "var(--c-ink-3)" }}>{mov.filter(m => Number(m.monto_usd) < 0).length} movimientos</div>
          </div>
          <div>
            <div className="u-label">Total abonos</div>
            <div className="u-mono" style={{ fontSize: 22, fontWeight: 600, color: "var(--c-accent-700)", marginTop: 8 }}>
              +${totalAbonos.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </div>
            <div style={{ fontSize: 11, color: "var(--c-ink-3)" }}>{mov.filter(m => Number(m.monto_usd) > 0).length} movimientos</div>
          </div>
          <div>
            <div className="u-label">Último mov.</div>
            <div className="u-mono" style={{ fontSize: 15, fontWeight: 500, marginTop: 10 }}>
              {ultimoMov ? ultimoMov.toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 240 }}>
          <button className="adf-btn positive" onClick={() => setOpenPanel(openPanel === "recibo" ? null : "recibo")}>
            <i className="bi bi-plus-lg"></i> Registrar abono (Haber)
          </button>
          <button className="adf-btn secondary" onClick={() => { setCargoForm(EMPTY_FORM); setOpenPanel(openPanel === "cargo" ? null : "cargo"); }}>
            <i className="bi bi-dash-lg"></i> Cargo manual (Debe)
          </button>
          <button className="adf-btn secondary" onClick={() => { setCargoForm({ ...EMPTY_FORM, es_multa: true, nota: "Multa por no-show" }); setOpenPanel("cargo"); }}>
            <i className="bi bi-exclamation-octagon"></i> Multa (no-show)
          </button>
          <button className="adf-btn secondary" onClick={() => setOpenPanel(openPanel === "concepto" ? null : "concepto")}>
            <i className="bi bi-tags"></i> Cobrar concepto
          </button>
          <button className="adf-btn ghost small" onClick={() => window.print()}>
            <i className="bi bi-printer"></i> Imprimir extracto
          </button>
        </div>
      </div>

      {/* Panel de recibo */}
      {openPanel === "recibo" && (
        <div className="adf-card">
          <h3><i className="bi bi-receipt"></i> Registrar depósito</h3>
          <form onSubmit={handleRecibo}>
            <div className="adf-form-grid">
              <div className="adf-form-field">
                <label>Fecha</label>
                <input type="date" required value={recForm.fecha}
                  onChange={(e) => setRecForm({...recForm, fecha: e.target.value})} />
              </div>
              <div className="adf-form-field">
                <label>Monto USD{recItems.length > 0 && " (suma del detalle)"}</label>
                <input type="number" step="0.01" min="0.01"
                  required={recItems.length === 0}
                  disabled={recItems.length > 0}
                  value={recItems.length > 0 ? recTotal.toFixed(2) : recForm.monto_usd}
                  onChange={(e) => setRecForm({...recForm, monto_usd: e.target.value})} />
              </div>
              <div className="adf-form-field">
                <label>Método</label>
                <select value={recForm.metodo} onChange={(e) => setRecForm({...recForm, metodo: e.target.value})}>
                  {METODOS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div className="adf-form-field">
                <label>Referencia</label>
                <input value={recForm.referencia} placeholder="# transferencia, cheque…"
                  onChange={(e) => setRecForm({...recForm, referencia: e.target.value})} />
              </div>
              <div className="adf-form-field" style={{ gridColumn: "1 / -1" }}>
                <label>Descripción</label>
                <input value={recForm.descripcion} placeholder="Ej: Pago anticipado 20 horas curso PP"
                  onChange={(e) => setRecForm({...recForm, descripcion: e.target.value})} />
              </div>
            </div>

            {/* Detalle por ítems (opcional): el recibo sale como factura de
                ingreso y el total se calcula solo. */}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed var(--c-line-2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: "0.78rem", fontWeight: 800, color: "var(--c-brand-700)", letterSpacing: 0.4 }}>
                  DETALLE DEL INGRESO (OPCIONAL)
                </span>
                <button type="button" className="adf-btn small secondary"
                  onClick={() => setRecItems([...recItems, { descripcion: "", cantidad: "1", precio_unitario: "" }])}>
                  <i className="bi bi-plus-lg"></i> Agregar ítem
                </button>
              </div>
              {recItems.length > 0 && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 110px 100px 34px", gap: 8, fontSize: "0.72rem", fontWeight: 700, color: "var(--c-ink-3)", marginBottom: 4 }}>
                    <span>Descripción</span><span>Cantidad</span><span>P. unitario</span><span style={{ textAlign: "right" }}>Subtotal</span><span></span>
                  </div>
                  {recItems.map((it, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 90px 110px 100px 34px", gap: 8, marginBottom: 6, alignItems: "center" }}>
                      <input required placeholder="Ej: 10 horas de vuelo Cessna 152" value={it.descripcion}
                        onChange={(e) => setRecItems(recItems.map((x, j) => j === i ? { ...x, descripcion: e.target.value } : x))} />
                      <input required type="number" step="0.01" min="0.01" value={it.cantidad}
                        onChange={(e) => setRecItems(recItems.map((x, j) => j === i ? { ...x, cantidad: e.target.value } : x))} />
                      <input required type="number" step="0.01" min="0" placeholder="0.00" value={it.precio_unitario}
                        onChange={(e) => setRecItems(recItems.map((x, j) => j === i ? { ...x, precio_unitario: e.target.value } : x))} />
                      <span className="amount" style={{ textAlign: "right", fontWeight: 700 }}>
                        ${(((Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0))).toFixed(2)}
                      </span>
                      <button type="button" className="adf-icon-btn" title="Quitar ítem"
                        onClick={() => setRecItems(recItems.filter((_, j) => j !== i))}>
                        <i className="bi bi-x-lg"></i>
                      </button>
                    </div>
                  ))}
                  <div style={{ textAlign: "right", fontWeight: 800, marginTop: 6 }}>
                    Total del ingreso: <span className="amount pos">${recTotal.toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>

            <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="adf-btn ghost" onClick={() => setOpenPanel(null)}>Cancelar</button>
              <button type="submit" className="adf-btn positive"><i className="bi bi-check2"></i> Guardar depósito</button>
            </div>
          </form>
        </div>
      )}

      {/* Panel cobrar concepto del catálogo */}
      {openPanel === "concepto" && (
        <div className="adf-card">
          <h3><i className="bi bi-tags"></i> Cobrar concepto</h3>
          <p style={{ color: "var(--c-ink-3)", fontSize: 13, marginTop: -8, marginBottom: 16 }}>
            Aplica un cobro del catálogo (ej. reposición de examen). Debita el saldo prepagado del alumno.
            {conceptos.length === 0 && <span> No hay conceptos activos — creá uno en Contabilidad → Ingresos → Conceptos de cobro.</span>}
          </p>
          <form onSubmit={handleCobrarConcepto}>
            <div className="adf-form-grid">
              <div className="adf-form-field">
                <label>Concepto</label>
                <select value={conceptoForm.id_concepto} onChange={(e) => {
                  const c = conceptos.find(x => String(x.id) === e.target.value);
                  setConceptoForm({ ...conceptoForm, id_concepto: e.target.value, monto_usd: c ? Number(c.monto_usd).toFixed(2) : "" });
                }}>
                  <option value="">— Elegir —</option>
                  {conceptos.map(c => <option key={c.id} value={c.id}>{c.nombre} (${Number(c.monto_usd).toFixed(2)})</option>)}
                </select>
              </div>
              <div className="adf-form-field">
                <label>Monto USD</label>
                <input type="number" step="0.01" min="0.01" value={conceptoForm.monto_usd}
                  onChange={(e) => setConceptoForm({ ...conceptoForm, monto_usd: e.target.value })} placeholder="Por defecto del concepto" />
              </div>
              <div className="adf-form-field">
                <label>Fecha</label>
                <input type="date" value={conceptoForm.fecha} onChange={(e) => setConceptoForm({ ...conceptoForm, fecha: e.target.value })} />
              </div>
              <div className="adf-form-field" style={{ gridColumn: "1 / -1" }}>
                <label>Descripción (opcional)</label>
                <input value={conceptoForm.descripcion} placeholder="Detalle del cobro"
                  onChange={(e) => setConceptoForm({ ...conceptoForm, descripcion: e.target.value })} />
              </div>
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="adf-btn ghost" onClick={() => setOpenPanel(null)}>Cancelar</button>
              <button type="submit" className="adf-btn"><i className="bi bi-check2"></i> Aplicar cobro</button>
            </div>
          </form>
        </div>
      )}

      {/* Panel cargo manual */}
      {openPanel === "cargo" && (
        <div className="adf-card">
          <h3>
            <i className={cargoForm.es_multa ? "bi bi-exclamation-octagon" : "bi bi-pencil-square"}></i>
            {cargoForm.es_multa ? " Multa / cargo sin horas" : " Cargo manual · Formato hoja azul"}
          </h3>
          <p style={{ color: "var(--c-ink-3)", fontSize: 13, marginTop: -8, marginBottom: 16 }}>
            {cargoForm.es_multa
              ? "Debita el saldo del alumno sin registrar horas de vuelo. Indica el monto en Debe y describe en Nota el motivo (ej. no-show)."
              : "Llena las columnas de la cuenta corriente física: fecha, instructor, factura, avión, H.V., H.T., y monto en Debe o Haber."}
          </p>
          <form onSubmit={handleCargo}>
            <div className="adf-form-grid">
              <div className="adf-form-field">
                <label>Fecha</label>
                <input type="date" required value={cargoForm.fecha}
                  onChange={(e) => setCargoForm({...cargoForm, fecha: e.target.value})} />
              </div>
              <div className="adf-form-field">
                <label>Instructor</label>
                <input value={cargoForm.instructor} placeholder="H. Amaya"
                  onChange={(e) => setCargoForm({...cargoForm, instructor: e.target.value})} />
              </div>
              <div className="adf-form-field">
                <label>Factura No.</label>
                <input value={cargoForm.factura_no} placeholder="174313" style={{ fontFamily: "var(--font-mono)" }}
                  onChange={(e) => setCargoForm({...cargoForm, factura_no: e.target.value})} />
              </div>
              <div className="adf-form-field">
                <label>Avión</label>
                <input value={cargoForm.avion} placeholder="YS-334PE" style={{ fontFamily: "var(--font-mono)" }}
                  onChange={(e) => setCargoForm({...cargoForm, avion: e.target.value})} />
              </div>
              {!cargoForm.es_multa && (
                <>
                  <div className="adf-form-field">
                    <label>H.V.</label>
                    <input type="number" step="0.1" min="0" value={cargoForm.h_v} style={{ fontFamily: "var(--font-mono)" }}
                      onChange={(e) => setCargoForm({...cargoForm, h_v: e.target.value})} />
                  </div>
                  <div className="adf-form-field">
                    <label>H.T.</label>
                    <input type="number" step="0.1" min="0" value={cargoForm.h_t} style={{ fontFamily: "var(--font-mono)" }}
                      onChange={(e) => setCargoForm({...cargoForm, h_t: e.target.value})} />
                  </div>
                </>
              )}
              <div className="adf-form-field">
                <label style={{ color: "var(--c-danger-700)" }}>Debe (cargo)</label>
                <input type="number" step="0.01" min="0" value={cargoForm.debe}
                  placeholder="USD" style={{ fontFamily: "var(--font-mono)" }}
                  onChange={(e) => setCargoForm({...cargoForm, debe: e.target.value, haber: ""})} />
              </div>
              {!cargoForm.es_multa && (
                <div className="adf-form-field">
                  <label style={{ color: "var(--c-accent-700)" }}>Haber (crédito)</label>
                  <input type="number" step="0.01" min="0" value={cargoForm.haber}
                    placeholder="USD" style={{ fontFamily: "var(--font-mono)" }}
                    onChange={(e) => setCargoForm({...cargoForm, haber: e.target.value, debe: ""})} />
                </div>
              )}
              <div className="adf-form-field" style={{ gridColumn: "1 / -1" }}>
                <label>Nota</label>
                <input value={cargoForm.nota}
                  placeholder={cargoForm.es_multa ? "Ej: Multa por no-show del 30/07" : "Ej: Multa, recargo, concepto del movimiento…"}
                  onChange={(e) => setCargoForm({...cargoForm, nota: e.target.value})} />
              </div>
              <div className="adf-form-field" style={{ gridColumn: "1 / -1" }}>
                <label>Observaciones</label>
                <input value={cargoForm.descripcion}
                  placeholder="Ajuste por hora extra no facturada, corrección de factura previa…"
                  onChange={(e) => setCargoForm({...cargoForm, descripcion: e.target.value})} />
              </div>
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="adf-btn ghost" onClick={() => setOpenPanel(null)}>Cancelar</button>
              <button type="submit" className="adf-btn"><i className="bi bi-check2"></i> Registrar movimiento</button>
            </div>
          </form>
        </div>
      )}

      {/* Editor de movimiento */}
      {editing && (
        <div className="adf-card" style={{ background: "var(--c-warn-50)", borderColor: "oklch(85% 0.080 75)" }}>
          <h3 style={{ color: "var(--c-warn-700)" }}>
            <i className="bi bi-pencil-square" style={{ color: "var(--c-warn-700)" }}></i>
            Editar movimiento #{editing.id} · auditoría
          </h3>
          <p style={{ color: "var(--c-ink-2)", fontSize: 13, marginTop: -8, marginBottom: 14 }}>
            Cualquier cambio queda registrado con tu usuario, fecha y motivo. El saldo en cascada se recalcula automáticamente.
          </p>
          <form onSubmit={handleGuardarEdicion}>
            <div className="adf-form-grid">
              <div className="adf-form-field">
                <label>Fecha</label>
                <input type="date" value={editForm.fecha}
                  onChange={(e) => setEditForm({...editForm, fecha: e.target.value})} />
              </div>
              <div className="adf-form-field">
                <label>Instructor</label>
                <input value={editForm.instructor}
                  onChange={(e) => setEditForm({...editForm, instructor: e.target.value})} />
              </div>
              <div className="adf-form-field">
                <label>Factura No.</label>
                <input value={editForm.factura_no} style={{ fontFamily: "var(--font-mono)" }}
                  onChange={(e) => setEditForm({...editForm, factura_no: e.target.value})} />
              </div>
              <div className="adf-form-field">
                <label>Avión</label>
                <input value={editForm.avion} style={{ fontFamily: "var(--font-mono)" }}
                  onChange={(e) => setEditForm({...editForm, avion: e.target.value})} />
              </div>
              <div className="adf-form-field">
                <label>H.V.</label>
                <input type="number" step="0.1" value={editForm.h_v} style={{ fontFamily: "var(--font-mono)" }}
                  onChange={(e) => setEditForm({...editForm, h_v: e.target.value})} />
              </div>
              <div className="adf-form-field">
                <label>H.T.</label>
                <input type="number" step="0.1" value={editForm.h_t} style={{ fontFamily: "var(--font-mono)" }}
                  onChange={(e) => setEditForm({...editForm, h_t: e.target.value})} />
              </div>
              <div className="adf-form-field">
                <label style={{ color: "var(--c-danger-700)" }}>Debe</label>
                <input type="number" step="0.01" value={editForm.debe} style={{ fontFamily: "var(--font-mono)" }}
                  onChange={(e) => setEditForm({...editForm, debe: e.target.value, haber: e.target.value ? "" : editForm.haber})} />
              </div>
              <div className="adf-form-field">
                <label style={{ color: "var(--c-accent-700)" }}>Haber</label>
                <input type="number" step="0.01" value={editForm.haber} style={{ fontFamily: "var(--font-mono)" }}
                  onChange={(e) => setEditForm({...editForm, haber: e.target.value, debe: e.target.value ? "" : editForm.debe})} />
              </div>
              <div className="adf-form-field" style={{ gridColumn: "1 / -1" }}>
                <label>Descripción</label>
                <input value={editForm.descripcion}
                  onChange={(e) => setEditForm({...editForm, descripcion: e.target.value})} />
              </div>
              <div className="adf-form-field" style={{ gridColumn: "1 / -1" }}>
                <label>Nota</label>
                <input value={editForm.nota}
                  onChange={(e) => setEditForm({...editForm, nota: e.target.value})} />
              </div>
              <div className="adf-form-field" style={{ gridColumn: "1 / -1" }}>
                <label style={{ color: "var(--c-warn-700)" }}>Motivo de edición (obligatorio)</label>
                <input required value={editForm.motivo_edicion}
                  placeholder="Ej: Corrección de horas voladas según reporte físico"
                  onChange={(e) => setEditForm({...editForm, motivo_edicion: e.target.value})} />
              </div>
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="adf-btn ghost" onClick={() => setEditing(null)}>Cancelar</button>
              <button type="submit" className="adf-btn"><i className="bi bi-check2"></i> Guardar cambios</button>
            </div>
          </form>
        </div>
      )}

      {/* Detalle de recibo */}
      {verRecibo && (
        <div className="adf-card" style={{ background: "var(--c-accent-50)", borderColor: "var(--c-accent-100)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <i className="bi bi-receipt" style={{ color: "var(--c-brand-500)" }}></i>
              Recibo #{verRecibo.numero_correlativo}
            </h3>
            <button className="adf-icon-btn" title="Cerrar" aria-label="Cerrar" onClick={() => setVerRecibo(null)}>
              <i className="bi bi-x-lg"></i>
            </button>
          </div>
          <p style={{ color: "var(--c-ink-3)", fontSize: 13, marginTop: -8, marginBottom: 14 }}>
            {new Date(verRecibo.fecha).toLocaleDateString("es-SV")} · {verRecibo.metodo}
            {verRecibo.referencia ? ` · Ref: ${verRecibo.referencia}` : ""}
            {verRecibo.anulado ? " · ANULADO" : ""}
          </p>

          {verRecibo.items?.length > 0 ? (
            <table className="adf-table">
              <thead>
                <tr>
                  <th>Descripción</th>
                  <th style={{ textAlign: "right" }}>Cant.</th>
                  <th style={{ textAlign: "right" }}>P. unitario</th>
                  <th style={{ textAlign: "right" }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {verRecibo.items.map((it, i) => (
                  <tr key={i}>
                    <td>{it.descripcion}</td>
                    <td style={{ textAlign: "right" }}>{Number(it.cantidad).toFixed(2)}</td>
                    <td style={{ textAlign: "right" }}>${Number(it.precio_unitario).toFixed(2)}</td>
                    <td style={{ textAlign: "right" }}>${Number(it.subtotal).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: "var(--c-ink-2)" }}>
              {verRecibo.descripcion || "Depósito sin detalle de ítems."}
            </p>
          )}

          <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontSize: "var(--text-lg)", color: "var(--c-brand-700)" }}>
              Total: ${Number(verRecibo.monto_usd).toFixed(2)} USD
            </strong>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="adf-btn ghost" onClick={() => setVerRecibo(null)}>Cerrar</button>
              <button
                type="button"
                className="adf-btn"
                onClick={() => descargarPdfRecibo(verRecibo.id, `recibo-${verRecibo.numero_correlativo}.pdf`)
                  .catch(() => toast.error("No se pudo descargar el PDF."))}
              >
                <i className="bi bi-download"></i> Descargar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabla extracto */}
      <div style={{ marginTop: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
          <h3 style={{ fontSize: "var(--text-base)", fontWeight: 700, color: "var(--c-ink-1)", display: "flex", alignItems: "center", gap: 8 }}>
            <i className="bi bi-table" style={{ color: "var(--c-brand-500)" }}></i>
            Extracto · cuenta corriente
          </h3>
          <div style={{ fontSize: 12, color: "var(--c-ink-3)" }} className="u-mono">
            {mov.length} movimientos
          </div>
        </div>
        <MovimientoCuentaTable
          movimientos={mov}
          onEditar={openEditar}
          onAnular={handleAnular}
          onVerRecibo={handleVerRecibo}
          onDescargarRecibo={handleDescargarRecibo}
          showActions={true}
        />
      </div>
    </div>
  );
}
