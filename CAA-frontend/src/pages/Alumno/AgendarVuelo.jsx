import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Header from "../../components/Header/Header";
import AgendarCalendar from "../../components/AgendarCalendar/AgendarCalendar";
import { getMiLicencia } from "../../services/alumnoApi";
import {
  getAeronavesPermitidas,
  getMisSolicitudes,
  guardarSolicitud,
  getExtracurricularInfo,
} from "../../services/agendarApi";

import "./AgendarVuelo.css";

export default function AgendarVuelo() {
  const navigate = useNavigate();

  const [licencia, setLicencia] = useState(null);
  const [aeronaves, setAeronaves] = useState([]);
  const [selecciones, setSelecciones] = useState([]);
  const [estadoSolicitud, setEstadoSolicitud] = useState("BORRADOR");
  const [limiteAvion, setLimiteAvion] = useState(3);
  const [limiteSimulador, setLimiteSimulador] = useState(3);
  const [yaGuardado, setYaGuardado] = useState(false);
  const [initialSelecciones, setInitialSelecciones] = useState([]);
  const [comentario, setComentario] = useState("");
  const [initialComentario, setInitialComentario] = useState("");

  // Extracurricular: habilitado solo cuando el alumno ya completó sus horas de licencia.
  const [extraHabilitado, setExtraHabilitado] = useState(false);
  const [extraAeronaves, setExtraAeronaves] = useState([]); // todas las activas
  const [extraAero, setExtraAero] = useState("");
  const [extraDia, setExtraDia] = useState("1");
  const [extraBloque, setExtraBloque] = useState("");

  // Comparar si hay cambios reales respecto a lo cargado de la BD
  const tieneCambios = (() => {
    if (selecciones.length !== initialSelecciones.length) return true;
    const normalize = (s) => `${s.dia_semana}-${s.id_bloque}-${s.id_aeronave}-${s.tipo_vuelo || 'LOCAL'}-${s.id_bloque_fin || ''}-${s.es_extracurricular ? 'X' : ''}`;
    const set1 = new Set(selecciones.map(normalize));
    const set2 = new Set(initialSelecciones.map(normalize));
    if (set1.size !== set2.size) return true;
    for (let item of set1) {
      if (!set2.has(item)) return true;
    }
    return false;
  })();

  const comentarioCambiado = (comentario || "").trim() !== (initialComentario || "").trim();
  const hayCambios = tieneCambios || comentarioCambiado;

  const handleGuardar = async () => {
    if (selecciones.length === 0) return;

    try {
      await guardarSolicitud(selecciones, comentario);
      setYaGuardado(true);
      setInitialSelecciones(JSON.parse(JSON.stringify(selecciones))); // Actualizar estado inicial tras guardar
      setInitialComentario(comentario);
      toast.success("Solicitud guardada correctamente");
      navigate("/alumno/dashboard");
    } catch (err) {
      if (err.response?.status === 403) {
        toast.warning("La solicitud ya no puede modificarse");
      } else {
        toast.error(err.response?.data?.message || "Error al guardar la solicitud");
      }
    }
  };

  useEffect(() => {
    async function load() {
      try {
        const lic = await getMiLicencia();
        const aero = await getAeronavesPermitidas();
        const solicitud = await getMisSolicitudes("next");

        setLicencia(lic);
        setAeronaves(aero);

        try {
          const extra = await getExtracurricularInfo();
          setExtraHabilitado(!!extra?.habilitado);
          setExtraAeronaves(extra?.aeronaves || []);
        } catch { /* opcional: si falla, modo extracurricular oculto */ }

        if (solicitud) {
          setEstadoSolicitud(solicitud.estado);
          const limAvion = solicitud.limite_vuelos_avion ?? 3;
          const limSim = solicitud.limite_vuelos_simulador ?? 3;
          setLimiteAvion(limAvion);
          setLimiteSimulador(limSim);
          const vuelos = solicitud.vuelos || [];
          setSelecciones(vuelos);
          setInitialSelecciones(JSON.parse(JSON.stringify(vuelos))); // Guardar copia inicial para detectar cambios
          setComentario(solicitud.comentario_alumno || "");
          setInitialComentario(solicitud.comentario_alumno || "");
          
          // Si ya hay vuelos guardados y ocupan el límite, marcar como ya guardado
          // Pero si está en RECHAZADA, permitimos editar
          if (vuelos.length > 0 && solicitud.estado !== 'BORRADOR' && solicitud.estado !== 'RECHAZADA') {
            setYaGuardado(true);
          }
        }
      } catch (e) {
        console.error("Error loading agenda data:", e);
      }
    }
    load();
  }, []);

  const now = new Date();
  const svDateStr = now.toLocaleString("en-US", { timeZone: "America/El_Salvador" });
  const svDate = new Date(svDateStr);
  let diaSemanaActual = svDate.getDay();
  if (diaSemanaActual === 0) diaSemanaActual = 7;

  const diasNombres = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  
  const agendaAbierta = licencia?.dia_apertura_agenda 
    ? diaSemanaActual >= licencia.dia_apertura_agenda 
    : true;

  const agendaBloqueada = !agendaAbierta;
  const bloqueadoPorEstado = estadoSolicitud !== "BORRADOR" && estadoSolicitud !== "RECHAZADA";

  // Conteos por tipo
  const numAvionesSeleccionados = selecciones.filter(s => {
    if (s.es_extracurricular) return false;
    const aero = aeronaves.find(a => Number(a.id_aeronave) === Number(s.id_aeronave));
    return aero && aero.tipo !== 'SIMULADOR';
  }).length;

  const numSimuladoresSeleccionados = selecciones.filter(s => {
    if (s.es_extracurricular) return false;
    const aero = aeronaves.find(a => Number(a.id_aeronave) === Number(s.id_aeronave));
    return aero && aero.tipo === 'SIMULADOR';
  }).length;

  const limiteAvionExcedido = numAvionesSeleccionados > limiteAvion;
    const limiteSimuladorExcedido = numSimuladoresSeleccionados > limiteSimulador;

  const tieneConflictoAvionDia = (() => {
    const avionesPorDia = {};
    for (const s of selecciones) {
      if (s.es_extracurricular) continue;
      const aero = aeronaves.find(a => Number(a.id_aeronave) === Number(s.id_aeronave));
      if (aero?.tipo !== 'SIMULADOR') {
        const dia = Number(s.dia_semana);
        avionesPorDia[dia] = (avionesPorDia[dia] || 0) + 1;
      }
    }
    return Object.values(avionesPorDia).some(c => c > 1);
  })();

  const calendarBloqueado = bloqueadoPorEstado || agendaBloqueada;
  const saveBloqueado = bloqueadoPorEstado || selecciones.length === 0 || tieneConflictoAvionDia || limiteAvionExcedido || limiteSimuladorExcedido || agendaBloqueada || !hayCambios;

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

  const [bloques, setBloques] = useState([]);
  useEffect(() => {
    import("../../services/agendarApi").then(({ getBloquesHorario }) => {
      getBloquesHorario().then(setBloques).catch(console.error);
    });
  }, []);

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
    
    // Add to selecciones
    setSelecciones(prev => [
      ...prev.filter(s => s.tipo_vuelo !== 'RUTA'), // Only 1 route, or keep appending? Let's just append
      {
        dia_semana: Number(rutaDia),
        id_bloque: Number(rutaBloqueInicio),
        id_aeronave: Number(rutaAeronave),
        tipo_vuelo: 'RUTA',
        id_bloque_fin: Number(rutaBloqueFin)
      }
    ]);
    
    toast.success("Ruta añadida a la selección");
    setRutaAeronave("");
    setRutaBloqueInicio("");
    setRutaBloqueFin("");
  };

  const handleAgregarExtra = () => {
    if (!extraAero || !extraDia || !extraBloque) {
      toast.warning("Completá aeronave, día y bloque del vuelo extracurricular");
      return;
    }
    setSelecciones(prev => [
      ...prev,
      {
        dia_semana: Number(extraDia),
        id_bloque: Number(extraBloque),
        id_aeronave: Number(extraAero),
        tipo_vuelo: 'LOCAL',
        id_bloque_fin: Number(extraBloque),
        es_extracurricular: true,
      }
    ]);
    toast.success("Vuelo extracurricular añadido a la selección");
    setExtraAero("");
    setExtraBloque("");
  };

  // Busca una aeronave en la lista de permitidas o en la de todas (extracurricular).
  const findAero = (id) =>
    aeronaves.find(a => Number(a.id_aeronave) === Number(id)) ||
    extraAeronaves.find(a => Number(a.id_aeronave) === Number(id));

  const removeSeleccion = (idx) => {
    setSelecciones(prev => prev.filter((_, i) => i !== idx));
  };

  return (
    <>
      <Header />

      <div className="ag">

        <div className="ag__top">
          <div>
            <p className="ag__eyebrow">Próxima semana</p>
            <h2 className="ag__title">Agendar vuelos</h2>
            <p className="ag__subtitle">
              Respetá tus límites: <strong>{limiteAvion} avión{limiteAvion !== 1 ? 'es' : ''}</strong> y <strong>{limiteSimulador} simulador{limiteSimulador !== 1 ? 'es' : ''}</strong> por semana.
            </p>
          </div>

          <div className="ag__top-actions">
            <button
              className="ag__btn-cancel"
              onClick={() => navigate("/alumno/dashboard")}
            >
              Cancelar
            </button>
            <button
              className={`ag__btn-save ${saveBloqueado ? "ag__btn-save--disabled" : ""}`}
              disabled={saveBloqueado}
              onClick={handleGuardar}
            >
              {tieneConflictoAvionDia
                ? "Conflicto de aviones"
                : !hayCambios && !bloqueadoPorEstado
                  ? "Sin cambios"
                  : `Guardar (${selecciones.length} vuelos)`}
            </button>
          </div>

        </div>

        <div className="ag__info-strip">
          {licencia && (
            <div className="ag__info-card">
              <span className="ag__info-label">Licencia</span>
              <span className="ag__info-value">{licencia.nombre}</span>
            </div>
          )}
          <div className="ag__info-card">
            <span className="ag__info-label">Aviones</span>
            <span className={`ag__info-value ${limiteAvionExcedido || tieneConflictoAvionDia ? "ag__info-value--warn" : "ag__info-value--teal"}`}>
              {numAvionesSeleccionados} / {limiteAvion}
            </span>
          </div>
          <div className="ag__info-card">
            <span className="ag__info-label">Simuladores</span>
            <span className={`ag__info-value ${limiteSimuladorExcedido ? "ag__info-value--warn" : "ag__info-value--teal"}`}>
              {numSimuladoresSeleccionados} / {limiteSimulador}
            </span>
          </div>
          <div className="ag__info-card">
            <span className="ag__info-label">Estado solicitud</span>
            <span className={`ag__info-value ${bloqueadoPorEstado || yaGuardado ? "ag__info-value--warn" : "ag__info-value--teal"}`}>
              {estadoSolicitud}
            </span>
          </div>
        </div>

        {!bloqueadoPorEstado && (
          <div className="ag__comment">
            <label className="ag__comment-label" htmlFor="ag-comentario">
              <i className="bi bi-chat-left-text"></i> Comentario para tu instructor <span className="ag__comment-opt">(opcional)</span>
            </label>
            <textarea
              id="ag-comentario"
              className="ag__comment-input"
              rows={2}
              maxLength={500}
              placeholder="Ej.: también tengo disponible el jueves a las 10:00 por si hay que reacomodar."
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              disabled={agendaBloqueada}
            />
          </div>
        )}

        {agendaBloqueada && (
          <div className="ag__alert ag__alert--locked">
            <span className="ag__alert-icon"><i className="bi bi-lock-fill"></i></span>
            <div>
              <strong>Agenda cerrada:</strong> La agenda para tu nivel <strong>{licencia?.nombre}</strong> abre el <strong>{diasNombres[licencia.dia_apertura_agenda]}</strong>. 
              <br />
              <small>Hoy es {diasNombres[diaSemanaActual]}. Los espacios se habilitarán automáticamente el día programado.</small>
            </div>
          </div>
        )}

        {estadoSolicitud === "RECHAZADA" && (
          <div className="ag__alert ag__alert--rejected">
            <span className="ag__alert-icon"><i className="bi bi-x-circle-fill"></i></span>
            <div>
              <strong>Solicitud Rechazada:</strong> Tu solicitud anterior fue rechazada por Operaciones. 
              Podés realizar ajustes y volver a <strong>Guardar</strong> para que sea revisada nuevamente.
            </div>
          </div>
        )}

        {bloqueadoPorEstado && estadoSolicitud !== "RECHAZADA" && (
          <div className="ag__alert">
            <span className="ag__alert-icon"><i className="bi bi-exclamation-triangle-fill"></i></span>
            Tu solicitud está en <strong>{estadoSolicitud}</strong> y ya no puede
            modificarse.
          </div>
        )}

        {tieneConflictoAvionDia && (
          <div className="ag__alert ag__alert--warn">
            <span className="ag__alert-icon"><i className="bi bi-exclamation-triangle-fill"></i></span>
            <strong>Conflicto:</strong> Tenés más de 1 avión seleccionado en el mismo día. Desmarcá el exceso para poder guardar.
          </div>
        )}

        {!limiteAvionExcedido && !limiteSimuladorExcedido && !tieneConflictoAvionDia && !bloqueadoPorEstado && selecciones.length > 0 && (
          <div className="ag__alert ag__alert--ready">
            <span className="ag__alert-icon"><i className="bi bi-check2-circle"></i></span>
            {selecciones.length} vuelo{selecciones.length !== 1 ? 's' : ''} seleccionado{selecciones.length !== 1 ? 's' : ''}. Presioná <strong>Guardar</strong> para confirmar tu solicitud.
          </div>
        )}

        <div className="ag__section">
          <div className="ag__section-header">
            <h3 className="ag__section-title">Aeronaves permitidas</h3>
            <p className="ag__section-hint">
              Solo podés agendar vuelos con estas aeronaves
            </p>
          </div>
          <div className="ag__aeronaves-grid">
            {aeronaves.map((a) => (
              <div key={a.id_aeronave} className="ag__aeronave-card">
                <span className="ag__aeronave-icon"><i className={`bi ${a.tipo === 'SIMULADOR' ? 'bi-pc-display' : 'bi-airplane-fill'}`}></i></span>
                <div>
                  <strong>{a.codigo}</strong>
                  <span>{a.modelo}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="ag__section">
          <div className="ag__section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 className="ag__section-title">Seleccioná tus vuelos</h3>
              <p className="ag__section-hint">Máx. 1 avión por día · lunes a sábado</p>
            </div>
            <div className="ag__mode-toggle" style={{ display: 'flex', gap: '10px', background: 'var(--c-surface-2)', padding: '6px', borderRadius: 'var(--radius-sm)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '6px 12px', background: modoReserva === 'LOCAL' ? 'var(--c-surface-0)' : 'transparent', borderRadius: 'var(--radius-xs)', border: modoReserva === 'LOCAL' ? '1px solid var(--c-line-1)' : '1px solid transparent', fontWeight: modoReserva === 'LOCAL' ? '600' : '400', color: modoReserva === 'LOCAL' ? 'var(--c-ink-1)' : 'var(--c-ink-3)' }}>
                <input type="radio" name="modo_reserva" checked={modoReserva === 'LOCAL'} onChange={() => setModoReserva('LOCAL')} style={{ margin: 0 }} />
                Vuelo Normal
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '6px 12px', background: modoReserva === 'RUTA' ? 'var(--c-surface-0)' : 'transparent', borderRadius: 'var(--radius-xs)', border: modoReserva === 'RUTA' ? '1px solid var(--c-line-1)' : '1px solid transparent', fontWeight: modoReserva === 'RUTA' ? '600' : '400', color: modoReserva === 'RUTA' ? 'var(--c-ink-1)' : 'var(--c-ink-3)' }}>
                <input type="radio" name="modo_reserva" checked={modoReserva === 'RUTA'} onChange={() => setModoReserva('RUTA')} style={{ margin: 0 }} />
                Ruta
              </label>
              {extraHabilitado && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '6px 12px', background: modoReserva === 'EXTRA' ? 'var(--c-surface-0)' : 'transparent', borderRadius: 'var(--radius-xs)', border: modoReserva === 'EXTRA' ? '1px solid var(--c-line-1)' : '1px solid transparent', fontWeight: modoReserva === 'EXTRA' ? '600' : '400', color: modoReserva === 'EXTRA' ? 'var(--c-info-700)' : 'var(--c-ink-3)' }}>
                  <input type="radio" name="modo_reserva" checked={modoReserva === 'EXTRA'} onChange={() => setModoReserva('EXTRA')} style={{ margin: 0 }} />
                  Extracurricular
                </label>
              )}
            </div>
          </div>
          
          {modoReserva === 'LOCAL' ? (
            <AgendarCalendar
              selecciones={selecciones}
              setSelecciones={(updater) => {
                setSelecciones(prev => {
                  const extra = prev.filter(p => p.es_extracurricular);
                  const rutas = prev.filter(p => p.tipo_vuelo === 'RUTA' && !p.es_extracurricular);
                  const locales = prev.filter(p => p.tipo_vuelo !== 'RUTA' && !p.es_extracurricular);
                  const nuevosLocales = typeof updater === 'function' ? updater(locales) : updater;
                  return [...extra, ...rutas, ...nuevosLocales];
                });
              }}
              bloqueado={calendarBloqueado}
              limiteAvion={limiteAvion}
              limiteSimulador={limiteSimulador}
            />
          ) : modoReserva === 'RUTA' ? (
            <div className="ag__ruta-form" style={{ background: 'var(--c-surface-1)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--c-line-1)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <h4 style={{ margin: 0, fontSize: 'var(--text-md)', color: 'var(--c-ink-1)' }}>Agendar Ruta</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--c-ink-3)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>Aeronave</label>
                  <select value={rutaAeronave} onChange={e => setRutaAeronave(e.target.value)} disabled={calendarBloqueado} style={{ padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--c-line-2)' }}>
                    <option value="">Seleccione...</option>
                    {aeronaves.filter(a => a.tipo !== 'SIMULADOR').map(a => (
                      <option key={a.id_aeronave} value={a.id_aeronave}>{a.codigo} - {a.modelo}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--c-ink-3)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>Día</label>
                  <select value={rutaDia} onChange={e => setRutaDia(e.target.value)} disabled={calendarBloqueado} style={{ padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--c-line-2)' }}>
                    {DIAS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--c-ink-3)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>Hora de Salida (Bloque)</label>
                  <select value={rutaBloqueInicio} onChange={e => setRutaBloqueInicio(e.target.value)} disabled={calendarBloqueado} style={{ padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--c-line-2)' }}>
                    <option value="">Seleccione...</option>
                    {bloques.map(b => <option key={b.id_bloque} value={b.id_bloque}>{b.hora_inicio.slice(0, 5)}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--c-ink-3)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>Hora de Llegada (Bloque)</label>
                  <select value={rutaBloqueFin} onChange={e => setRutaBloqueFin(e.target.value)} disabled={calendarBloqueado} style={{ padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--c-line-2)' }}>
                    <option value="">Seleccione...</option>
                    {bloques.map(b => <option key={b.id_bloque} value={b.id_bloque}>{b.hora_fin.slice(0, 5)}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ alignSelf: 'flex-end' }}>
                <button onClick={handleAgregarRuta} disabled={calendarBloqueado} style={{ background: 'var(--c-brand-700)', color: 'oklch(99% 0 0)', border: 'none', padding: '10px 20px', borderRadius: 'var(--radius-sm)', fontWeight: 600, cursor: calendarBloqueado ? 'not-allowed' : 'pointer' }}>Agregar a Selección</button>
              </div>
            </div>
          ) : (
            <div className="ag__ruta-form" style={{ background: 'var(--c-surface-1)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--c-info-100)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: 'var(--text-md)', color: 'var(--c-info-700)' }}>Vuelo extracurricular</h4>
                <p style={{ margin: '6px 0 0', fontSize: 'var(--text-sm)', color: 'var(--c-ink-3)' }}>
                  Práctica extra (ya completaste las horas de tu licencia). Se cobra a tarifa, no cuenta a tu límite semanal y puede usar cualquier aeronave. Tiene prioridad de agenda menor.
                </p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--c-ink-3)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>Aeronave</label>
                  <select value={extraAero} onChange={e => setExtraAero(e.target.value)} disabled={calendarBloqueado} style={{ padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--c-line-2)' }}>
                    <option value="">Seleccione...</option>
                    {extraAeronaves.map(a => (
                      <option key={a.id_aeronave} value={a.id_aeronave}>{a.codigo} - {a.modelo}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--c-ink-3)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>Día</label>
                  <select value={extraDia} onChange={e => setExtraDia(e.target.value)} disabled={calendarBloqueado} style={{ padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--c-line-2)' }}>
                    {DIAS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--c-ink-3)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>Hora (Bloque)</label>
                  <select value={extraBloque} onChange={e => setExtraBloque(e.target.value)} disabled={calendarBloqueado} style={{ padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--c-line-2)' }}>
                    <option value="">Seleccione...</option>
                    {bloques.map(b => <option key={b.id_bloque} value={b.id_bloque}>{b.hora_inicio.slice(0, 5)}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ alignSelf: 'flex-end' }}>
                <button onClick={handleAgregarExtra} disabled={calendarBloqueado} style={{ background: 'var(--c-brand-700)', color: 'oklch(99% 0 0)', border: 'none', padding: '10px 20px', borderRadius: 'var(--radius-sm)', fontWeight: 600, cursor: calendarBloqueado ? 'not-allowed' : 'pointer' }}>Agregar a Selección</button>
              </div>
            </div>
          )}

          {selecciones.length > 0 && (
            <div style={{ marginTop: '24px' }}>
              <h4 style={{ fontSize: 'var(--text-md)', color: 'var(--c-ink-1)', marginBottom: '12px' }}>Vuelos Seleccionados (Recordá presionar "Guardar" arriba para confirmar)</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selecciones.map((s, i) => {
                  const aero = findAero(s.id_aeronave);
                  const dia = DIAS.find(d => d.id === Number(s.dia_semana))?.label;
                  const bloqueStr = s.tipo_vuelo === 'RUTA'
                    ? `Salida: Bloque ${s.id_bloque} | Llegada: Bloque ${s.id_bloque_fin}`
                    : `Bloque: ${s.id_bloque}`;
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: s.es_extracurricular ? 'var(--c-info-50)' : 'var(--c-surface-1)', padding: '12px 16px', borderRadius: 'var(--radius-sm)', border: s.es_extracurricular ? '1px solid var(--c-info-100)' : '1px solid var(--c-line-1)' }}>
                      <div>
                        <strong style={{ color: 'var(--c-ink-1)', fontFamily: 'var(--font-mono)' }}>{aero?.codigo}</strong> <span style={{ color: 'var(--c-ink-3)', fontSize: 'var(--text-sm)' }}>({s.tipo_vuelo || 'LOCAL'})</span> - {dia}
                        {s.es_extracurricular && (
                          <span style={{ marginLeft: 8, fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--c-info-700)', background: 'var(--c-info-100)', padding: '2px 8px', borderRadius: 'var(--radius-pill)' }}>EXTRACURRICULAR</span>
                        )}
                        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--c-ink-2)', marginTop: '4px' }}>{bloqueStr}</div>
                      </div>
                      <button onClick={() => removeSeleccion(i)} disabled={calendarBloqueado} style={{ background: 'transparent', border: 'none', color: 'var(--c-danger-700)', cursor: 'pointer', padding: '4px' }}>
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