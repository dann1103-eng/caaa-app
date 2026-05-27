import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { getAlumnosConLimite, habilitarVueloExtra } from "../../services/adminApi";
import "./Alumnos.css";

function formatFecha(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function AlumnosAdmin() {
  const [loading, setLoading] = useState(true);
  const [semana, setSemana] = useState(null);
  const [alumnos, setAlumnos] = useState([]);
  const [filas, setFilas] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [instructorSearchTerm, setInstructorSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const cargar = async () => {
    setLoading(true);
    try {
      const data = await getAlumnosConLimite();
      setSemana(data.semana);
      setAlumnos(data.alumnos);
      const estadoInicial = {};
      for (const a of data.alumnos) {
        estadoInicial[a.id_alumno] = { 
          nuevoLimiteAvion: "", 
          nuevoLimiteSimulador: "", 
          saving: false, 
          error: "" 
        };
      }
      setFilas(estadoInicial);
    } catch {
      setSemana(null);
      setAlumnos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const setFila = (id_alumno, patch) =>
    setFilas((prev) => ({
      ...prev,
      [id_alumno]: { ...prev[id_alumno], ...patch },
    }));

  const handleGuardar = async (alumno) => {
    const { nuevoLimiteAvion, nuevoLimiteSimulador } = filas[alumno.id_alumno];
    
    const limAvion = nuevoLimiteAvion.trim() === "" ? alumno.limite_vuelos_avion : Number(nuevoLimiteAvion);
    const limSim = nuevoLimiteSimulador.trim() === "" ? alumno.limite_vuelos_simulador : Number(nuevoLimiteSimulador);

    if (isNaN(limAvion) || limAvion < 0 || limAvion > 6 || isNaN(limSim) || limSim < 0 || limSim > 6) {
      setFila(alumno.id_alumno, { error: "Valores entre 0 y 6" });
      return;
    }

    setFila(alumno.id_alumno, { saving: true, error: "" });
    try {
      await habilitarVueloExtra(alumno.id_alumno, semana.id_semana, limAvion, limSim);
      setAlumnos((prev) =>
        prev.map((a) =>
          a.id_alumno === alumno.id_alumno ? { ...a, limite_vuelos_avion: limAvion, limite_vuelos_simulador: limSim } : a
        )
      );
      setFila(alumno.id_alumno, { nuevoLimiteAvion: "", nuevoLimiteSimulador: "", saving: false, error: "" });
      toast.success(`Límites actualizados para ${alumno.nombre_completo}`);
    } catch (e) {
      setFila(alumno.id_alumno, {
        saving: false,
        error: e.response?.data?.message || "Error al guardar",
      });
    }
  };

  const semanaLabel = semana
    ? `${formatFecha(semana.fecha_inicio)} — ${formatFecha(semana.fecha_fin)}`
    : null;

  return (
    <div className="alms">
      <div className="alms__card">
        <div className="alms__card-header">
          <div className="alms__header-top">
            <div>
              <h3 className="alms__title-text">Gestión de Alumnos</h3>
              <p className="alms__hint">
                Ajustá los límites de vuelos (Avión y Simulador). Por defecto son 3. Rango 0-6.
              </p>
            </div>
            <div className="alms__week-info">
              <i className="bi bi-calendar-check"></i>
              <div>
                <span className="alms__week-label">Semana de planificación</span>
                <span className="alms__week-dates">{semanaLabel || "No disponible"}</span>
              </div>
            </div>
          </div>

          <div className="alms__filters">
            <div className="alms__search-group">
              <i className="bi bi-search"></i>
              <input 
                type="text" 
                placeholder="Buscar por alumno..." 
                className="alms__search-input"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              />
            </div>
            <div className="alms__search-group">
              <i className="bi bi-person-badge"></i>
              <input 
                type="text" 
                placeholder="Buscar por instructor..." 
                className="alms__search-input"
                value={instructorSearchTerm}
                onChange={(e) => { setInstructorSearchTerm(e.target.value); setCurrentPage(1); }}
              />
            </div>
          </div>
        </div>

        <div className="alms__body">
          {loading ? (
            <div className="alms__loading">Cargando lista de alumnos…</div>
          ) : !semana ? (
            <div className="alms__empty">No hay una semana futura configurada para planificación.</div>
          ) : alumnos.length === 0 ? (
            <div className="alms__empty">No hay alumnos activos registrados.</div>
          ) : (
            <div className="alms__table-wrap">
              <table className="alms__table">
                <thead>
                  <tr>
                    <th>Alumno</th>
                    <th>Instructor</th>
                    <th className="text-center">Límite Avión</th>
                    <th className="text-center">Límite Sim.</th>
                    <th>Ajustar Límites</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const filtered = alumnos.filter(a => {
                      const matchAl = a.nombre_completo.toLowerCase().includes(searchTerm.toLowerCase());
                      const matchInst = (a.instructor_nombre || "").toLowerCase().includes(instructorSearchTerm.toLowerCase());
                      return matchAl && matchInst;
                    });
                    
                    const totalPages = Math.ceil(filtered.length / itemsPerPage);
                    const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

                    if (paginated.length === 0) {
                      return (
                        <tr>
                          <td colSpan="5" className="alms__empty-search">
                            No se encontraron resultados para tu búsqueda.
                          </td>
                        </tr>
                      );
                    }

                    return paginated.map((a) => {
                      const fila = filas[a.id_alumno] ?? { nuevoLimiteAvion: "", nuevoLimiteSimulador: "", saving: false, error: "" };
                      return (
                        <tr key={a.id_alumno}>
                          <td>
                            <div className="alms__alumno-name">{a.nombre_completo}</div>
                          </td>
                          <td>
                            <div className="alms__instructor-name">
                              <i className="bi bi-person"></i> {a.instructor_nombre || "Sin asignar"}
                            </div>
                          </td>
                          <td className="text-center">
                            <span className="alms__limite-badge">{a.limite_vuelos_avion ?? 3}</span>
                          </td>
                          <td className="text-center">
                            <span className="alms__limite-badge alms__limite-badge--sim">{a.limite_vuelos_simulador ?? 3}</span>
                          </td>
                          <td>
                            <div className="alms__action-row">
                              <div className="alms__input-group-dual">
                                <div className="alms__field">
                                  <label>Avión</label>
                                  <input
                                    className="alms__input"
                                    type="number"
                                    min={0}
                                    max={6}
                                    value={fila.nuevoLimiteAvion}
                                    onChange={(e) =>
                                      setFila(a.id_alumno, { nuevoLimiteAvion: e.target.value, error: "" })
                                    }
                                    placeholder="0-6"
                                  />
                                </div>
                                <div className="alms__field">
                                  <label>Sim.</label>
                                  <input
                                    className="alms__input"
                                    type="number"
                                    min={0}
                                    max={6}
                                    value={fila.nuevoLimiteSimulador}
                                    onChange={(e) =>
                                      setFila(a.id_alumno, { nuevoLimiteSimulador: e.target.value, error: "" })
                                    }
                                    placeholder="0-6"
                                  />
                                </div>
                                <button
                                  className="alms__save-btn"
                                  disabled={fila.saving || (!fila.nuevoLimiteAvion.trim() && !fila.nuevoLimiteSimulador.trim())}
                                  onClick={() => handleGuardar(a)}
                                >
                                  {fila.saving ? <span className="alms__spinner"></span> : "Actualizar"}
                                </button>
                              </div>
                              {fila.error && (
                                <div className="alms__error-msg">
                                  <i className="bi bi-exclamation-circle"></i> {fila.error}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Pagination ── */}
        {!loading && semana && alumnos.length > 0 && (
          <div className="alms__pagination">
            {(() => {
              const filtered = alumnos.filter(a => {
                const matchAl = a.nombre_completo.toLowerCase().includes(searchTerm.toLowerCase());
                const matchInst = (a.instructor_nombre || "").toLowerCase().includes(instructorSearchTerm.toLowerCase());
                return matchAl && matchInst;
              });
              const totalPages = Math.ceil(filtered.length / itemsPerPage);
              if (totalPages <= 1) return null;

              return (
                <div className="alms__pagination-content">
                  <button 
                    className="alms__page-btn" 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  >
                    <i className="bi bi-chevron-left"></i> Anterior
                  </button>
                  <span className="alms__page-info">
                    Página <strong>{currentPage}</strong> de {totalPages}
                  </span>
                  <button 
                    className="alms__page-btn" 
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  >
                    Siguiente <i className="bi bi-chevron-right"></i>
                  </button>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );

}
