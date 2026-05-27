import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getAlumnosListAdmin, getAlumnoPerfilAdmin, setSoleado } from "../../services/adminApi";
import "./AlumnoPerfilModal.css";

function diasHastaVencer(fechaStr) {
  if (!fechaStr) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const vence = new Date(fechaStr);
  vence.setHours(0, 0, 0, 0);
  return Math.ceil((vence - hoy) / (1000 * 60 * 60 * 24));
}

function formatFecha(fechaStr) {
  if (!fechaStr) return "—";
  const d = new Date(fechaStr);
  return d.toLocaleDateString("es-SV", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}

export default function AlumnoPerfilModal({ onClose }) {
  const [alumnos, setAlumnos]       = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [perfil, setPerfil]         = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingPerfil, setLoadingPerfil] = useState(false);
  const [errorPerfil, setErrorPerfil] = useState("");
  const [toggling, setToggling]     = useState(false);

  // ── Cargar lista de alumnos ────────────────────────────────────────────────
  useEffect(() => {
    getAlumnosListAdmin()
      .then(setAlumnos)
      .catch(() => {})
      .finally(() => setLoadingList(false));
  }, []);

  // ── Cargar perfil al seleccionar alumno ────────────────────────────────────
  useEffect(() => {
    if (!selectedId) { setPerfil(null); return; }
    setLoadingPerfil(true);
    setErrorPerfil("");
    getAlumnoPerfilAdmin(selectedId)
      .then(setPerfil)
      .catch((e) => setErrorPerfil(e.response?.data?.message || "Error al cargar perfil"))
      .finally(() => setLoadingPerfil(false));
  }, [selectedId]);

  // ── Toggle soleado ─────────────────────────────────────────────────────────
  const handleToggleSoleado = async () => {
    if (!perfil || toggling) return;
    const nuevoValor = !perfil.soleado;
    setToggling(true);
    try {
      await setSoleado(perfil.id_alumno, nuevoValor);
      setPerfil((prev) => ({ ...prev, soleado: nuevoValor }));
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudo actualizar el estado soleado");
    } finally {
      setToggling(false);
    }
  };

  const dias = perfil ? diasHastaVencer(perfil.certificado_medico) : null;
  const certPorVencer = dias !== null && dias <= 30;

  return (
    <div className="ap-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ap-modal">

        {/* ── Encabezado ────────────────────────────────────────────────── */}
        <div className="ap-header">
          <div>
            <h2>Perfil de alumno</h2>
            <p className="ap-header-meta">Visualización y gestión de datos del alumno</p>
          </div>
          <button className="ap-close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        {/* ── Selector de alumno ────────────────────────────────────────── */}
        <div className="ap-selector-row">
          <label className="ap-label" htmlFor="ap-select">Seleccionar alumno</label>
          <select
            id="ap-select"
            className="ap-select"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={loadingList}
          >
            <option value="">
              {loadingList ? "Cargando…" : "— Elegí un alumno —"}
            </option>
            {alumnos.map((a) => (
              <option key={a.id_alumno} value={a.id_alumno}>
                {a.nombre_completo}
              </option>
            ))}
          </select>
        </div>

        {/* ── Cuerpo ────────────────────────────────────────────────────── */}
        <div className="ap-body">
          {!selectedId ? (
            <p className="ap-placeholder">Seleccioná un alumno para ver su perfil.</p>
          ) : loadingPerfil ? (
            <p className="ap-loading">Cargando…</p>
          ) : errorPerfil ? (
            <p className="ap-error">{errorPerfil}</p>
          ) : perfil ? (
            <>
              {/* Advertencia certificado médico */}
              {certPorVencer && (
                <div className={`ap-warning ${dias < 0 ? "ap-warning--vencido" : ""}`}>
                  {dias < 0
                    ? `Certificado médico vencido hace ${Math.abs(dias)} días`
                    : `Certificado médico vence en ${dias} día${dias === 1 ? "" : "s"}`}
                </div>
              )}

              <div className="ap-section">
                <div className="ap-section-title">Datos personales</div>
                <div className="ap-grid ap-grid--3">
                  <div className="ap-field">
                    <span className="ap-label">Nombre</span>
                    <span className="ap-val">{perfil.nombre}</span>
                  </div>
                  <div className="ap-field">
                    <span className="ap-label">Apellido</span>
                    <span className="ap-val">{perfil.apellido}</span>
                  </div>
                  <div className="ap-field">
                    <span className="ap-label">Correo</span>
                    <span className="ap-val">{perfil.correo || "—"}</span>
                  </div>
                  <div className="ap-field">
                    <span className="ap-label">Teléfono</span>
                    <span className="ap-val">{perfil.telefono || "—"}</span>
                  </div>
                  <div className="ap-field">
                    <span className="ap-label">N° Licencia</span>
                    <span className="ap-val">{perfil.numero_licencia || "—"}</span>
                  </div>
                  <div className="ap-field">
                    <span className="ap-label">Tipo de licencia</span>
                    <span className="ap-val">
                      {perfil.licencia_nombre
                        ? `${perfil.licencia_nombre} (Nivel ${perfil.licencia_nivel})`
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="ap-section">
                <div className="ap-section-title">Certificado médico</div>
                <div className="ap-grid ap-grid--2">
                  <div className="ap-field">
                    <span className="ap-label">Vencimiento</span>
                    <span className={`ap-val ${certPorVencer ? (dias < 0 ? "ap-val--vencido" : "ap-val--alerta") : ""}`}>
                      {formatFecha(perfil.certificado_medico)}
                      {dias !== null && (
                        <span className="ap-dias-badge">
                          {dias < 0 ? `vencido` : `${dias}d`}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <div className="ap-section">
                <div className="ap-section-title">Estado de vuelo</div>
                <div className="ap-soleado-row">
                  <div>
                    <div className="ap-label">Soleado (primer vuelo solo)</div>
                    <div className="ap-soleado-note">
                      Una vez activado, registra que el alumno realizó su primer vuelo solo.
                    </div>
                  </div>
                  <button
                    className={`ap-toggle ${perfil.soleado ? "ap-toggle--on" : "ap-toggle--off"}`}
                    onClick={handleToggleSoleado}
                    disabled={toggling}
                    title={perfil.soleado ? "Click para desactivar (solo correcciones)" : "Click para activar"}
                  >
                    <span className="ap-toggle-thumb" />
                    <span className="ap-toggle-label">
                      {toggling ? "…" : perfil.soleado ? "Solo" : "Dual"}
                    </span>
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>

      </div>
    </div>
  );
}
