import { useRef, useState, useEffect } from "react";
import {
  getChecklistPostvuelo,
  guardarChecklistPostvuelo,
  eliminarChecklistPostvuelo,
} from "../../services/instructorApi";
import { avanzarEstadoVuelo } from "../../services/instructorApi";
import SignaturePad from "../SignaturePad/SignaturePad";
import "./ChecklistPostvueloModal.css";

const ITEMS = [
  { key: "freno_parqueo",             label: "Freno de parqueo aplicado" },
  { key: "mezcla_corte",              label: "Mezcla en corte (Idle Cut-Off)" },
  { key: "magnetos_off",              label: "Magnetos en OFF" },
  { key: "master_switch_off",         label: "Master switch OFF" },
  { key: "llaves_removidas",          label: "Llaves removidas" },
  { key: "calzos_colocados",          label: "Calzos colocados / Amarras (si aplica)" },
  { key: "fuselaje_sin_danos",        label: "Fuselaje sin daños visibles" },
  { key: "bordes_ataque_sin_impactos",label: "Bordes de ataque sin impactos" },
  { key: "alerones_libres",           label: "Alerones libres y sin holgura" },
  { key: "tapas_combustible",         label: "Tapas de combustible aseguradas" },
  { key: "sin_fugas_combustible",     label: "Verificar fugas de combustible" },
  { key: "llantas_buen_estado",       label: "Llantas en buen estado" },
  { key: "helice_sin_melladuras",     label: "Hélice sin melladuras" },
  { key: "aceite_en_rango",           label: "Nivel de aceite dentro de rango" },
  { key: "cowling_asegurado",         label: "Cowling asegurado" },
  { key: "switches_breakers_off",     label: "Switches y breakers en OFF" },
  { key: "horas_registradas",         label: "Horas registradas (Hobbs/Tach)" },
  { key: "combustible_anotado",       label: "Combustible remanente anotado" },
  { key: "discrepancias_reportadas",  label: "Discrepancias reportadas (si aplica)" },
];

const INITIAL_CHECKS = Object.fromEntries(ITEMS.map((i) => [i.key, false]));

export default function ChecklistPostvueloModal({ id_vuelo, vueloInfo, tiempoVueloMin, onClose, onCompleted }) {
  const [checks, setChecks]           = useState(INITIAL_CHECKS);
  const [comentarios, setComentarios] = useState("");
  const [savedFirma, setSavedFirma]   = useState(null);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [error, setError]             = useState("");
  const firmaRef = useRef(null);

  const allChecked = ITEMS.every((i) => checks[i.key]);
  const v = vueloInfo ?? {};
  
  // Es de solo lectura si ya tiene firma (fue completado)
  const isReadOnly = !!savedFirma || !!v.checklist_completado;

  // Cargar datos existentes al abrir
  useEffect(() => {
    setLoading(true);
    getChecklistPostvuelo(id_vuelo)
      .then((data) => {
        if (data) {
          const loaded = {};
          ITEMS.forEach(({ key }) => { loaded[key] = data[key] ?? false; });
          setChecks(loaded);
          setComentarios(data.comentarios ?? "");
          setSavedFirma(data.firma_piloto ?? null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id_vuelo]);

  // Auto-guardar en BD cada vez que se marca un ítem
  async function toggle(key) {
    if (isReadOnly) return;
    const newChecks = { ...checks, [key]: !checks[key] };
    setChecks(newChecks);
    try {
      await guardarChecklistPostvuelo(id_vuelo, { ...newChecks, comentarios });
    } catch {
      // silencioso
    }
  }

  // Auto-guardar comentarios al salir del campo
  async function handleComentariosBlur() {
    if (isReadOnly) return;
    try {
      await guardarChecklistPostvuelo(id_vuelo, { ...checks, comentarios });
    } catch {
      // silencioso
    }
  }

  // Cancelar: cerrar sin borrar (el auto-guardado ya persistió cambios si los hubo)
  function handleCancelar() {
    onClose();
  }

  // Completar: guardar estado final con firma y avanzar vuelo a COMPLETADO
  async function handleCompletar() {
    if (isReadOnly) {
      onClose();
      return;
    }
    if (!allChecked) {
      setError("Debe marcar todos los ítems del checklist.");
      return;
    }
    if (firmaRef.current?.isEmpty()) {
      setError("Debe dibujar su firma.");
      return;
    }
    setError("");
    const firma = firmaRef.current.toDataURL();
    const user = JSON.parse(localStorage.getItem("user") ?? "{}");
    const licencia = user.numero_licencia ?? user.licencia ?? "";

    setSaving(true);
    try {
      await guardarChecklistPostvuelo(id_vuelo, {
        ...checks,
        comentarios,
        firma_piloto: firma,
        licencia_numero: licencia,
      });
      onCompleted?.();
    } catch (e) {
      setError(e.response?.data?.message || "Error al guardar el checklist. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="cpv-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cpv-modal">
        {/* ── Header ── */}
        <div className="cpv-header">
          <div className="cpv-header-left">
            <div className="cpv-logo">CAAA</div>
            <h2>Formato de Chequeo Post-Vuelo</h2>
            <div className="cpv-subtitle">
              Escuela: CAAA &nbsp;·&nbsp; Modelos: PA-38 / PA-38S / Cessna 152
            </div>
            {(v.aeronave_codigo || v.aeronave_modelo) && (
              <div className="cpv-meta">
                {v.aeronave_modelo} {v.aeronave_codigo && `· ${v.aeronave_codigo}`}
              </div>
            )}
          </div>
          <button className="cpv-close" onClick={onClose}>×</button>
        </div>

        {/* ── Body ── */}
        <div className="cpv-body">
          {error && <div className="cpv-error">{error}</div>}

          {loading ? (
            <p style={{ padding: "1rem", textAlign: "center" }}>Cargando checklist…</p>
          ) : (
            <>
              {/* Checklist */}
              <div className="cpv-section">
                <div className="cpv-progress">
                  {ITEMS.filter((i) => checks[i.key]).length} / {ITEMS.length} completados
                </div>
                <ul className="cpv-list">
                  {ITEMS.map(({ key, label }) => (
                    <li
                      key={key}
                      className={`cpv-item ${checks[key] ? "cpv-item--checked" : ""} ${isReadOnly ? "cpv-item--readonly" : ""}`}
                      onClick={() => toggle(key)}
                    >
                      <span className="cpv-checkbox">
                        {checks[key] ? "☑" : "☐"}
                      </span>
                      <span className="cpv-item-label">{label}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Comentarios */}
              <div className="cpv-section">
                <div className="cpv-section-title">Comentarios</div>
                <textarea
                  className="cpv-textarea"
                  rows={3}
                  placeholder="Observaciones adicionales…"
                  value={comentarios}
                  onChange={(e) => setComentarios(e.target.value)}
                  onBlur={handleComentariosBlur}
                  readOnly={isReadOnly}
                />
              </div>

              {/* Firma */}
              <div className="cpv-section">
                <div className="cpv-section-title">Firma del Piloto</div>
                <div className="cpv-firma-row">
                  <div className="cpv-firma-box">
                    {isReadOnly && savedFirma ? (
                      <img src={savedFirma} alt="Firma guardada" className="cpv-firma-img" />
                    ) : (
                      <>
                        <SignaturePad ref={firmaRef} width={320} height={110} />
                        <button
                          className="cpv-btn-clear"
                          onClick={() => firmaRef.current?.clear()}
                        >
                          Limpiar
                        </button>
                      </>
                    )}
                  </div>
                  <div className="cpv-firma-info">
                    <div className="cpv-firma-label">Nombre del Piloto</div>
                    <div className="cpv-firma-name">
                      {v.instructor_nombre ?? JSON.parse(localStorage.getItem("user") ?? "{}")?.nombre ?? "—"}
                    </div>
                    <div className="cpv-firma-label" style={{ marginTop: 8 }}>Licencia N°</div>
                    <div className="cpv-firma-lic">
                      {JSON.parse(localStorage.getItem("user") ?? "{}")?.numero_licencia ?? "—"}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="cpv-footer">
          {!loading && !allChecked && !isReadOnly && (
            <span className="cpv-hint">Marque todos los ítems para continuar</span>
          )}
          <button
            className="cpv-btn"
            onClick={handleCancelar}
            disabled={saving || deleting}
          >
            {isReadOnly ? "Cerrar" : (deleting ? "Borrando…" : "Cancelar")}
          </button>
          {!isReadOnly && (
            <button
              className={`cpv-btn cpv-btn--success ${!allChecked ? "cpv-btn--disabled-look" : ""}`}
              onClick={handleCompletar}
              disabled={saving || deleting || loading}
            >
              {saving ? "Guardando…" : "Completar Checklist"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
