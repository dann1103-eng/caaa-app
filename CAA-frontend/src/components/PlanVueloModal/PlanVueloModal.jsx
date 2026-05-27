import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getPlanVuelo, guardarPlanVuelo, completarPlanVuelo } from "../../services/alumnoApi";
import { generarPdfPlanVuelo } from "./planVueloPdf";
import "./PlanVueloModal.css";

const CAMPOS_INICIAL = {
  lugar_salida: "",
  fecha_vuelo: "",
  hora_vuelo: "",
  reglas_vuelo: "VFR",
  altitud: "",
  ruta: "",
  tiempo_ruta: "",
  combustible: "",
  personas_a_bordo: "",
  velocidad: "",
  frecuencias: "",
  alternativo: "",
  colores: "",
  pilot1_nombre: "",
  pilot1_licencia: "",
  pilot1_domicilio: "",
  pilot2_nombre: "",
  pilot2_licencia: "",
  pilot2_domicilio: "",
  destino: "",
  ilop_radio: "",
  vor_dme_adf: "",
  observaciones: "",
  piloto_al_mando: "",
  despacho: "",
};

function extractFechaHora(iso) {
  if (!iso) return { fecha: "", hora: "" };
  const d = new Date(iso);
  const fecha = d.toISOString().slice(0, 10);
  const hora = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  return { fecha, hora };
}

export default function PlanVueloModal({ id_vuelo, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [vueloInfo, setVueloInfo] = useState(null);   // datos del vuelo (aeronave, etc.)
  const [planEstado, setPlanEstado] = useState(null); // "BORRADOR" | "COMPLETADO" | null
  const [form, setForm] = useState(CAMPOS_INICIAL);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await getPlanVuelo(id_vuelo);
        setVueloInfo(data.vuelo);

        if (data.plan) {
          setPlanEstado(data.plan.estado);
          // Mergear campos del plan con los defaults
          const merged = { ...CAMPOS_INICIAL };
          for (const key of Object.keys(CAMPOS_INICIAL)) {
            if (data.plan[key] != null) merged[key] = String(data.plan[key]);
          }
          setForm(merged);
        } else {
          // Pre-rellenar fecha/hora desde el vuelo
          const { fecha, hora } = extractFechaHora(data.vuelo?.fecha_hora_vuelo);
          setForm((prev) => ({
            ...prev,
            fecha_vuelo: fecha,
            hora_vuelo: hora,
            personas_a_bordo: data.vuelo?.soleado ? "1" : "2",
            pilot1_nombre: data.vuelo?.instructor_nombre || "",
            pilot2_nombre: data.vuelo?.alumno_nombre || "",
          }));
          setPlanEstado(null);
        }
      } catch (e) {
        setError(e.response?.data?.message || "No se pudo cargar el plan de vuelo.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id_vuelo]);

  const setField = (key, value) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleGuardar = async () => {
    setSaving(true);
    try {
      await guardarPlanVuelo(id_vuelo, form);
      setPlanEstado("BORRADOR");
      toast.success("Plan guardado como borrador.");
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudo guardar el plan.");
    } finally {
      setSaving(false);
    }
  };

  const handleGenerarYCompletar = async () => {
    setGenerating(true);
    try {
      // 1. Guardar datos actuales primero
      await guardarPlanVuelo(id_vuelo, form);

      // 2. Generar PDF con pdfmake
      const pdfBlob = await generarPdfPlanVuelo(form, vueloInfo);

      // 3. Subir PDF y marcar como COMPLETADO
      await completarPlanVuelo(id_vuelo, pdfBlob);

      setPlanEstado("COMPLETADO");
      toast.success("Plan de vuelo completado. PDF generado y guardado.");
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudo completar el plan.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="pv-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pv-modal">

        <div className="pv-header">
          <div className="pv-header-left">
            <h2>
              Plan de vuelo
              {planEstado && (
                <span className={`pv-estado-badge pv-estado-badge--${planEstado.toLowerCase()}`}>
                  {planEstado}
                </span>
              )}
            </h2>
            {vueloInfo && (
              <div className="pv-header-meta">
                {vueloInfo.aeronave_codigo && <span>{vueloInfo.aeronave_codigo}</span>}
                {vueloInfo.instructor_nombre && <span> · Instructor: {vueloInfo.instructor_nombre}</span>}
                {vueloInfo.fecha_hora_vuelo && (
                  <span> · {new Date(vueloInfo.fecha_hora_vuelo).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short", timeZone: "UTC" })}</span>
                )}
              </div>
            )}
          </div>
          <button className="pv-close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        <div className="pv-body">
          {loading ? (
            <p className="pv-loading">Cargando…</p>
          ) : error ? (
            <p className="pv-error">{error}</p>
          ) : (
            <>
              {/* ── Sección 1: Reglas de vuelo ─────────────────────────────── */}
              <div className="pv-section">
                <div className="pv-section-title">Reglas de vuelo</div>
                <div className="pv-grid pv-grid--4">
                  <div className="pv-field">
                    <span className="pv-label">Lugar de salida</span>
                    <input
                      className="pv-input"
                      value={form.lugar_salida}
                      onChange={(e) => setField("lugar_salida", e.target.value)}
                    />
                  </div>
                  <div className="pv-field">
                    <span className="pv-label">Fecha</span>
                    <input
                      className="pv-input"
                      type="date"
                      value={form.fecha_vuelo}
                      onChange={(e) => setField("fecha_vuelo", e.target.value)}
                    />
                  </div>
                  <div className="pv-field">
                    <span className="pv-label">Hora (UTC)</span>
                    <input
                      className="pv-input"
                      type="time"
                      value={form.hora_vuelo}
                      onChange={(e) => setField("hora_vuelo", e.target.value)}
                    />
                  </div>
                  <div className="pv-field">
                    <span className="pv-label">Reglas</span>
                    <div className="pv-radio-group">
                      <label>
                        <input
                          type="radio"
                          value="VFR"
                          checked={form.reglas_vuelo === "VFR"}
                          onChange={() => setField("reglas_vuelo", "VFR")}
                        />
                        VFR
                      </label>
                      <label>
                        <input
                          type="radio"
                          value="IFR"
                          checked={form.reglas_vuelo === "IFR"}
                          onChange={() => setField("reglas_vuelo", "IFR")}
                        />
                        IFR
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Sección 2: Aeronave ────────────────────────────────────── */}
              <div className="pv-section">
                <div className="pv-section-title">Aeronave</div>
                <div className="pv-grid pv-grid--4">
                  <div className="pv-field">
                    <span className="pv-label">Ident. aeronave</span>
                    <input
                      className="pv-input"
                      readOnly
                      value={vueloInfo?.aeronave_codigo || form.ident_aeronave || ""}
                    />
                  </div>
                  <div className="pv-field">
                    <span className="pv-label">Tipo aeronave</span>
                    <input
                      className="pv-input"
                      value={form.tipo_aeronave || vueloInfo?.aeronave_tipo || ""}
                      onChange={(e) => setField("tipo_aeronave", e.target.value)}
                    />
                  </div>
                  <div className="pv-field">
                    <span className="pv-label">Altitud / Nivel</span>
                    <input
                      className="pv-input"
                      value={form.altitud}
                      onChange={(e) => setField("altitud", e.target.value)}
                    />
                  </div>
                  <div className="pv-field">
                    <span className="pv-label">Velocidad</span>
                    <input
                      className="pv-input"
                      value={form.velocidad}
                      onChange={(e) => setField("velocidad", e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* ── Sección 3: Ruta ────────────────────────────────────────── */}
              <div className="pv-section">
                <div className="pv-section-title">Ruta y combustible</div>
                <div className="pv-grid pv-grid--2" style={{ marginBottom: "0.7rem" }}>
                  <div className="pv-field">
                    <span className="pv-label">Ruta</span>
                    <input
                      className="pv-input"
                      value={form.ruta}
                      onChange={(e) => setField("ruta", e.target.value)}
                    />
                  </div>
                  <div className="pv-field">
                    <span className="pv-label">Destino</span>
                    <input
                      className="pv-input"
                      value={form.destino}
                      onChange={(e) => setField("destino", e.target.value)}
                    />
                  </div>
                </div>
                <div className="pv-grid pv-grid--4">
                  <div className="pv-field">
                    <span className="pv-label">Tiempo en ruta</span>
                    <input
                      className="pv-input"
                      value={form.tiempo_ruta}
                      onChange={(e) => setField("tiempo_ruta", e.target.value)}
                    />
                  </div>
                  <div className="pv-field">
                    <span className="pv-label">Combustible (endurance)</span>
                    <input
                      className="pv-input"
                      value={form.combustible}
                      onChange={(e) => setField("combustible", e.target.value)}
                    />
                  </div>
                  <div className="pv-field">
                    <span className="pv-label">Personas a bordo</span>
                    <input
                      className="pv-input"
                      type="number"
                      min={1}
                      max={6}
                      value={form.personas_a_bordo}
                      onChange={(e) => setField("personas_a_bordo", e.target.value)}
                    />
                  </div>
                  <div className="pv-field">
                    <span className="pv-label">Colores aeronave</span>
                    <input
                      className="pv-input"
                      value={form.colores}
                      onChange={(e) => setField("colores", e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* ── Sección 4: Comunicaciones ─────────────────────────────── */}
              <div className="pv-section">
                <div className="pv-section-title">Comunicaciones y navegación</div>
                <div className="pv-grid pv-grid--4">
                  <div className="pv-field">
                    <span className="pv-label">Frecuencias</span>
                    <input
                      className="pv-input"
                      value={form.frecuencias}
                      onChange={(e) => setField("frecuencias", e.target.value)}
                    />
                  </div>
                  <div className="pv-field">
                    <span className="pv-label">Destino alterno</span>
                    <input
                      className="pv-input"
                      value={form.alternativo}
                      onChange={(e) => setField("alternativo", e.target.value)}
                    />
                  </div>
                  <div className="pv-field">
                    <span className="pv-label">VOR / DME / ADF</span>
                    <input
                      className="pv-input"
                      value={form.vor_dme_adf}
                      onChange={(e) => setField("vor_dme_adf", e.target.value)}
                    />
                  </div>
                  <div className="pv-field">
                    <span className="pv-label">ILOP / Radio</span>
                    <input
                      className="pv-input"
                      value={form.ilop_radio}
                      onChange={(e) => setField("ilop_radio", e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* ── Sección 5: Pilotos ────────────────────────────────────── */}
              <div className="pv-section">
                <div className="pv-section-title">Pilotos</div>
                <div className="pv-grid pv-grid--3" style={{ marginBottom: "0.7rem" }}>
                  <div className="pv-field">
                    <span className="pv-label">Piloto 1 — Nombre</span>
                    <input
                      className="pv-input"
                      value={form.pilot1_nombre}
                      onChange={(e) => setField("pilot1_nombre", e.target.value)}
                    />
                  </div>
                  <div className="pv-field">
                    <span className="pv-label">Licencia</span>
                    <input
                      className="pv-input"
                      value={form.pilot1_licencia}
                      onChange={(e) => setField("pilot1_licencia", e.target.value)}
                    />
                  </div>
                  <div className="pv-field">
                    <span className="pv-label">Domicilio</span>
                    <input
                      className="pv-input"
                      value={form.pilot1_domicilio}
                      onChange={(e) => setField("pilot1_domicilio", e.target.value)}
                    />
                  </div>
                </div>
                <div className="pv-grid pv-grid--3">
                  <div className="pv-field">
                    <span className="pv-label">Piloto 2 — Nombre</span>
                    <input
                      className="pv-input"
                      value={form.pilot2_nombre}
                      onChange={(e) => setField("pilot2_nombre", e.target.value)}
                    />
                  </div>
                  <div className="pv-field">
                    <span className="pv-label">Licencia</span>
                    <input
                      className="pv-input"
                      value={form.pilot2_licencia}
                      onChange={(e) => setField("pilot2_licencia", e.target.value)}
                    />
                  </div>
                  <div className="pv-field">
                    <span className="pv-label">Domicilio</span>
                    <input
                      className="pv-input"
                      value={form.pilot2_domicilio}
                      onChange={(e) => setField("pilot2_domicilio", e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* ── Sección 6: Cierre ─────────────────────────────────────── */}
              <div className="pv-section">
                <div className="pv-section-title">Observaciones y cierre</div>
                <div className="pv-grid pv-grid--2" style={{ marginBottom: "0.7rem" }}>
                  <div className="pv-field">
                    <span className="pv-label">Piloto al mando</span>
                    <input
                      className="pv-input"
                      value={form.piloto_al_mando}
                      onChange={(e) => setField("piloto_al_mando", e.target.value)}
                    />
                  </div>
                  <div className="pv-field">
                    <span className="pv-label">Despacho / Firma</span>
                    <input
                      className="pv-input"
                      value={form.despacho}
                      onChange={(e) => setField("despacho", e.target.value)}
                    />
                  </div>
                </div>
                <div className="pv-field">
                  <span className="pv-label">Observaciones</span>
                  <textarea
                    className="pv-textarea"
                    value={form.observaciones}
                    onChange={(e) => setField("observaciones", e.target.value)}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {!loading && !error && (
          <div className="pv-footer">
            <button className="pv-btn" onClick={onClose}>
              Cerrar
            </button>
            <button
              className="pv-btn pv-btn--primary"
              onClick={handleGuardar}
              disabled={saving || generating}
            >
              {saving ? "Guardando…" : "Guardar borrador"}
            </button>
            <button
              className="pv-btn pv-btn--success"
              onClick={handleGenerarYCompletar}
              disabled={saving || generating || planEstado === "COMPLETADO"}
              title={planEstado === "COMPLETADO" ? "El plan ya fue completado" : ""}
            >
              {generating ? "Generando PDF…" : "Generar y completar"}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
