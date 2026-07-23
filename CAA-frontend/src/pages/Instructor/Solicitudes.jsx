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
  crearSolicitudPracticaInstructor,
  getPracticaSaldo,
  eliminarSolicitudInstructor,
  guardarRemarksSolicitud,
  enviarSolicitudInstructor,
  enviarTodasSolicitudesInstructor,
  getInstructoresVuelo,
} from "../../services/instructorApi";
import "./Solicitudes.css";

const DIAS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

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
  const [instructoresVuelo, setInstructoresVuelo] = useState([]);
  const [practica, setPractica] = useState({ dia_semana: 1, id_bloque: "", id_aeronave: "", id_instructor_pic: "", tipo_instruccion: "CHEQUEO", debitar_saldo: true });
  const [enviandoPractica, setEnviandoPractica] = useState(false);
  const [saldoPractica, setSaldoPractica] = useState(null);

  const miIdInstructor = (() => {
    try { return JSON.parse(localStorage.getItem("user"))?.id_instructor || null; } catch { return null; }
  })();

  const reload = async () => {
    setLoading(true);
    try {
      const [cal, res, b, blq, ins] = await Promise.all([
        getSolicitudesCalendarioInstructor("next"),
        getSolicitudesResumenInstructor(),
        getBloquesHorario(),
        getBloquesBloqueados(),
        getInstructoresVuelo(),
      ]);
      setItems(Array.isArray(cal?.items) ? cal.items : []);
      setAeronaves(Array.isArray(cal?.aeronaves) ? cal.aeronaves : []);
      setPublicada(!!cal?.publicada);
      setResumen(res || { semana: null, alumnos: [] });
      setBloques(Array.isArray(b) ? b : []);
      setBloqueos(Array.isArray(blq) ? blq : []);
      setInstructoresVuelo(Array.isArray(ins) ? ins.filter((i) => Number(i.id_instructor) !== Number(miIdInstructor)) : []);
      setPendingMoves([]);
      setDragging(null);
    } catch (e) {
      toast.error("Error al cargar las solicitudes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  useEffect(() => {
    if (practica.id_aeronave && practica.tipo_instruccion === "REFRESH") {
      getPracticaSaldo(practica.id_aeronave)
        .then((data) => setSaldoPractica(data))
        .catch(() => setSaldoPractica(null));
    } else {
      setSaldoPractica(null);
    }
  }, [practica.id_aeronave, practica.tipo_instruccion]);

  const puedeSolicitarPractica = !publicada && practica.id_bloque && practica.id_aeronave && practica.id_instructor_pic && !enviandoPractica;

  const solicitarPractica = async () => {
    if (!puedeSolicitarPractica) return;
    setEnviandoPractica(true);
    try {
      const r = await crearSolicitudPracticaInstructor({
        dia_semana: Number(practica.dia_semana),
        id_bloque: Number(practica.id_bloque),
        id_aeronave: Number(practica.id_aeronave),
        id_instructor_pic: Number(practica.id_instructor_pic),
        tipo_instruccion: practica.tipo_instruccion,
        debitar_saldo: practica.tipo_instruccion === "REFRESH" ? practica.debitar_saldo === true : undefined,
      });
      toast.success("Vuelo de práctica solicitado");
      if (r?.debitar_saldo_ajustado) toast.warning(r.aviso);
      setPractica((p) => ({ ...p, id_bloque: "", id_aeronave: "", id_instructor_pic: "", debitar_saldo: true }));
      reload();
    } catch (e) {
      toast.error(e?.response?.data?.message || "No se pudo solicitar el vuelo de práctica");
    } finally {
      setEnviandoPractica(false);
    }
  };

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

        <div className="isol__card" style={{ marginBottom: 18 }}>
          <div className="isol__card-top">
            <span className="isol__card-name"><i className="bi bi-mortarboard" style={{ marginRight: 6 }}></i>Vuelo de práctica (con otro instructor)</span>
          </div>
          <p className="isol__hint" style={{ marginTop: 4 }}>
            ¿Vas a recibir instrucción de otro instructor (chequeo o refresh)? Solicitalo acá — vos sos el practicante, elegí quién será el PIC.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10, alignItems: "flex-end" }}>
            <div>
              <label style={{ fontSize: "0.78rem", color: "var(--c-ink-3, #64748b)", display: "block", marginBottom: 4 }}>Día</label>
              <select
                value={practica.dia_semana}
                disabled={publicada}
                onChange={(e) => setPractica((p) => ({ ...p, dia_semana: Number(e.target.value) }))}
                style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid var(--c-line-2, #e2e8f0)" }}
              >
                {[1, 2, 3, 4, 5, 6].map((d) => <option key={d} value={d}>{DIAS[d]}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: "0.78rem", color: "var(--c-ink-3, #64748b)", display: "block", marginBottom: 4 }}>Bloque</label>
              <select
                value={practica.id_bloque}
                disabled={publicada}
                onChange={(e) => setPractica((p) => ({ ...p, id_bloque: e.target.value }))}
                style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid var(--c-line-2, #e2e8f0)" }}
              >
                <option value="">— Elegí —</option>
                {bloques.map((b) => <option key={b.id_bloque} value={b.id_bloque}>{String(b.hora_inicio).slice(0,5)}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: "0.78rem", color: "var(--c-ink-3, #64748b)", display: "block", marginBottom: 4 }}>Aeronave</label>
              <select
                value={practica.id_aeronave}
                disabled={publicada}
                onChange={(e) => setPractica((p) => ({ ...p, id_aeronave: e.target.value }))}
                style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid var(--c-line-2, #e2e8f0)" }}
              >
                <option value="">— Elegí —</option>
                {aeronaves.map((a) => (
                  <option key={a.id_aeronave} value={a.id_aeronave}>{a.codigo} — {a.modelo}{a.en_mantenimiento ? " (en mantenimiento)" : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: "0.78rem", color: "var(--c-ink-3, #64748b)", display: "block", marginBottom: 4 }}>PIC (instructor que instruye)</label>
              <select
                value={practica.id_instructor_pic}
                disabled={publicada}
                onChange={(e) => setPractica((p) => ({ ...p, id_instructor_pic: e.target.value }))}
                style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid var(--c-line-2, #e2e8f0)" }}
              >
                <option value="">— Elegí al PIC —</option>
                {instructoresVuelo.map((i) => <option key={i.id_instructor} value={i.id_instructor}>{i.nombre_completo}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: "0.78rem", color: "var(--c-ink-3, #64748b)", display: "block", marginBottom: 4 }}>Sub-tipo</label>
              <select
                value={practica.tipo_instruccion}
                disabled={publicada}
                onChange={(e) => setPractica((p) => ({ ...p, tipo_instruccion: e.target.value }))}
                style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid var(--c-line-2, #e2e8f0)" }}
              >
                <option value="CHEQUEO">Chequeo — lo paga la escuela</option>
                <option value="REFRESH">Refresh — lo pago yo</option>
              </select>
            </div>
            <button className="isol__send-one" disabled={!puedeSolicitarPractica} onClick={solicitarPractica}>
              <i className="bi bi-send"></i> {enviandoPractica ? "Solicitando…" : "Solicitar"}
            </button>

            {practica.tipo_instruccion === "REFRESH" && saldoPractica != null && (
              <div style={{ flexBasis: "100%" }}>
                {saldoPractica.cubre ? (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    fontSize: "0.85rem", color: "var(--c-ink-3, #64748b)", marginTop: 4,
                  }}>
                    <span>
                      Saldo: <strong>${Number(saldoPractica.saldo).toFixed(2)}</strong>
                      {" · "}este vuelo cuesta aprox. <strong>${Number(saldoPractica.costo_estimado).toFixed(2)}</strong>
                    </span>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 500, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={practica.debitar_saldo}
                        onChange={(e) => setPractica((p) => ({ ...p, debitar_saldo: e.target.checked }))}
                      />
                      Debitar de mi saldo al completarse el vuelo
                    </label>
                  </div>
                ) : Number(saldoPractica.costo_estimado) > 0 ? (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    background: "var(--c-warn-50, #fdf6e3)", border: "1px solid var(--c-warn-700, #b8860b)",
                    color: "var(--c-warn-700, #7a5a00)", borderRadius: 10,
                    padding: "8px 12px", marginTop: 8, fontSize: "0.85rem", fontWeight: 600,
                  }}>
                    <i className="bi bi-exclamation-triangle-fill"></i>
                    <span>
                      Tu saldo (${Number(saldoPractica.saldo).toFixed(2)}) no cubre este vuelo (~${Number(saldoPractica.costo_estimado).toFixed(2)}):
                      se paga al momento del vuelo o coordinalo con Administración.
                    </span>
                  </div>
                ) : (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    background: "var(--c-surface-2, #f1f5f9)", border: "1px solid var(--c-line-2, #e2e8f0)",
                    color: "var(--c-ink-3, #64748b)", borderRadius: 10,
                    padding: "8px 12px", marginTop: 8, fontSize: "0.85rem", fontWeight: 600,
                  }}>
                    <i className="bi bi-exclamation-triangle-fill"></i>
                    <span>Este avión no tiene tarifa configurada — el pago se coordina con Administración.</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="isol__grid">
          {/* Calendario */}
          <div className="isol__cal-wrap">
            <div className="isol__cal-head">
              <h3 className="isol__cal-title">Mis solicitudes — semana próxima</h3>
              {pendingMoves.length > 0 && (
                <button className="isol__save-btn" onClick={guardarMovimientos}>
                  <i className="bi bi-check2"></i> Guardar cambios ({pendingMoves.length})
                </button>
              )}
            </div>
            <p className="isol__hint">
              Solo se muestran las horas que pidieron <strong>tus alumnos</strong>.
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
                onGuardarRemarks={async (id_detalle, remarks) => {
                  try {
                    await guardarRemarksSolicitud(id_detalle, remarks);
                    toast.success("Remarks guardados — Programación los verá al revisar.");
                  } catch (e) {
                    toast.error(e?.response?.data?.message || "No se pudieron guardar los remarks.");
                    throw e;
                  }
                }}
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
