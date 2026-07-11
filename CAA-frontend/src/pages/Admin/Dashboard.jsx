import { useEffect, useState } from "react";
import { toast } from "sonner";
import ToastMantenimiento from "../../components/ToastMantenimiento/ToastMantenimiento";
import AdminCalendar from "../../components/AdminCalendar/AdminCalendar";
import {
  getCalendarioAdmin,
  getAeronavesActivasAdmin,
  getBloquesHorario,
  guardarCambiosAdmin,
  publicarSemana,
  precheckPublicarSemana,
  getBloquesBloqueadosAdmin as getBloquesBloqueados,
  getInstructoresActivos,
  cambiarInstructorVuelo,
} from "../../services/adminApi";
import "./Dashboard.css";

export default function AdminDashboard() {
  const [week, setWeek] = useState("next");
  const [bloques, setBloques] = useState([]);
  const [aeronaves, setAeronaves] = useState([]);
  const [items, setItems] = useState([]);
  const [originalItems, setOriginalItems] = useState([]);
  const [pendingMoves, setPendingMoves] = useState([]);
  const [hasConflicts, setHasConflicts] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bloqueos, setBloqueos] = useState([]);
  const [showVueloExtraModal, setShowVueloExtraModal] = useState(false);
  const [showAlumnoPerfil, setShowAlumnoPerfil] = useState(false);
  const [instructores, setInstructores] = useState([]);
  const [publicada, setPublicada] = useState(true);

  const load = async (w = week) => {
    setLoading(true);
    try {
      const [b, a, cal, blq] = await Promise.all([
        getBloquesHorario(),
        getAeronavesActivasAdmin(),
        getCalendarioAdmin(w),
        getBloquesBloqueados(),
      ]);
      setBloques(b);
      setAeronaves(a);
      setItems(cal.items || []);
      setOriginalItems(cal.items || []);
      setPublicada(cal.publicada);
      setBloqueos(blq);
      setPendingMoves([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [week]);

  useEffect(() => {
    getInstructoresActivos().then(setInstructores).catch(() => { });
  }, []);

  const handleDrop = (target, vueloManual = null) => {
    const draggingActual = vueloManual || dragging;
    if (!draggingActual) return;

    const origen = {
      id_bloque: draggingActual.id_bloque,
      dia_semana: draggingActual.dia_semana,
      id_aeronave: draggingActual.id_aeronave,
    };

    if (
      Number(origen.id_bloque) === Number(target.id_bloque) &&
      Number(origen.dia_semana) === Number(target.dia_semana) &&
      Number(origen.id_aeronave) === Number(target.id_aeronave)
    ) {
      setDragging(null);
      return;
    }

    const vueloArrastrado = items.find(
      (i) => Number(i.id_detalle) === Number(draggingActual.id_detalle)
    );

    if (!vueloArrastrado) {
      setDragging(null);
      return;
    }

    const ocupado = items.find(
      (i) =>
        Number(i.id_bloque) === Number(target.id_bloque) &&
        Number(i.dia_semana) === Number(target.dia_semana) &&
        Number(i.id_aeronave) === Number(target.id_aeronave) &&
        Number(i.id_detalle) !== Number(draggingActual.id_detalle)
    );

    const hayConflictoHorario = (vuelo, destino, excluirIds = []) => {
      const conflictoAlumno = items.find(
        (i) =>
          !excluirIds.includes(Number(i.id_detalle)) &&
          Number(i.dia_semana) === Number(destino.dia_semana) &&
          Number(i.id_bloque) === Number(destino.id_bloque) &&
          Number(i.id_alumno) === Number(vuelo.id_alumno)
      );

      if (conflictoAlumno) {
        return "El alumno ya tiene un vuelo en ese horario";
      }

      const conflictoInstructor = items.find(
        (i) =>
          !excluirIds.includes(Number(i.id_detalle)) &&
          Number(i.dia_semana) === Number(destino.dia_semana) &&
          Number(i.id_bloque) === Number(destino.id_bloque) &&
          Number(i.id_instructor) === Number(vuelo.id_instructor)
      );

      if (conflictoInstructor) {
        return "El instructor ya tiene un vuelo en ese horario";
      }

      return null;
    };

    if (!ocupado) {
      const conflicto = hayConflictoHorario(vueloArrastrado, target, [
        Number(vueloArrastrado.id_detalle),
      ]);

      if (conflicto) {
        if (!window.confirm(`${conflicto}. ¿Ignorar este conflicto y proceder?`)) {
          setDragging(null);
          return;
        }
      }

      setItems((prev) =>
        prev.map((i) =>
          Number(i.id_detalle) === Number(draggingActual.id_detalle)
            ? { ...i, ...target }
            : i
        )
      );

      setPendingMoves((prev) => [
        ...prev.filter((m) => Number(m.id_detalle) !== Number(draggingActual.id_detalle)),
        { id_detalle: draggingActual.id_detalle, ...target },
      ]);

      setDragging(null);
      return;
    }

    toast(`¿Intercambiar con ${ocupado.alumno_nombre}?`, {
      action: {
        label: "Intercambiar",
        onClick: () => {
          const conflictoArrastrado = hayConflictoHorario(vueloArrastrado, target, [
            Number(vueloArrastrado.id_detalle),
            Number(ocupado.id_detalle),
          ]);
          if (conflictoArrastrado) { toast.error(conflictoArrastrado); return; }

          const conflictoOcupado = hayConflictoHorario(ocupado, origen, [
            Number(vueloArrastrado.id_detalle),
            Number(ocupado.id_detalle),
          ]);
          if (conflictoOcupado) { toast.error(conflictoOcupado); return; }

          setItems((prev) =>
            prev.map((i) => {
              if (Number(i.id_detalle) === Number(vueloArrastrado.id_detalle)) return { ...i, ...target };
              if (Number(i.id_detalle) === Number(ocupado.id_detalle)) return { ...i, id_bloque: origen.id_bloque, dia_semana: origen.dia_semana, id_aeronave: origen.id_aeronave };
              return i;
            })
          );
          setPendingMoves((prev) => {
            const sinAmbos = prev.filter(
              (m) =>
                Number(m.id_detalle) !== Number(vueloArrastrado.id_detalle) &&
                Number(m.id_detalle) !== Number(ocupado.id_detalle)
            );
            return [
              ...sinAmbos,
              { id_detalle: vueloArrastrado.id_detalle, ...target },
              { id_detalle: ocupado.id_detalle, id_bloque: origen.id_bloque, dia_semana: origen.dia_semana, id_aeronave: origen.id_aeronave },
            ];
          });
        },
      },
      cancel: { label: "Cancelar", onClick: () => { } },
      duration: 10000,
    });

    setDragging(null);
  };

  const deshacerCambios = () => {
    if (window.confirm("¿Deseas revertir los ajustes no guardados? Se perderán los movimientos realizados en esta sesión.")) {
      setItems(originalItems);
      setPendingMoves([]);
    }
  };

  const guardarCambios = () => {
    if (pendingMoves.length === 0) {
      toast.warning("No hay cambios para guardar");
      return;
    }

    const msg = publicada 
      ? "¿Confirmas los cambios? Se enviará un correo de notificación al alumno afectado."
      : "¿Guardar los cambios realizados?";

    if (!window.confirm(msg)) return;

    const movesSnapshot = [...pendingMoves];
    (async () => {
      try {
        const resp = await guardarCambiosAdmin(movesSnapshot);
        toast.success(resp.message || "Cambios guardados correctamente");
        load();
      } catch (e) {
        toast.error(e.response?.data?.message || "No se pudieron guardar los cambios");
      }
    })();
  };

  const publicar = () => {
    if (hasConflicts) {
      toast.error("Acceso denegado: Debes resolver todos los cuadros en rojo antes de proceder con la publicación oficial.", {
        duration: 5000,
      });
      return;
    }

    const id_semana_activa = items.length > 0 ? items[0].id_semana : null;
    if (!id_semana_activa) {
      toast.error("No se pudo identificar la semana actual (quizás está vacía). Agrega vuelos antes de publicar.");
      return;
    }

    (async () => {
      // Aviso (no bloqueante): cuántas solicitudes van sin revisión del instructor.
      let confirmMsg = "¿Estás seguro de publicar la semana? Se generarán los vuelos oficiales y se notificará a todos los alumnos e instructores.";
      try {
        const pre = await precheckPublicarSemana(id_semana_activa);
        if (pre?.sin_revision > 0) {
          confirmMsg = `${pre.sin_revision} solicitud(es) van sin revisión del instructor (aún en borrador). Se publicarán igual.\n\n¿Publicar la semana de todas formas?`;
        }
      } catch { /* si el precheck falla, seguimos con el confirm normal */ }

      if (!window.confirm(confirmMsg)) return;

      try {
        const resp = await publicarSemana(id_semana_activa);
        toast.success("Semana publicada");
        if (resp?.conflictos_mantenimiento?.length > 0) {
          const lista = resp.conflictos_mantenimiento
            .map((c) => `${c.aeronave_codigo} (${c.tipo}, programado ${c.fecha_programada?.slice(0, 10)})`)
            .join(", ");
          toast.warning(`⚠ Aeronaves con mantenimiento pendiente: ${lista}. Reprogramá o cancelá manualmente.`, { duration: 10000 });
        }
        load();
      } catch (e) {
        toast.error(e.response?.data?.message || "No se pudo publicar la semana");
      }
    })();
  };

  const onCambiarInstructor = async (id_detalle, id_instructor_nuevo) => {
    try {
      await cambiarInstructorVuelo(id_detalle, id_instructor_nuevo);
      await load(week);
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudo cambiar el instructor");
    }
  };


  const getWeekNumber = (offset = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offset * 7);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  };

  const getWeekRangeText = (offset = 0) => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff + offset * 7));
    const saturday = new Date(monday);
    saturday.setDate(monday.getDate() + 5);
    
    const month = saturday.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
    return `Semana del ${monday.getDate()} al ${saturday.getDate()} de ${month}`;
  };

  const currentWeekDisplay = week === "current" ? getWeekRangeText(0) : getWeekRangeText(1);
  const modeIsNext = week === "next";

  return (
    <>
      <ToastMantenimiento />

      <div className="adm">

        <div className="adm__stats">
          <div className="adm__stat adm__stat--blue">
            <div className="adm__stat-header">
              <span className="adm__stat-lbl">VUELOS EN CALENDARIO</span>
              <i className="bi bi-airplane adm__stat-icon"></i>
            </div>
            <span className="adm__stat-num">{items.length}</span>
            <span className="adm__stat-sub">{currentWeekDisplay}</span>
          </div>

          <div className="adm__stat adm__stat--gold">
            <div className="adm__stat-header">
              <span className="adm__stat-lbl">AERONAVES ACTIVAS</span>
              <i className="bi bi-tools adm__stat-icon"></i>
            </div>
            <span className="adm__stat-num">{aeronaves.length}</span>
            <span className="adm__stat-sub">Operativas</span>
          </div>

          <div className="adm__stat adm__stat--blue">
            <div className="adm__stat-header">
              <span className="adm__stat-lbl">CAMBIOS PENDIENTES</span>
              <i className="bi bi-arrow-left-right adm__stat-icon"></i>
            </div>
            <span className="adm__stat-num" style={{ color: pendingMoves.length > 0 ? "var(--c-warn-700)" : "inherit" }}>
              {pendingMoves.length}
            </span>
            <span className="adm__stat-sub">Sin guardar</span>
          </div>

          <div className="adm__stat adm__stat--red">
            <div className="adm__stat-header">
              <span className="adm__stat-lbl">CANCELACIONES</span>
              <i className="bi bi-x-circle adm__stat-icon" style={{ color: 'var(--c-primary-500)' }}></i>
            </div>
            <span className="adm__stat-num" style={{ color: "var(--c-primary-500)" }}>
              {items.filter(v => v.estado_vuelo === 'CANCELADO').length}
            </span>
            <span className="adm__stat-sub">Esta semana</span>
          </div>
        </div>

        <div className="adm__section">
          <div className="adm__section-header">
            <div className="adm__section-title-wrap">
              <i className="bi bi-calendar3"></i>
              <h3 className="adm__section-title">Calendario de Vuelos</h3>
            </div>

            <div className="adm__section-controls">
              <div className="adm__week-selector">
                <button
                  className="adm__week-btn"
                  onClick={() => setWeek("current")}
                  disabled={week === "current"}
                  style={{ opacity: week === 'current' ? 0.5 : 1 }}
                >
                  &lt;
                </button>
                <span className="adm__week-label">{currentWeekDisplay}</span>
                <button
                  className="adm__week-btn"
                  onClick={() => setWeek("next")}
                  disabled={week === "next"}
                  style={{ opacity: week === 'next' ? 0.5 : 1 }}
                >
                  &gt;
                </button>
              </div>

              <div className="adm__actions">
                {pendingMoves.length > 0 && (
                  <>
                    <button
                      className="adm__btn adm__btn--undo"
                      onClick={deshacerCambios}
                    >
                      <i className="bi bi-x-lg"></i> Deshacer
                    </button>
                    <button
                      className="adm__btn adm__btn--save"
                      onClick={guardarCambios}
                    >
                      <i className="bi bi-check-lg"></i> Guardar ({pendingMoves.length})
                    </button>
                  </>
                )}
                
                {!publicada && (
                  <button
                    className="adm__btn adm__btn--publish"
                    onClick={publicar}
                  >
                    <i className="bi bi-send-fill"></i> Publicar semana
                  </button>
                )}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="adm__loading">
              <span className="adm__loading-dot" />
              <span className="adm__loading-dot" />
              <span className="adm__loading-dot" />
              Cargando calendario…
            </div>
          ) : (
            <AdminCalendar
              bloques={bloques}
              aeronaves={aeronaves}
              items={items}
              pendingMoves={pendingMoves}
              bloqueos={bloqueos}
              setDragging={setDragging}
              dragging={dragging}
              handleDrop={handleDrop}
              week={week}
              instructores={instructores}
              onCambiarInstructor={onCambiarInstructor}
              onRefresh={() => load()}
              onConflictChange={setHasConflicts}
            />
          )}
        </div>

        {/* ── Cancelaciones Recientes ── */}
        {items.some(v => v.estado_vuelo === 'CANCELADO') && (
          <div className="adm__section" style={{ marginTop: '24px' }}>
            <div className="adm__section-header">
              <div className="adm__section-info">
                <h3 className="adm__section-title">Vuelos Cancelados (Recientes)</h3>
                <p className="adm__section-hint">Últimas 5 cancelaciones registradas en esta semana</p>
              </div>
            </div>
            <div className="adm__table-wrap" style={{ padding: '0 22px 22px' }}>
              <table className="adm__cancel-table">
                <thead>
                  <tr>
                    <th>Alumno</th>
                    <th>Aeronave</th>
                    <th>Fecha/Hora</th>
                    <th>Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {items
                    .filter(v => v.estado_vuelo === 'CANCELADO')
                    .sort((a, b) => new Date(b.fecha_cancelacion || 0) - new Date(a.fecha_cancelacion || 0))
                    .slice(0, 5)
                    .map(v => (
                      <tr key={v.id_vuelo}>
                        <td>{v.alumno_nombre}</td>
                        <td><strong>{v.aeronave_codigo}</strong></td>
                        <td>{v.hora_inicio} - {v.hora_fin}</td>
                        <td>
                          <span className={`adm__cancel-badge adm__cancel-badge--${(v.tipo_cancelacion || 'NORMAL').toLowerCase()}`}>
                            {v.tipo_cancelacion || 'NORMAL'}
                          </span>
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}