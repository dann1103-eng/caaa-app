import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getReporteVuelo,
  guardarReporteVuelo,
  enviarReporteVuelo,
  firmarReporteVueloAlumno,
} from "../../services/alumnoApi";
import {
  getReporteVueloInstructor,
  guardarReporteVueloInstructor,
  firmarReporteVuelo,
} from "../../services/instructorApi";
import { getReporteVueloAdmin } from "../../services/administracionApi";
import SignaturePad from "../SignaturePad/SignaturePad";
import { generarPdfReporteVuelo } from "./reporteVueloPdf";
import "./ReporteVueloModal.css";

const TIPO_VUELO_OPTS = ["PASAJERO", "CARGA", "SOLO", "DOBLE", "FERRY", "LOCAL"];

// Lecturas de medidor (tacómetro/hobbs): el instrumento tiene 4 dígitos
// enteros, así que una lectura como 0847.2 debe MOSTRARSE con su cero inicial
// aunque la BD (NUMERIC) lo normalice a 847.2. Se rellena la parte entera a 4
// dígitos y se conservan los decimales tal cual (mínimo 1, sin ceros de cola).
function formatMedidor(val) {
  if (val === null || val === undefined || val === "") return "";
  const s = String(val);
  if (!/^\d+(\.\d+)?$/.test(s)) return s;
  const [ent, dec = ""] = s.split(".");
  const decLimpio = dec.replace(/0+$/, "") || "0";
  return `${ent.padStart(4, "0")}.${decLimpio}`;
}

// Cuántos dígitos enteros/decimales tiene cada medidor, para armar el punto
// decimal solo: el instructor tipea puros números seguidos (sin el punto) y
// acá se insertan 4 enteros + N decimales según el instrumento — tacómetro
// se lee en centésimas (6 dígitos: 4+2), Hobbs en décimas (5 dígitos: 4+1).
const MEDIDOR_DIGITOS = {
  tacometro_salida:  { enteros: 4, decimales: 2 },
  tacometro_llegada: { enteros: 4, decimales: 2 },
  hobbs_salida:      { enteros: 4, decimales: 1 },
  hobbs_llegada:     { enteros: 4, decimales: 1 },
};

// Toma el valor crudo del input (puede traer el punto que ya insertamos antes,
// o uno que el instructor haya tecleado por su cuenta) y lo reconstruye desde
// los puros dígitos: los primeros `enteros` dígitos son la parte entera, el
// resto (hasta `decimales`) son la parte decimal.
function maskMedidor(rawValue, { enteros, decimales }) {
  const digits = rawValue.replace(/\D/g, "").slice(0, enteros + decimales);
  if (digits.length <= enteros) return digits;
  return `${digits.slice(0, enteros)}.${digits.slice(enteros)}`;
}

const DATOS_INICIALES = {
  tipo_vuelo: "",
  tacometro_salida: "",
  tacometro_llegada: "",
  hobbs_salida: "",
  hobbs_llegada: "",
  combustible_salida: "",
  combustible_llegada: "",
  cantidad_combustible: "",
  horas_cobradas: "",
};

function badge(estado) {
  if (!estado) return null;
  const cfg = {
    BORRADOR: { cls: "rv-badge--borrador", label: "Borrador" },
    PENDIENTE_INSTRUCTOR: { cls: "rv-badge--pendiente", label: "Pendiente instructor" },
    PENDIENTE_ALUMNO: { cls: "rv-badge--pendiente", label: "Pendiente firma alumno" },
    COMPLETADO: { cls: "rv-badge--completado", label: "Completado" },
  };
  const c = cfg[estado];
  if (!c) return null;
  return <span className={`rv-badge ${c.cls}`}>{c.label}</span>;
}

function formatCorrelativo(aeronaveModelo, idVuelo) {
  if (!aeronaveModelo || !idVuelo) return "—";
  return `${aeronaveModelo}-${String(idVuelo).padStart(7, "0")}`;
}

export default function ReporteVueloModal({ id_vuelo, mode = "alumno", onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [vueloInfo, setVueloInfo] = useState(null);
  const [estado, setEstado] = useState(null);
  const [datos, setDatos] = useState(DATOS_INICIALES);
  const [firmaAlumno, setFirmaAlumno] = useState(null);
  const [firmaInstructor, setFirmaInstructor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [esInasistencia, setEsInasistencia] = useState(false);
  const [motivoInasistencia, setMotivoInasistencia] = useState("");

  const firmaAlumnoRef = useRef(null);
  const firmaInstructorRef = useRef(null);

  // El simulador no tiene tacómetro/combustible/checklist de aeronave física —
  // la vouchera solo pide Hobbs inicio/cierre y las horas a cobrar.
  const isSim = vueloInfo?.aeronave_tipo === "SIMULADOR";

  // Instructor fills form (editable when null or BORRADOR); alumno never edits data
  const isReadonly = mode === "instructor"
    ? (estado === "PENDIENTE_ALUMNO" || estado === "COMPLETADO")
    : true;

  // ── Carga inicial ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        // "admin" = solo-lectura desde Administración (ficha del alumno);
        // isReadonly ya cubre cualquier modo que no sea "instructor".
        const data = mode === "alumno"
          ? await getReporteVuelo(id_vuelo)
          : mode === "admin"
            ? await getReporteVueloAdmin(id_vuelo)
            : await getReporteVueloInstructor(id_vuelo);

        setVueloInfo(data.vuelo);

        if (data.reporte) {
          const r = data.reporte;
          setEstado(r.estado);
          if (r.es_inasistencia) setEsInasistencia(true);
          if (r.motivo_inasistencia) setMotivoInasistencia(r.motivo_inasistencia);
          setDatos({
            tipo_vuelo: r.tipo_vuelo ?? "",
            tacometro_salida: formatMedidor(r.tacometro_salida),
            tacometro_llegada: formatMedidor(r.tacometro_llegada),
            hobbs_salida: formatMedidor(r.hobbs_salida),
            hobbs_llegada: formatMedidor(r.hobbs_llegada),
            combustible_salida: r.combustible_salida ?? "",
            combustible_llegada: r.combustible_llegada ?? "",
            cantidad_combustible: r.cantidad_combustible ?? "",
            horas_cobradas: r.horas_cobradas ?? "",
          });
          if (r.firma_alumno) setFirmaAlumno(r.firma_alumno);
          if (r.firma_instructor) setFirmaInstructor(r.firma_instructor);
        }
      } catch (e) {
        setError("No se pudo cargar el reporte. Intenta de nuevo.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id_vuelo, mode]);

  // Diferencia del tacómetro, SOLO como referencia junto a "Horas a cobrar" (el
  // instructor decide cuánto cobra; esto le evita restar de memoria). null hasta
  // que haya dos lecturas válidas.
  const tacSal = parseFloat(datos.tacometro_salida);
  const tacLle = parseFloat(datos.tacometro_llegada);
  const tacDiff = !isNaN(tacSal) && !isNaN(tacLle) && tacLle > tacSal ? tacLle - tacSal : null;

  function setField(key, val) {
    // Tacómetro/Hobbs: el instructor solo tipea dígitos seguidos, el punto
    // decimal se arma solo (4 enteros + N decimales según el instrumento).
    if (MEDIDOR_DIGITOS[key]) {
      setDatos((prev) => ({ ...prev, [key]: maskMedidor(val, MEDIDOR_DIGITOS[key]) }));
      return;
    }

    // Resto de campos numéricos: decimal libre (hasta 2), sin máscara.
    const camposDosDecimales = ["combustible_salida", "combustible_llegada", "cantidad_combustible", "horas_cobradas"];
    if (camposDosDecimales.includes(key)) {
      const regex = /^\d*(\.\d{0,2})?$/;
      if (val !== "" && !regex.test(val)) return;
    }

    setDatos((prev) => ({ ...prev, [key]: val }));
  }


  // ── Guardar borrador (instructor) ─────────────────────────────────────────
  async function handleGuardar() {
    setSaving(true);
    try {
      if (mode === "instructor") {
        await guardarReporteVueloInstructor(id_vuelo, { ...datos, es_inasistencia: esInasistencia, motivo_inasistencia: motivoInasistencia });
      } else {
        await guardarReporteVuelo(id_vuelo, { ...datos, es_inasistencia: esInasistencia, motivo_inasistencia: motivoInasistencia });
      }
      setEstado("BORRADOR");
    } catch (e) {
      toast.error(e?.response?.data?.message || "Error al guardar el borrador.");
    } finally {
      setSaving(false);
    }
  }

  // ── Instructor firma y envía a alumno ─────────────────────────────────────
  async function handleFirmarInstructor() {
    if (esInasistencia) {
      // Inasistencia solo requiere motivo y firma
    } else if (isSim) {
      if (!datos.horas_cobradas || parseFloat(datos.horas_cobradas) <= 0) {
        toast.warning("Ingresá las horas a cobrar de la sesión.");
        return;
      }
    } else {
      if (!datos.tipo_vuelo) {
        toast.warning("Elegí el tipo de vuelo antes de enviar.");
        return;
      }
      if (!datos.tacometro_salida || !datos.tacometro_llegada) {
        toast.warning("Los campos de Tacómetro Salida y Llegada son obligatorios.");
        return;
      }
      if (parseFloat(datos.tacometro_llegada) <= parseFloat(datos.tacometro_salida)) {
        toast.warning("El Tacómetro de llegada debe ser mayor al de salida.");
        return;
      }
      if (parseFloat(datos.tacometro_llegada) - parseFloat(datos.tacometro_salida) > 24) {
        toast.warning("La diferencia entre Tacómetro salida y llegada es mayor a 24 horas — revisá los valores.");
        return;
      }
      // Las horas a cobrar también se exigen en aeronave real, no solo en simulador:
      // son las que debitan el saldo del alumno y le suman horas de licencia.
      if (!datos.horas_cobradas) {
        toast.warning("Ingresá las horas a cobrar — es lo que se le debita al alumno.");
        return;
      }
      const hc = parseFloat(datos.horas_cobradas);
      if (isNaN(hc) || hc <= 0) {
        toast.warning("Las horas a cobrar deben ser mayores que 0.");
        return;
      }
      if (hc > 24) {
        toast.warning("Las horas a cobrar son mayores a 24 — ¿te faltó el punto decimal?");
        return;
      }
    }

    if (firmaInstructorRef.current?.isEmpty()) {
      toast.warning("Debe dibujar su firma antes de enviar.");
      return;
    }
    const firma = firmaInstructorRef.current.toDataURL();
    setGenerating(true);
    try {
      await firmarReporteVuelo(id_vuelo, {
        ...datos,
        firma_instructor: firma,
        es_inasistencia: esInasistencia,
        motivo_inasistencia: motivoInasistencia,
      });
      setFirmaInstructor(firma);
      setEstado("PENDIENTE_ALUMNO");
    } catch (e) {
      toast.error(e?.response?.data?.message || "Error al enviar el reporte al alumno.");
    } finally {
      setGenerating(false);
    }
  }

  // ── Alumno firma y completa ────────────────────────────────────────────────
  async function handleFirmarAlumno() {
    if (firmaAlumnoRef.current?.isEmpty()) {
      toast.warning("Debe dibujar su firma antes de completar.");
      return;
    }
    const firma = firmaAlumnoRef.current.toDataURL();
    setSaving(true);
    try {
      await firmarReporteVueloAlumno(id_vuelo, firma);
      setFirmaAlumno(firma);
      setEstado("COMPLETADO");
    } catch {
      toast.error("Error al firmar el reporte.");
    } finally {
      setSaving(false);
    }
  }

  // ── Alumno acepta inasistencia (auto-firma) ────────────────────────────────
  async function handleAceptarInasistenciaAlumno() {
    setSaving(true);
    try {
      // Generamos una "firma" de texto convertida a imagen o simplemente un placeholder
      // Para simplicidad, usamos una cadena base64 que represente "ACEPTADO"
      // Pero mejor usamos el mismo endpoint con un flag o simplemente una firma generada.
      // Aquí usaremos una firma vacía o un punto si el backend lo permite, 
      // pero lo ideal es que el alumno sepa que está aceptando.
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      ctx.font = '20px Arial';
      ctx.fillText('ACEPTADO POR INASISTENCIA', 20, 60);
      const firmaPlaceholder = canvas.toDataURL();

      await firmarReporteVueloAlumno(id_vuelo, firmaPlaceholder);
      setFirmaAlumno(firmaPlaceholder);
      setEstado("COMPLETADO");
      toast.success("Inasistencia aceptada correctamente.");
    } catch {
      toast.error("Error al aceptar inasistencia.");
    } finally {
      setSaving(false);
    }
  }

  // ── Descargar PDF ──────────────────────────────────────────────────────────
  async function handleDescargar() {
    setGenerating(true);
    try {
      await generarPdfReporteVuelo({
        // El PDF lee fecha_hora_vuelo (un solo campo); el endpoint manda
        // fecha_vuelo + hora_inicio por separado — sin esta composición la
        // vouchera salía con Fecha/Hora en "—". Solo la parte de fecha del
        // string (ver fechaStr arriba: el DATE llega como medianoche UTC).
        vueloInfo: {
          ...vueloInfo,
          fecha_hora_vuelo: vueloInfo?.fecha_vuelo
            ? `${String(vueloInfo.fecha_vuelo).slice(0, 10)}T${vueloInfo.hora_inicio || "00:00:00"}`
            : null,
        },
        datos,
        firmaAlumno,
        firmaInstructor,
        esInasistencia,
        motivoInasistencia,
        download: true,
      });
    } finally {
      setGenerating(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="rv-overlay">
        <div className="rv-modal">
          <div className="rv-loading">Cargando reporte…</div>
        </div>
      </div>
    );
  }

  const v = vueloInfo ?? {};
  // Solo la parte de fecha del string: fecha_vuelo es un DATE que el driver
  // serializa como medianoche UTC — parsearlo con new Date() lo corre un día
  // hacia atrás en El Salvador (UTC-6).
  const fechaStr = v.fecha_vuelo
    ? String(v.fecha_vuelo).slice(0, 10).split("-").reverse().join("/")
    : "—";
  const horaStr = v.hora_inicio
    ? v.hora_inicio.slice(0, 5)
    : "—";

  return (
    <div className="rv-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rv-modal">
        {/* ── Header ── */}
        <div className="rv-header">
          <div className="rv-header-left">
            <h2>
              {isSim ? "Vouchera de Simulador" : "Reporte de Vuelo"}
              {badge(estado)}
              {esInasistencia && (
                <span className="rv-badge rv-badge--inasistencia">INASISTENCIA</span>
              )}
            </h2>
            <div className="rv-header-meta">
              {v.aeronave_codigo && <span>{v.aeronave_codigo}</span>}
              {v.aeronave_modelo && <span> · {v.aeronave_modelo}</span>}
              {v.alumno_nombre && <span> · {v.alumno_nombre}</span>}
            </div>
          </div>
          <div className="rv-header-right">
            {/* Botón de inasistencia — solo visible para instructor en BORRADOR */}
            {mode === "instructor" && !isReadonly && (
              <button
                className={`rv-btn-inasistencia ${esInasistencia ? "rv-btn-inasistencia--activo" : ""}`}
                onClick={() => setEsInasistencia((prev) => !prev)}
                title={esInasistencia ? "Quitar marca de inasistencia" : "Registrar como inasistencia / No-Show"}
              >
                {esInasistencia ? <><i className="bi bi-x-lg" /> Quitar inasistencia</> : <><i className="bi bi-exclamation-triangle" /> Registrar inasistencia</>}
              </button>
            )}
            <button className="rv-close" onClick={onClose}>×</button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="rv-body">
          {error && <div className="rv-error">{error}</div>}

          {/* Info fija del vuelo */}
          <div className="rv-section">
            <div className="rv-section-title">Datos del vuelo</div>
            <div className="rv-info-grid">
              {[
                { label: "Reporte #", val: formatCorrelativo(v.aeronave_modelo, v.id_vuelo) },
                { label: "Hora", val: horaStr },
                { label: "Fecha", val: fechaStr },
                { label: "Tipo avión", val: v.aeronave_modelo ?? "—" },
                { label: "Avión No.", val: v.aeronave_codigo ?? "—" },
                { label: "Vuelo No.", val: formatCorrelativo(v.aeronave_modelo, v.id_vuelo) },
              ].map(({ label, val }) => (
                <div key={label} className="rv-info-field">
                  <span className="rv-label">{label}</span>
                  <span className="rv-info-val">{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Banner de inasistencia */}
          {esInasistencia && (
            <div className="rv-inasistencia-banner">
              <span className="rv-inasistencia-icon"><i className="bi bi-exclamation-triangle-fill" /></span>
              <div>
                <strong>INASISTENCIA / NO-SHOW</strong>
                <p>El alumno no se presentó al vuelo. Los campos técnicos quedan en blanco. Se requieren firmas para completar el registro.</p>
                
                <div className="rv-inasistencia-motivo-box">
                  <span className="rv-inasistencia-motivo-label">Motivo de la inasistencia</span>
                  {isReadonly ? (
                    <span className="rv-inasistencia-motivo-val">{motivoInasistencia || "No se especificó motivo."}</span>
                  ) : (
                    <textarea
                      className="rv-inasistencia-motivo-input"
                      placeholder="Escriba el motivo aquí (ej. Problemas de salud, tráfico, olvido...)"
                      value={motivoInasistencia}
                      onChange={(e) => setMotivoInasistencia(e.target.value)}
                      rows={2}
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tipo de vuelo — no aplica a simulador (PASAJERO/CARGA/FERRY son de aeronave real) */}
          {!isSim && (
            <div className="rv-section">
              <div className="rv-section-title">Tipo de vuelo</div>
              <select
                className="rv-input rv-select"
                value={datos.tipo_vuelo}
                onChange={(e) => setField("tipo_vuelo", e.target.value)}
                disabled={isReadonly || esInasistencia}
              >
                <option value="">Seleccione…</option>
                {TIPO_VUELO_OPTS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}

          {/* Datos: tacómetro/hobbs/combustible (vuelo real) o Hobbs + horas a cobrar (simulador) */}
          <div className="rv-section">
            <div className="rv-section-title">{isSim ? "Hobbs y horas a cobrar" : "Tacómetro, Hobbs, Combustible y cobro"}</div>
            {esInasistencia ? (
              <p className="rv-inasistencia-omit">Lecturas omitidas por inasistencia.</p>
            ) : (
            <div className="rv-data-grid">
              {(isSim
                ? [
                    { key: "hobbs_salida", label: "Hobbs Inicio", medidor: true },
                    { key: "hobbs_llegada", label: "Hobbs Cierre", medidor: true },
                    { key: "horas_cobradas", label: "Horas a cobrar" },
                  ]
                : [
                    { key: "tacometro_salida", label: "Tacómetro Salida", medidor: true },
                    { key: "tacometro_llegada", label: "Tacómetro Llegada", medidor: true },
                    { key: "hobbs_salida", label: "Hobbs Salida", medidor: true },
                    { key: "hobbs_llegada", label: "Hobbs Llegada", medidor: true },
                    { key: "combustible_salida", label: "Combustible Salida" },
                    { key: "combustible_llegada", label: "Combustible Llegada" },
                    { key: "cantidad_combustible", label: "Cantidad agregada" },
                    // También en aeronave real: el cobro lleva criterio del instructor
                    // y no siempre coincide con el tacómetro. Es lo que debita el saldo.
                    { key: "horas_cobradas", label: "Horas a cobrar", hint: tacDiff != null ? `TAC: ${tacDiff.toFixed(1)} h` : null },
                  ]
              ).map(({ key, label, medidor, hint }) => (
                <div key={key} className="rv-data-field">
                  <span className="rv-label">
                    {label}
                    {/* El TAC va como referencia al lado de "Horas a cobrar": el
                        instructor decide el número, pero conviene que vea cuánto
                        marcó el reloj sin tener que restarlo de memoria. */}
                    {hint && <span style={{ fontWeight: 400, color: "var(--c-ink-3)" }}> · {hint}</span>}
                  </span>
                  {isReadonly ? (
                    <span className="rv-info-val">
                      {datos[key] !== "" && !isNaN(parseFloat(datos[key]))
                        ? (medidor ? formatMedidor(datos[key]) : parseFloat(datos[key]).toFixed(1))
                        : "—"}
                    </span>
                  ) : (
                    <input
                      type="text"
                      inputMode={MEDIDOR_DIGITOS[key] ? "numeric" : "decimal"}
                      placeholder={MEDIDOR_DIGITOS[key] ? "0".repeat(MEDIDOR_DIGITOS[key].enteros + MEDIDOR_DIGITOS[key].decimales) : "0000.0"}
                      className="rv-input"
                      value={datos[key]}
                      onChange={(e) => setField(key, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
            )}
          </div>

          {/* Firmas */}
          <div className="rv-section">
            <div className="rv-section-title">Firmas</div>
            <div className="rv-firmas-grid">
              {/* Firma instructor */}
              <div className="rv-firma-box">
                <div className="rv-firma-label">Firma del Instructor</div>
                <SignaturePad
                  ref={firmaInstructorRef}
                  width={320}
                  height={120}
                  disabled={isReadonly || mode !== "instructor"}
                  value={firmaInstructor}
                />
                {mode === "instructor" && !isReadonly && (
                  <button
                    className="rv-btn-clear"
                    onClick={() => firmaInstructorRef.current?.clear()}
                  >
                    Limpiar
                  </button>
                )}
                <div className="rv-firma-name">
                  {v.instructor_nombre ?? "—"}
                  {v.instructor_licencia && <span className="rv-firma-lic"> · Lic. {v.instructor_licencia}</span>}
                </div>
              </div>

              {/* Firma alumno */}
              <div className="rv-firma-box">
                <div className="rv-firma-label">Firma del Alumno</div>
                <SignaturePad
                  ref={firmaAlumnoRef}
                  width={320}
                  height={120}
                  disabled={mode !== "alumno" || estado !== "PENDIENTE_ALUMNO"}
                  value={firmaAlumno}
                />
                {mode === "alumno" && estado === "PENDIENTE_ALUMNO" && firmaAlumno == null && (
                  <button
                    className="rv-btn-clear"
                    onClick={() => firmaAlumnoRef.current?.clear()}
                  >
                    Limpiar
                  </button>
                )}
                <div className="rv-firma-name">
                  {v.alumno_nombre ?? "—"}
                  {v.alumno_licencia && <span className="rv-firma-lic"> · Lic. {v.alumno_licencia}</span>}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="rv-footer">
          <button className="rv-btn" onClick={onClose} disabled={saving || generating}>
            Cerrar
          </button>

          {/* Instructor — borrador o sin estado: puede guardar y firmar */}
          {mode === "instructor" && !isReadonly && (
            <>
              <button
                className="rv-btn rv-btn--primary"
                onClick={handleGuardar}
                disabled={saving || generating}
              >
                {saving ? "Guardando…" : "Guardar borrador"}
              </button>
              <button
                className="rv-btn rv-btn--success"
                onClick={handleFirmarInstructor}
                disabled={saving || generating}
              >
                {generating ? "Enviando…" : "Firmar y enviar a alumno"}
              </button>
            </>
          )}

          {/* Alumno — pendiente de su firma */}
          {mode === "alumno" && estado === "PENDIENTE_ALUMNO" && (
            <>
              {esInasistencia ? (
                <button
                  className="rv-btn rv-btn--success"
                  onClick={handleAceptarInasistenciaAlumno}
                  disabled={saving}
                >
                  {saving ? "Aceptando…" : "Aceptar Inasistencia"}
                </button>
              ) : (
                <button
                  className="rv-btn rv-btn--success"
                  onClick={handleFirmarAlumno}
                  disabled={saving}
                >
                  {saving ? "Firmando…" : "Firmar reporte"}
                </button>
              )}
            </>
          )}

          {/* Cualquiera — completado */}
          {estado === "COMPLETADO" && (
            <button
              className="rv-btn rv-btn--primary"
              onClick={handleDescargar}
              disabled={generating}
            >
              {generating ? "Generando PDF…" : "Descargar PDF"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
