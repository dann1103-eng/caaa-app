import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Header from "../../components/Header/Header";
import AdminCalendar from "../../components/AdminCalendar/AdminCalendar";
import AgendarVueloModal from "../../components/AgendarVueloModal/AgendarVueloModal";
import { getBloquesHorario, getBloquesBloqueados } from "../../services/agendarApi";
import {
  getSolicitudesCalendarioInstructor,
  getSolicitudesResumenInstructor,
  guardarCambiosSolicitudInstructor,
  crearSolicitudInstructor,
  eliminarSolicitudInstructor,
  enviarSolicitudInstructor,
  enviarTodasSolicitudesInstructor,
} from "../../services/instructorApi";
import "./Solicitudes.css";

const ESTADO_BADGE = {
  BORRADOR: { label: "Borrador", cls: "isol-badge--borrador" },
  EN_REVISION: { label: "Enviada a programación", cls: "isol-badge--enviada" },
  PUBLICADO: { label: "Publicada", cls: "isol-badge--publicada" },
  RECHAZADA: { label: "Rechazada", cls: "isol-badge--rechazada" },
  CANCELADA: { label: "Cancelada", cls: "isol-badge--rechazada" },
};

export default function InstructorSolicitudes() {
  const navigate = useNavigate();
  const [bloques, setBloques] = useState([]);
  const [aeronaves, setAeronaves] = useState([]);
  const [bloqueos, setBloqueos] = useState([]);
  const [items, setItems] = useState([]);
  const [dragging, setDragging] = useState(null);
  const [pendingMoves, setPendingMoves] = useState([]);
  const [resumen, setResumen] = useState({ semana: null, alumnos: [] });
  const [publicada, setPublicada] = useState(false);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [agendarCell, setAgendarCell] = useState(null);

  const miIdInstructor = (() => {
    try { return JSON.parse(localStorage.getItem("user"))?.id_instructor || null; } catch { return null; }
  })();

  const reload = async () => {
    setLoading(true);
    try {
      const [cal, res, b, blq] = await Promise.all([
        getSolicitudesCalendarioInstructor("next"),
        getSolicitudesResumenInstructor(),
        getBloquesHorario(),
        getBloquesBloqueados(),
      ]);
      setItems(Array.isArray(cal?.items) ? cal.items : []);
      setAeronaves(Array.isArray(cal?.aeronaves) ? cal.aeronaves : []);
      setPublicada(!!cal?.publicada);
      setResumen(res || { semana: null, alumnos: [] });
      setBloques(Array.isArray(b) ? b : []);
      setBloqueos(Array.isArray(blq) ? blq : []);
      setPendingMoves([]);
      setDragging(null);
    } catch (e) {
      toast.error("Error al cargar las solicitudes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  // Mover una tarjeta MÍA (drag & drop): se acumula y se guarda con el botón.
  const handleDrop = (target) => {
    if (!dragging) return;
    const idDragging = Number(dragging.id_detalle);
    const draggingItem = items.find(i => Number(i.id_detalle) === idDragging);
    if (!draggingItem || !draggingItem.es_mio) { setDragging(null); return; }

    const destino = {
      id_bloque: Number(target.id_bloque),
      dia_semana: Number(target.dia_semana),
      id_aeronave: Number(target.id_aeronave),
    };

    const conflictoAlumno = items.find(i =>
      Number(i.id_alumno) === Number(draggingItem.id_alumno) &&
      Number(i.id_bloque) === destino.id_bloque &&
      Number(i.dia_semana) === destino.dia_semana &&
      Number(i.id_detalle) !== idDragging);
    if (conflictoAlumno) {
      toast.error(`${draggingItem.alumno_nombre} ya tiene un vuelo en ese bloque.`);
      setDragging(null); return;
    }

    setItems(prev => prev.map(i => {
      if (Number(i.id_detalle) === idDragging) {
        const newFin = i.id_bloque_fin ? destino.id_bloque + (i.id_bloque_fin - i.id_bloque) : i.id_bloque_fin;
        return { ...i, ...destino, id_bloque_fin: newFin };
      }
      return i;
    }));
    setPendingMoves(prev => [
      ...prev.filter(p => Number(p.id_detalle) !== idDragging),
      { id_detalle: idDragging, ...destino },
    ]);
    setDragging(null);
  };

  const guardarMovimientos = async () => {
    if (pendingMoves.length === 0) return;
    try {
      await guardarCambiosSolicitudInstructor(pendingMoves);
      toast.success("Cambios guardados");
      reload();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Error al guardar");
    }
  };

  const enviarUno = async (id_solicitud) => {
    try {
      await enviarSolicitudInstructor(id_solicitud);
      toast.success("Enviada a programación");
      reload();
    } catch (e) {
      toast.error(e?.response?.data?.message || "No se pudo enviar");
    }
  };

  const enviarTodas = async () => {
    setEnviando(true);
    try {
      const r = await enviarTodasSolicitudesInstructor();
      toast.success(r?.message || "Enviadas");
      reload();
    } catch (e) {
      toast.error(e?.response?.data?.message || "No se pudo enviar");
    } finally {
      setEnviando(false);
    }
  };

  const alumnosConVuelos = resumen.alumnos.filter(a => Number(a.n_vuelos) > 0);
  const borradoresPendientes = alumnosConVuelos.filter(a => a.estado === "BORRADOR").length;

  return (
    <>
      <Header />
      <div className="isol">
        <div className="adm__header-modern">
          <div>
            <div className="adm__eyebrow">REVISIÓN DE VUELOS</div>
            <h2 className="adm__title">Solicitudes de mis alumnos</h2>
            <p className="adm__subtitle">
              Revisá y ajustá los vuelos que pidieron tus alumnos, luego enviálos a programación.
            </p>
          </div>
          <button className="isol__back" onClick={() => navigate("/instructor")}>
            <i className="bi bi-arrow-left"></i> Volver al panel
          </button>
        </div>

        {publicada && (
          <div className="isol__note isol__note--warn">
            <i className="bi bi-lock"></i> La semana ya fue publicada por programación — no se puede editar.
          </div>
        )}

        <div className="isol__grid">
          {/* Calendario */}
          <div className="isol__cal-wrap">
            <div className="isol__cal-head">
              <h3 className="isol__cal-title">Calendario de la semana próxima</h3>
              {pendingMoves.length > 0 && (
                <button className="isol__save-btn" onClick={guardarMovimientos}>
                  <i className="bi bi-check2"></i> Guardar cambios ({pendingMoves.length})
                </button>
              )}
            </div>
            <p className="isol__hint">
              Solo podés editar las tarjetas de <strong>tus alumnos</strong> (las demás se muestran de referencia).
            </p>
            {loading ? (
              <div className="isol__loading"><div className="pop-spinner"></div><p>Cargando…</p></div>
            ) : (
              <AdminCalendar
                bloques={bloques}
                items={items}
                pendingMoves={pendingMoves}
                bloqueos={bloqueos}
                dragging={dragging}
                setDragging={setDragging}
                handleDrop={handleDrop}
                week="next"
                aeronaves={aeronaves}
                instructores={[]}
                allowInstructorChange={false}
                canEditItem={(i) => !publicada && !!i.es_mio}
                onPersistCardEdit={async (move) => { await guardarCambiosSolicitudInstructor([move]); }}
                onRechazar={async (id_detalle) => { await eliminarSolicitudInstructor(id_detalle); }}
                rechazarLabel="Quitar de la solicitud"
                onEmptyCellClick={publicada ? undefined : (cell) => setAgendarCell(cell)}
                onRefresh={reload}
              />
            )}
          </div>

          {/* Resumen por alumno */}
          <aside className="isol__side">
            <div className="isol__side-head">
              <h3 className="isol__side-title">Mis alumnos</h3>
              {borradoresPendientes > 0 && !publicada && (
                <button className="isol__send-all" onClick={enviarTodas} disabled={enviando}>
                  <i className="bi bi-send"></i> Enviar todos ({borradoresPendientes})
                </button>
              )}
            </div>

            {resumen.alumnos.length === 0 && (
              <p className="isol__empty">No tenés alumnos asignados.</p>
            )}

            {resumen.alumnos.map((a) => {
              const badge = ESTADO_BADGE[a.estado] || null;
              const nVuelos = Number(a.n_vuelos) || 0;
              return (
                <div key={a.id_alumno} className="isol__card">
                  <div className="isol__card-top">
                    <span className="isol__card-name">{a.alumno_nombre}</span>
                    {badge && <span className={`isol-badge ${badge.cls}`}>{badge.label}</span>}
                  </div>
                  <div className="isol__card-meta">
                    <span><i className="bi bi-airplane"></i> {nVuelos} vuelo{nVuelos === 1 ? "" : "s"} solicitado{nVuelos === 1 ? "" : "s"}</span>
                  </div>
                  {a.comentario_alumno && (
                    <div className="isol__comment">
                      <i className="bi bi-chat-left-quote"></i>
                      <span>{a.comentario_alumno}</span>
                    </div>
                  )}
                  {!publicada && a.estado === "BORRADOR" && nVuelos > 0 && (
                    <button className="isol__send-one" onClick={() => enviarUno(a.id_solicitud)}>
                      <i className="bi bi-send"></i> Enviar a programación
                    </button>
                  )}
                  {a.estado === "EN_REVISION" && (
                    <div className="isol__sent-hint"><i className="bi bi-check2-all"></i> Ya enviada a programación</div>
                  )}
                </div>
              );
            })}
          </aside>
        </div>
      </div>

      {agendarCell && (
        <AgendarVueloModal
          week="next"
          publicada={false}
          id_semana={resumen.semana?.id_semana}
          dia_semana={agendarCell.dia_semana}
          id_bloque={agendarCell.id_bloque}
          bloques={bloques}
          aeronaves={aeronaves}
          fixedInstructor={miIdInstructor}
          alumnosScope={resumen.alumnos.map(a => ({
            id_alumno: a.id_alumno,
            nombre_completo: a.alumno_nombre,
            id_instructor: miIdInstructor,
          }))}
          createFn={(payload) => crearSolicitudInstructor(payload)}
          onClose={() => setAgendarCell(null)}
          onCreated={reload}
        />
      )}
    </>
  );
}
