import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  getTurnoDia,
  getInstructoresTurno,
  abrirTurnoDia,
  pausarTurnoDia,
  reanudarTurnoDia,
  cambioTurnoDia,
  cerrarTurnoDia,
  agregarInstructorTurnoDia,
  marcarSalidaInstructorTurno,
} from "../../services/turnoApi";
import "../SuspenderOperacionesModal/SuspenderOperacionesModal.css";
import "./TurnoDiaWidget.css";

// Ciclo operativo del día: apertura (con instructores de la mañana), pausa de
// almuerzo (el turno NO finaliza), cambio de turno (salen los de la mañana,
// entran los de la tarde) y cierre. Todo queda con timestamp real en el
// backend; acá solo se muestra y se dispara.

function formatHora(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString("es-SV", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/El_Salvador",
  });
}

// Modal de selección de instructores (apertura, cambio de turno, y agregar
// instructor al turno ya abierto). `excluirIds` oculta a quienes ya están
// activos en el turno en curso (no tiene sentido "agregar" a alguien que ya
// está adentro).
function SeleccionInstructoresModal({ titulo, hint, excluirIds = [], onClose, onConfirm }) {
  const [instructores, setInstructores] = useState([]);
  const [seleccion, setSeleccion] = useState([]);
  const [filtro, setFiltro] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getInstructoresTurno()
      .then(setInstructores)
      .catch(() => toast.error("No se pudo cargar la lista de instructores"))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id) => {
    setSeleccion((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const visibles = instructores
    .filter((i) => !excluirIds.includes(i.id_instructor))
    .filter((i) => i.nombre_completo.toLowerCase().includes(filtro.toLowerCase()));

  const handleConfirm = async () => {
    if (seleccion.length === 0) {
      toast.warning("Seleccioná al menos un instructor.");
      return;
    }
    setSaving(true);
    try {
      await onConfirm(seleccion);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ops-modal-overlay">
      <div className="ops-modal">
        <div className="ops-modal__header">
          <h3><i className="bi bi-people" style={{ marginRight: 8 }} />{titulo}</h3>
          <button className="ops-modal__close" onClick={onClose}>&times;</button>
        </div>
        <div className="ops-modal__body">
          {hint && <p className="ops-modal__hint" style={{ marginTop: 0 }}>{hint}</p>}
          <div className="ops-modal__field">
            <label>Instructores en turno ({seleccion.length} seleccionado{seleccion.length !== 1 ? "s" : ""})</label>
            <input
              type="text"
              className="tdw__buscar"
              placeholder="Buscar instructor…"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
            />
          </div>
          {loading ? (
            <p className="ops-modal__no-vuelos">Cargando…</p>
          ) : (
            <div className="tdw__lista">
              {visibles.map((i) => {
                const sel = seleccion.includes(i.id_instructor);
                return (
                  <label key={i.id_instructor} className={`tdw__item ${sel ? "tdw__item--sel" : ""}`}>
                    <input type="checkbox" checked={sel} onChange={() => toggle(i.id_instructor)} />
                    <i className={`bi ${sel ? "bi-check-circle-fill" : "bi-circle"}`} />
                    {i.nombre_completo}
                  </label>
                );
              })}
              {visibles.length === 0 && <p className="ops-modal__no-vuelos">Sin resultados.</p>}
            </div>
          )}
        </div>
        <div className="ops-modal__footer">
          <button className="ops-modal__btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="ops-modal__btn-confirm" disabled={saving || seleccion.length === 0} onClick={handleConfirm}>
            {saving ? "Procesando…" : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TurnoDiaWidget() {
  const [data, setData] = useState(null); // { dia, asistencias, eventos }
  const [modal, setModal] = useState(null); // 'abrir' | 'cambio'
  const [working, setWorking] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setData(await getTurnoDia());
    } catch {
      /* silencioso: si el backend aún no tiene el endpoint, el widget no molesta */
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  if (!data) return null;
  const { dia, asistencias } = data;
  const estado = dia?.estado ?? "SIN_ABRIR";

  const manana = asistencias.filter((a) => a.turno === "MANANA");
  const tarde = asistencias.filter((a) => a.turno === "TARDE");
  const huboCambio = tarde.length > 0;
  const activos = asistencias.filter((a) => !a.salida_en);

  const accion = async (fn, okMsg) => {
    setWorking(true);
    try {
      const nuevo = await fn();
      setData(nuevo);
      toast.success(okMsg);
    } catch (e) {
      toast.error(e?.response?.data?.message || "No se pudo completar la acción");
    } finally {
      setWorking(false);
    }
  };

  const handleAbrir = (ids) =>
    accion(() => abrirTurnoDia(ids), "Turno abierto — entrada registrada").then(() => setModal(null));
  const handleCambio = (ids) =>
    accion(() => cambioTurnoDia(ids), "Cambio de turno registrado").then(() => setModal(null));
  const handleAgregar = (ids) =>
    accion(() => agregarInstructorTurnoDia(ids), "Instructor(es) agregado(s) al turno").then(() => setModal(null));
  const handlePausa = () => accion(pausarTurnoDia, "Turno en pausa (almuerzo)");
  const handleReanudar = () => accion(reanudarTurnoDia, "Turno reanudado");
  const handleSalidaInstructor = (a) => {
    if (!window.confirm(`¿Marcar la salida de ${a.nombre_completo}?`)) return;
    accion(() => marcarSalidaInstructorTurno(a.id_asistencia), `Salida registrada — ${a.nombre_completo}`);
  };
  const handleCerrar = () => {
    if (!window.confirm("¿Cerrar el turno del día? Se registra la salida de los instructores presentes.")) return;
    accion(cerrarTurnoDia, "Turno cerrado");
  };

  const ESTADO_META = {
    SIN_ABRIR: { label: "Sin abrir", cls: "tdw--sinabrir" },
    ABIERTO:   { label: "Abierto",   cls: "tdw--abierto" },
    EN_PAUSA:  { label: "En pausa · almuerzo", cls: "tdw--pausa" },
    CERRADO:   { label: "Cerrado",   cls: "tdw--cerrado" },
  };
  const meta = ESTADO_META[estado];

  return (
    <div className={`tdw ${meta.cls}`}>
      <div className="tdw__head">
        <div className="tdw__estado">
          <span className="tdw__label">Turno del día</span>
          <span className="tdw__badge">{meta.label}</span>
          {dia?.apertura_en && (
            <span className="tdw__hito" title={`Abierto por ${dia.abierto_por_nombre || "—"}`}>
              <i className="bi bi-box-arrow-in-right" /> {formatHora(dia.apertura_en)}
            </span>
          )}
          {dia?.cierre_en && (
            <span className="tdw__hito" title={`Cerrado por ${dia.cerrado_por_nombre || "—"}`}>
              <i className="bi bi-box-arrow-right" /> {formatHora(dia.cierre_en)}
            </span>
          )}
        </div>
        <div className="tdw__acciones">
          {estado === "SIN_ABRIR" && (
            <button className="trn__ops-btn trn__ops-btn--primary" disabled={working} onClick={() => setModal("abrir")}>
              <i className="bi bi-sunrise" style={{ marginRight: 6 }} />Abrir turno
            </button>
          )}
          {estado === "ABIERTO" && (
            <>
              <button className="trn__ops-btn" disabled={working} onClick={() => setModal("agregar")}>
                <i className="bi bi-person-plus" style={{ marginRight: 6 }} />Agregar instructor
              </button>
              <button className="trn__ops-btn" disabled={working} onClick={handlePausa}>
                <i className="bi bi-cup-hot" style={{ marginRight: 6 }} />Pausa almuerzo
              </button>
              {!huboCambio && (
                <button className="trn__ops-btn" disabled={working} onClick={() => setModal("cambio")}>
                  <i className="bi bi-arrow-left-right" style={{ marginRight: 6 }} />Cambio de turno
                </button>
              )}
              <button className="trn__ops-btn trn__ops-btn--primary" disabled={working} onClick={handleCerrar}>
                <i className="bi bi-sunset" style={{ marginRight: 6 }} />Cerrar turno
              </button>
            </>
          )}
          {estado === "EN_PAUSA" && (
            <>
              <button className="trn__ops-btn" disabled={working} onClick={() => setModal("agregar")}>
                <i className="bi bi-person-plus" style={{ marginRight: 6 }} />Agregar instructor
              </button>
              <button className="trn__ops-btn trn__ops-btn--primary" disabled={working} onClick={handleReanudar}>
                <i className="bi bi-play-circle" style={{ marginRight: 6 }} />Reanudar
              </button>
              {!huboCambio && (
                <button className="trn__ops-btn" disabled={working} onClick={() => setModal("cambio")}>
                  <i className="bi bi-arrow-left-right" style={{ marginRight: 6 }} />Cambio de turno
                </button>
              )}
            </>
          )}
          {estado === "CERRADO" && (
            <button className="trn__ops-btn" disabled={working} onClick={() => setModal("abrir")}>
              <i className="bi bi-arrow-counterclockwise" style={{ marginRight: 6 }} />Reabrir turno
            </button>
          )}
        </div>
      </div>

      {(manana.length > 0 || tarde.length > 0) && (
        <div className="tdw__asistencias">
          {manana.length > 0 && (
            <div className="tdw__grupo">
              <span className="tdw__grupo-label"><i className="bi bi-sunrise" /> Mañana</span>
              {manana.map((a) => (
                <span key={a.id_asistencia} className={`tdw__chip ${a.salida_en ? "tdw__chip--salio" : ""}`}>
                  {a.nombre_completo}
                  <b>{formatHora(a.entrada_en)}{a.salida_en ? ` – ${formatHora(a.salida_en)}` : ""}</b>
                  {!a.salida_en && (estado === "ABIERTO" || estado === "EN_PAUSA") && (
                    <button
                      className="tdw__chip-salida"
                      title={`Marcar salida de ${a.nombre_completo}`}
                      disabled={working}
                      onClick={() => handleSalidaInstructor(a)}
                    >
                      &times;
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
          {tarde.length > 0 && (
            <div className="tdw__grupo">
              <span className="tdw__grupo-label"><i className="bi bi-sunset" /> Tarde</span>
              {tarde.map((a) => (
                <span key={a.id_asistencia} className={`tdw__chip ${a.salida_en ? "tdw__chip--salio" : ""}`}>
                  {a.nombre_completo}
                  <b>{formatHora(a.entrada_en)}{a.salida_en ? ` – ${formatHora(a.salida_en)}` : ""}</b>
                  {!a.salida_en && (estado === "ABIERTO" || estado === "EN_PAUSA") && (
                    <button
                      className="tdw__chip-salida"
                      title={`Marcar salida de ${a.nombre_completo}`}
                      disabled={working}
                      onClick={() => handleSalidaInstructor(a)}
                    >
                      &times;
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {modal === "abrir" && (
        <SeleccionInstructoresModal
          titulo={estado === "CERRADO" ? "Reabrir turno" : "Abrir turno"}
          hint="Seleccioná los instructores del turno de la mañana. Se registra la hora de apertura y la entrada de cada uno."
          onClose={() => setModal(null)}
          onConfirm={handleAbrir}
        />
      )}
      {modal === "cambio" && (
        <SeleccionInstructoresModal
          titulo="Cambio de turno"
          hint="Se marca la salida de los instructores de la mañana y la entrada de los que seleccionés para la tarde."
          onClose={() => setModal(null)}
          onConfirm={handleCambio}
        />
      )}
      {modal === "agregar" && (
        <SeleccionInstructoresModal
          titulo="Agregar instructor al turno"
          hint={`Se suma al turno de ${huboCambio ? "la tarde" : "la mañana"}, ya en curso — no afecta a quienes ya están adentro.`}
          excluirIds={activos.map((a) => a.id_instructor)}
          onClose={() => setModal(null)}
          onConfirm={handleAgregar}
        />
      )}
    </div>
  );
}
