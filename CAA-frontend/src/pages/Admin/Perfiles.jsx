import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { getAlumnosListAdmin, getAlumnoPerfilAdmin, setSoleado } from "../../services/adminApi";
import "./Perfiles.css";

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
  return d.toLocaleDateString("es-SV", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function PerfilesAdmin() {
  const [alumnos, setAlumnos] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [perfil, setPerfil] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingPerfil, setLoadingPerfil] = useState(false);
  const [errorPerfil, setErrorPerfil] = useState("");
  const [toggling, setToggling] = useState(false);
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    getAlumnosListAdmin()
      .then(setAlumnos)
      .catch(() => {})
      .finally(() => setLoadingList(false));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setPerfil(null);
      return;
    }
    setLoadingPerfil(true);
    setErrorPerfil("");
    getAlumnoPerfilAdmin(selectedId)
      .then(setPerfil)
      .catch((e) =>
        setErrorPerfil(e.response?.data?.message || "Error al cargar perfil")
      )
      .finally(() => setLoadingPerfil(false));
  }, [selectedId]);

  const handleToggleSoleado = async () => {
    if (!perfil || toggling) return;
    const nuevoValor = !perfil.soleado;
    setToggling(true);
    try {
      await setSoleado(perfil.id_alumno, nuevoValor);
      setPerfil((prev) => ({ ...prev, soleado: nuevoValor }));
      toast.success(`Estado soleado ${nuevoValor ? "activado" : "desactivado"}`);
    } catch (e) {
      toast.error(
        e.response?.data?.message || "No se pudo actualizar el estado soleado"
      );
    } finally {
      setToggling(false);
    }
  };

  const dias = perfil ? diasHastaVencer(perfil.certificado_medico) : null;
  const certPorVencer = dias !== null && dias <= 30;

  const diasSeguro = perfil ? diasHastaVencer(perfil.seguro_vida_vencimiento) : null;
  const seguroPorVencer = diasSeguro !== null && diasSeguro <= 30;

  const filteredAlumnos = alumnos.filter(a =>
    a.nombre_completo.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="perf">
      <div className="perf__card perf__selector-card">
        <div className="perf__card-header" style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <i className="bi bi-person-badge" style={{ color: '#1B365D', fontSize: '1.2rem' }}></i>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: '#1B365D' }}>Perfiles de Alumnos</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>Gestión de documentación y estados</p>
          </div>
        </div>
        <div className="perf__selector-row" style={{ padding: '24px' }}>
          <label className="perf__label" htmlFor="ap-select">
            Seleccionar alumno para ver detalles
          </label>
          <div className="perf__combobox-wrapper" style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
            <input
              id="ap-select"
              type="text"
              className="perf__select"
              style={{ width: '100%', boxSizing: 'border-box' }}
              placeholder={loadingList ? "Cargando lista…" : "Buscar alumno por nombre o apellido..."}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
              disabled={loadingList}
            />
            {showDropdown && filteredAlumnos.length > 0 && (
              <ul style={{ position: 'absolute', top: '100%', left: 0, width: '100%', background: '#fff', border: '1px solid #1B365D', borderRadius: '4px', zIndex: 10, maxHeight: '250px', overflowY: 'auto', listStyle: 'none', padding: 0, margin: '4px 0 0 0', color: '#1B365D', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                {filteredAlumnos.map(a => (
                  <li
                    key={a.id_alumno}
                    style={{ padding: '0.75rem 1rem', cursor: 'pointer', borderBottom: '1px solid #e2e8f0', fontSize: '0.9rem', fontWeight: '500' }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setSelectedId(a.id_alumno);
                      setSearch(a.nombre_completo);
                      setShowDropdown(false);
                    }}
                    onMouseEnter={(e) => { e.target.style.background = '#1B365D'; e.target.style.color = '#fff'; }}
                    onMouseLeave={(e) => { e.target.style.background = '#fff'; e.target.style.color = '#1B365D'; }}
                  >
                    {a.nombre_completo}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="perf__content">
        {!selectedId ? (
          <div className="perf__empty-state">
            <i className="bi bi-person-bounding-box"></i>
            <p>Seleccioná un alumno de la lista para gestionar su información.</p>
          </div>
        ) : loadingPerfil ? (
          <div className="perf__loading">Cargando perfil del alumno…</div>
        ) : errorPerfil ? (
          <div className="perf__error">{errorPerfil}</div>
        ) : perfil ? (
          <div className="perf__perfil-grid">
            {/* Warning Certificado */}
            {certPorVencer && (
              <div className={`perf__alert ${dias < 0 ? "perf__alert--danger" : "perf__alert--warning"}`}>
                <i className="bi bi-exclamation-triangle-fill"></i>
                <div>
                  <strong>Atención:</strong>{" "}
                  {dias < 0
                    ? `Certificado médico vencido hace ${Math.abs(dias)} días.`
                    : `Certificado médico vence en ${dias} día${dias === 1 ? "" : "s"}.`}
                </div>
              </div>
            )}

            <div className="perf__section">
              <h3 className="perf__section-title">Datos Personales</h3>
              <div className="perf__info-grid">
                <div className="perf__field">
                  <span className="perf__field-label">Nombre completo</span>
                  <span className="perf__field-val">{perfil.nombre} {perfil.apellido}</span>
                </div>
                <div className="perf__field">
                  <span className="perf__field-label">Correo electrónico</span>
                  <span className="perf__field-val">{perfil.correo || "—"}</span>
                </div>
                <div className="perf__field">
                  <span className="perf__field-label">Teléfono</span>
                  <span className="perf__field-val">{perfil.telefono || "—"}</span>
                </div>
                <div className="perf__field">
                  <span className="perf__field-label">Número de Licencia</span>
                  <span className="perf__field-val">{perfil.numero_licencia || "—"}</span>
                </div>
                <div className="perf__field">
                  <span className="perf__field-label">Tipo de Licencia</span>
                  <span className="perf__field-val">
                    {perfil.licencia_nombre
                      ? `${perfil.licencia_nombre} (Nivel ${perfil.licencia_nivel})`
                      : "—"}
                  </span>
                </div>
              </div>
            </div>

            <div className="perf__section">
              <h3 className="perf__section-title">Documentación Técnica</h3>
              <div className="perf__info-grid">
                <div className="perf__field">
                  <span className="perf__field-label">Certificado Médico</span>
                  <span className={`perf__field-val ${certPorVencer ? (dias < 0 ? "text-danger" : "text-warning") : ""}`}>
                    {formatFecha(perfil.certificado_medico)}
                    {dias !== null && (
                      <span className={`perf__dias-badge ${dias < 0 ? "perf__dias-badge--danger" : "perf__dias-badge--warning"}`} style={dias > 30 ? { background: '#dcfce7', color: '#166534' } : {}}>
                        {dias < 0 ? `VENCIDO` : dias <= 30 ? `${dias} días` : 'VIGENTE'}
                      </span>
                    )}
                  </span>
                </div>
                <div className="perf__field">
                  <span className="perf__field-label">Seguro de Vida</span>
                  <span className="perf__field-val">{perfil.seguro_vida || "—"}</span>
                </div>
                <div className="perf__field">
                  <span className="perf__field-label">Vigencia del Seguro</span>
                  <span className={`perf__field-val ${seguroPorVencer ? (diasSeguro < 0 ? "text-danger" : "text-warning") : ""}`}>
                    {formatFecha(perfil.seguro_vida_vencimiento)}
                    {diasSeguro !== null && (
                      <span className={`perf__dias-badge ${diasSeguro < 0 ? "perf__dias-badge--danger" : diasSeguro <= 30 ? "perf__dias-badge--warning" : ""}`} style={diasSeguro > 30 ? { background: '#dcfce7', color: '#166534' } : {}}>
                        {diasSeguro < 0 ? `VENCIDO` : diasSeguro <= 30 ? `${diasSeguro} días` : 'VIGENTE'}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>

            <div className="perf__section">
              <h3 className="perf__section-title">Estado de Vuelo (Solo/Dual)</h3>
              <div className="perf__soleado-card">
                <div className="perf__soleado-info">
                  <p className="perf__soleado-label">Habilitación de Vuelo Solo</p>
                  <p className="perf__soleado-desc">
                    Indica si el alumno ha completado su primer vuelo solo. Esto afecta las validaciones de programación.
                  </p>
                </div>
                <button
                  className={`perf__toggle ${perfil.soleado ? "perf__toggle--on" : "perf__toggle--off"}`}
                  onClick={handleToggleSoleado}
                  disabled={toggling}
                >
                  <div className="perf__toggle-track">
                    <div className="perf__toggle-thumb"></div>
                  </div>
                  <span className="perf__toggle-text">
                    {toggling ? "Cambiando…" : perfil.soleado ? "HABILITADO (SOLO)" : "DUAL (INSTRUCTOR)"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
