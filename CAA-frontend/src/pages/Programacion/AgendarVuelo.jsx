import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Header from "../../components/Header/Header";
import AgendarCalendar from "../../components/AgendarCalendar/AgendarCalendar";
import { 
  getAlumnosListAdmin, 
  getInstructoresActivos, 
  getAeronavesActivasAdmin,
  getAeronavesPermitidasAlumno
} from "../../services/adminApi";
import { 
  getBloquesHorario,
  getBloquesOcupados,
  getBloquesBloqueados
} from "../../services/agendarApi";
import { guardarSolicitudProgramacion } from "../../services/programacionApi";

import "../Alumno/AgendarVuelo.css";

export default function AgendarVueloProgramacion() {
  const navigate = useNavigate();

  const [alumnos, setAlumnos] = useState([]);
  const [instructores, setInstructores] = useState([]);
  const [aeronaves, setAeronaves] = useState([]);
  const [bloques, setBloques] = useState([]);
  
  const [idAlumno, setIdAlumno] = useState("");
  const [idInstructor, setIdInstructor] = useState("");
  const [selecciones, setSelecciones] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search states
  const [instructorSearch, setInstructorSearch] = useState("");
  const [alumnoSearch, setAlumnoSearch] = useState("");
  const [showInstructorList, setShowInstructorList] = useState(false);
  const [showAlumnoList, setShowAlumnoList] = useState(false);

  // Marca global: los vuelos de esta sesión son extracurriculares (práctica extra).
  const [extraMode, setExtraMode] = useState(false);

  // Modo de reserva para rutas
  const [modoReserva, setModoReserva] = useState("LOCAL");
  const [rutaAeronave, setRutaAeronave] = useState("");
  const [rutaDia, setRutaDia] = useState("1");
  const [rutaBloqueInicio, setRutaBloqueInicio] = useState("");
  const [rutaBloqueFin, setRutaBloqueFin] = useState("");

  const DIAS = [
    { id: 1, label: "Lunes" },
    { id: 2, label: "Martes" },
    { id: 3, label: "Miércoles" },
    { id: 4, label: "Jueves" },
    { id: 5, label: "Viernes" },
    { id: 6, label: "Sábado" },
  ];

  useEffect(() => {
    async function loadData() {
      try {
        const [als, ins, aeros, blqs] = await Promise.all([
          getAlumnosListAdmin(),
          getInstructoresActivos(),
          getAeronavesActivasAdmin(),
          getBloquesHorario()
        ]);
        setAlumnos(als);
        setInstructores(ins);
        setAeronaves(aeros);
        setBloques(blqs);
      } catch (e) {
        toast.error("Error al cargar datos base");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Click outside to close lists
  useEffect(() => {
    const handleClick = () => {
      setShowInstructorList(false);
      setShowAlumnoList(false);
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  // Filtered lists
  const filteredInstructores = instructores.filter(i => 
    `${i.nombre} ${i.apellido}`.toLowerCase().includes(instructorSearch.toLowerCase())
  );

  const filteredAlumnos = alumnos.filter(a => 
    Number(a.id_instructor) === Number(idInstructor) &&
    `${a.nombre} ${a.apellido}`.toLowerCase().includes(alumnoSearch.toLowerCase())
  );

  const handleSelectInstructor = (i) => {
    setIdInstructor(i.id_instructor);
    setInstructorSearch(`${i.nombre} ${i.apellido}`);
    setShowInstructorList(false);
    // Reset alumno when instructor changes
    setIdAlumno("");
    setAlumnoSearch("");
    // Volver a cargar todas las aeronaves o vaciar hasta elegir alumno
    getAeronavesActivasAdmin().then(setAeronaves);
  };

  const handleSelectAlumno = async (a) => {
    setIdAlumno(a.id_alumno);
    setAlumnoSearch(`${a.nombre} ${a.apellido}`);
    setShowAlumnoList(false);
    setSelecciones([]); // Limpiar selecciones al cambiar alumno
    
    // Cargar aeronaves permitidas para este alumno
    try {
      const permitidas = await getAeronavesPermitidasAlumno(a.id_alumno);
      setAeronaves(permitidas);
    } catch (e) {
      toast.error("Error al cargar aeronaves permitidas");
    }
  };

  // Al cambiar el alumno, podríamos querer resetear selecciones o cargar las actuales?
  // Por ahora, el usuario de prog está creando una NUEVA programación para ese alumno.
  
  const handleGuardar = async () => {
    if (!idAlumno) {
      toast.error("Seleccioná un alumno");
      return;
    }
    if (!idInstructor) {
        toast.error("Seleccioná un instructor");
        return;
    }
    if (selecciones.length === 0) {
      toast.warning("No hay vuelos seleccionados");
      return;
    }

    try {
      const payload = selecciones.map(s => ({ ...s, es_extracurricular: extraMode }));
      await guardarSolicitudProgramacion(idAlumno, idInstructor, payload);
      toast.success(extraMode ? "Programación extracurricular guardada" : "Programación guardada correctamente");
      navigate("/programacion/dashboard");
    } catch (err) {
      toast.error(err.response?.data?.message || "Error al guardar la programación");
    }
  };

  const handleAgregarRuta = () => {
    if (!rutaAeronave || !rutaDia || !rutaBloqueInicio || !rutaBloqueFin) {
      toast.warning("Completá todos los campos de la ruta");
      return;
    }
    const idxInicio = bloques.findIndex(b => Number(b.id_bloque) === Number(rutaBloqueInicio));
    const idxFin = bloques.findIndex(b => Number(b.id_bloque) === Number(rutaBloqueFin));
    if (idxFin < idxInicio) {
      toast.warning("El bloque de llegada debe ser igual o posterior al de salida");
      return;
    }
    
    setSelecciones(prev => [
      ...prev,
      {
        dia_semana: Number(rutaDia),
        id_bloque: Number(rutaBloqueInicio),
        id_aeronave: Number(rutaAeronave),
        tipo_vuelo: 'RUTA',
        id_bloque_fin: Number(rutaBloqueFin)
      }
    ]);
    
    toast.success("Ruta añadida");
    setRutaAeronave("");
    setRutaBloqueInicio("");
    setRutaBloqueFin("");
  };

  const removeSeleccion = (idx) => {
    setSelecciones(prev => prev.filter((_, i) => i !== idx));
  };

  // Al activar extracurricular: cualquier aeronave activa (no solo las de su
  // licencia). Al desactivar: volver a las permitidas del alumno.
  const toggleExtra = async (checked) => {
    setExtraMode(checked);
    setSelecciones([]);
    try {
      if (checked) {
        setAeronaves(await getAeronavesActivasAdmin());
      } else if (idAlumno) {
        setAeronaves(await getAeronavesPermitidasAlumno(idAlumno));
      }
    } catch { /* noop */ }
  };

  if (loading) {
      return (
          <div className="prog__loading" style={{ padding: '100px 0', textAlign: 'center' }}>
              <p>Cargando recursos...</p>
          </div>
      );
  }

  return (
    <>
      <Header />
      <div className="ag">
        <div className="ag__top">
          <div>
            <p className="ag__eyebrow">Programación Manual</p>
            <h2 className="ag__title">Agendar Vuelos para Alumno</h2>
            <p className="ag__subtitle">Seleccioná el alumno e instructor para crear su cronograma semanal.</p>
          </div>

          <div className="ag__top-actions">
            <button className="ag__btn-cancel" onClick={() => navigate("/programacion/dashboard")}>
              Cancelar
            </button>
            <button className="ag__btn-save" onClick={handleGuardar}>
              Guardar ({selecciones.length} vuelos)
            </button>
          </div>
        </div>

        <div className="ag__info-strip" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', overflow: 'visible' }}>
          {/* Instructor Search */}
          <div className="ag__info-card" style={{ position: 'relative' }}>
            <span className="ag__info-label">Instructor</span>
            <input 
              type="text"
              className="ag__input-search"
              placeholder="Buscar instructor..."
              value={instructorSearch}
              onChange={(e) => {
                setInstructorSearch(e.target.value);
                setIdInstructor("");
                setIdAlumno("");
                setAlumnoSearch("");
                setShowInstructorList(true);
              }}
              onFocus={(e) => {
                e.stopPropagation();
                setShowInstructorList(true);
              }}
              onClick={(e) => e.stopPropagation()}
              style={{ width: '100%', border: 'none', background: 'transparent', fontWeight: 600, color: 'var(--c-ink-1)', outline: 'none' }}
            />
            {showInstructorList && filteredInstructores.length > 0 && (
              <div className="ag__search-dropdown">
                {filteredInstructores.map(i => (
                  <div 
                    key={i.id_instructor} 
                    className="ag__search-item"
                    onClick={() => handleSelectInstructor(i)}
                  >
                    {i.nombre} {i.apellido}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Alumno Search - Only enabled if instructor selected */}
          <div className="ag__info-card" style={{ position: 'relative', opacity: idInstructor ? 1 : 0.6 }}>
            <span className="ag__info-label">Alumno (Asignados al instructor)</span>
            <input 
              type="text"
              className="ag__input-search"
              placeholder={idInstructor ? "Buscar alumno..." : "Seleccioná primero un instructor"}
              value={alumnoSearch}
              disabled={!idInstructor}
              onChange={(e) => {
                setAlumnoSearch(e.target.value);
                setIdAlumno("");
                setShowAlumnoList(true);
              }}
              onFocus={(e) => {
                e.stopPropagation();
                if(idInstructor) setShowAlumnoList(true);
              }}
              onClick={(e) => e.stopPropagation()}
              style={{ width: '100%', border: 'none', background: 'transparent', fontWeight: 600, color: 'var(--c-ink-1)', outline: 'none' }}
            />
            {showAlumnoList && idInstructor && filteredAlumnos.length > 0 && (
              <div className="ag__search-dropdown">
                {filteredAlumnos.map(a => (
                  <div 
                    key={a.id_alumno} 
                    className="ag__search-item"
                    onClick={() => handleSelectAlumno(a)}
                  >
                    {a.nombre} {a.apellido}
                  </div>
                ))}
              </div>
            )}
            {showAlumnoList && idInstructor && filteredAlumnos.length === 0 && alumnoSearch && (
              <div className="ag__search-dropdown">
                <div className="ag__search-no-results">No se encontraron alumnos asignados</div>
              </div>
            )}
          </div>
        </div>

        <div className="ag__section">
            <div className="ag__section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h3 className="ag__section-title">Selección de vuelos</h3>
                    <p className="ag__section-hint">Hacé clic en los bloques para agendar vuelos normales o usá el modo ruta.</p>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginTop: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: extraMode ? 'var(--c-info-700)' : 'var(--c-ink-2)' }}>
                        <input type="checkbox" checked={extraMode} onChange={(e) => toggleExtra(e.target.checked)} />
                        Vuelos extracurriculares (práctica extra · no cuentan a la licencia · cualquier aeronave)
                    </label>
                </div>
                <div className="ag__mode-toggle" style={{ display: 'flex', gap: '10px', background: 'var(--c-surface-2)', padding: '6px', borderRadius: 'var(--radius-sm)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '6px 12px', background: modoReserva === 'LOCAL' ? 'var(--c-surface-0)' : 'transparent', borderRadius: 'var(--radius-xs)', boxShadow: modoReserva === 'LOCAL' ? 'var(--shadow-sm)' : 'none', fontWeight: modoReserva === 'LOCAL' ? '600' : '400', color: modoReserva === 'LOCAL' ? 'var(--c-ink-1)' : 'var(--c-ink-3)' }}>
                        <input type="radio" name="modo_reserva" checked={modoReserva === 'LOCAL'} onChange={() => setModoReserva('LOCAL')} style={{ display: 'none' }} />
                        Vuelo Normal
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '6px 12px', background: modoReserva === 'RUTA' ? 'var(--c-surface-0)' : 'transparent', borderRadius: 'var(--radius-xs)', boxShadow: modoReserva === 'RUTA' ? 'var(--shadow-sm)' : 'none', fontWeight: modoReserva === 'RUTA' ? '600' : '400', color: modoReserva === 'RUTA' ? 'var(--c-ink-1)' : 'var(--c-ink-3)' }}>
                        <input type="radio" name="modo_reserva" checked={modoReserva === 'RUTA'} onChange={() => setModoReserva('RUTA')} style={{ display: 'none' }} />
                        Ruta
                    </label>
                </div>
            </div>

            {modoReserva === 'LOCAL' ? (
                <AgendarCalendar
                    selecciones={selecciones}
                    setSelecciones={(updater) => {
                        setSelecciones(prev => {
                          const locales = prev.filter(p => p.tipo_vuelo !== 'RUTA');
                          const nuevosLocales = typeof updater === 'function' ? updater(locales) : updater;
                          const rutas = prev.filter(p => p.tipo_vuelo === 'RUTA');
                          return [...rutas, ...nuevosLocales];
                        });
                    }}
                    userRole="PROGRAMACION"
                    limiteAvion={99} // No aplicar límites para programación
                    limiteSimulador={99}
                    aeronaves={aeronaves}
                    bloques={bloques}
                />
            ) : (
                <div className="ag__ruta-form" style={{ background: 'var(--c-surface-1)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--c-line-1)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--c-ink-1)' }}>Agendar Ruta</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', color: 'var(--c-ink-3)' }}>Aeronave</label>
                            <select value={rutaAeronave} onChange={e => setRutaAeronave(e.target.value)} style={{ padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--c-line-2)', background: 'var(--c-surface-0)', color: 'var(--c-ink-1)' }}>
                                <option value="">Seleccione...</option>
                                {aeronaves.filter(a => a.tipo !== 'SIMULADOR').map(a => (
                                    <option key={a.id_aeronave} value={a.id_aeronave}>{a.codigo} - {a.modelo}</option>
                                ))}
                            </select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', color: 'var(--c-ink-3)' }}>Día</label>
                            <select value={rutaDia} onChange={e => setRutaDia(e.target.value)} style={{ padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--c-line-2)', background: 'var(--c-surface-0)', color: 'var(--c-ink-1)' }}>
                                {DIAS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                            </select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', color: 'var(--c-ink-3)' }}>Hora de Salida (Bloque)</label>
                            <select value={rutaBloqueInicio} onChange={e => setRutaBloqueInicio(e.target.value)} style={{ padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--c-line-2)', background: 'var(--c-surface-0)', color: 'var(--c-ink-1)' }}>
                                <option value="">Seleccione...</option>
                                {bloques.map(b => <option key={b.id_bloque} value={b.id_bloque}>{b.hora_inicio.slice(0, 5)}</option>)}
                            </select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', color: 'var(--c-ink-3)' }}>Hora de Llegada (Bloque)</label>
                            <select value={rutaBloqueFin} onChange={e => setRutaBloqueFin(e.target.value)} style={{ padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--c-line-2)', background: 'var(--c-surface-0)', color: 'var(--c-ink-1)' }}>
                                <option value="">Seleccione...</option>
                                {bloques.map(b => <option key={b.id_bloque} value={b.id_bloque}>{b.hora_fin.slice(0, 5)}</option>)}
                            </select>
                        </div>
                    </div>
                    <div style={{ alignSelf: 'flex-end' }}>
                        <button onClick={handleAgregarRuta} style={{ background: 'var(--c-brand-700)', color: 'oklch(99% 0 0)', border: 'none', padding: '10px 20px', borderRadius: 'var(--radius-sm)', fontWeight: 600, cursor: 'pointer' }}>Agregar a Selección</button>
                    </div>
                </div>
            )}

            {selecciones.length > 0 && (
                <div style={{ marginTop: '24px' }}>
                    <h4 style={{ fontSize: '1rem', color: 'var(--c-ink-1)', marginBottom: '12px' }}>Vuelos en la Selección</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {selecciones.map((s, i) => {
                            const aero = aeronaves.find(a => Number(a.id_aeronave) === Number(s.id_aeronave));
                            const dia = DIAS.find(d => d.id === Number(s.dia_semana))?.label;
                            const bloqueStr = s.tipo_vuelo === 'RUTA' 
                                ? `Salida: Bloque ${s.id_bloque} | Llegada: Bloque ${s.id_bloque_fin}`
                                : `Bloque: ${s.id_bloque}`;
                            return (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--c-surface-2)', padding: '12px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--c-line-1)' }}>
                                    <div>
                                        <strong style={{ color: 'var(--c-ink-1)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{aero?.codigo}</strong> <span style={{ color: 'var(--c-ink-3)', fontSize: '0.9rem' }}>({s.tipo_vuelo || 'LOCAL'})</span> - {dia}
                                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--c-ink-2)', marginTop: '4px' }}>{bloqueStr}</div>
                                    </div>
                                    <button onClick={() => removeSeleccion(i)} style={{ background: 'transparent', border: 'none', color: 'var(--c-danger-700)', cursor: 'pointer', padding: '4px' }}>
                                        <i className="bi bi-trash"></i>
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
      </div>
    </>
  );
}
