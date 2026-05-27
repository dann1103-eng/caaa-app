import { useState, useEffect } from "react";
import { getBloquesHorario } from "../../services/adminApi";
import "./SuspenderOperacionesModal.css";

const MOTIVOS = ["CLIMA", "VIENTO", "VISIBILIDAD", "REVISION_PISTA", "NOTAM", "TEMPERATURA"];

export default function SuspenderOperacionesModal({ onClose, onConfirm, vuelosHoy = [] }) {
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [explicacion, setExplicacion] = useState("");
  const [bloques, setBloques] = useState([]);
  const [bloquesSeleccionados, setBloquesSeleccionados] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBloquesHorario().then(data => {
      setBloques(data);
      setLoading(false);
    }).catch(console.error);
  }, []);

  const toggleBloque = (id) => {
    if (bloquesSeleccionados.includes(id)) {
      setBloquesSeleccionados(bloquesSeleccionados.filter(b => b !== id));
    } else {
      setBloquesSeleccionados([...bloquesSeleccionados, id]);
    }
  };

  const handleConfirm = () => {
    if (bloquesSeleccionados.length === 0) {
      alert("Seleccioná al menos un bloque para suspender");
      return;
    }
    if (!explicacion.trim()) {
      alert("La explicación detallada es obligatoria para suspender");
      return;
    }
    onConfirm(motivo, bloquesSeleccionados, null, explicacion.trim());
  };

  // Filtrar vuelos afectados en bloques seleccionados (Omitir Simuladores)
  const vuelosAfectados = vuelosHoy.filter(v => 
    bloquesSeleccionados.includes(v.id_bloque) && 
    !v.aeronave_codigo?.toUpperCase().includes("SIM") &&
    ["PUBLICADO", "PROGRAMADO", "AJUSTADO", "SOLICITADO"].includes(v.estado)
  );

  if (loading) return null;

  return (
    <div className="ops-modal-overlay">
      <div className="ops-modal">
        <div className="ops-modal__header">
          <h3>Suspender Operaciones</h3>
          <button className="ops-modal__close" onClick={onClose}>&times;</button>
        </div>
        <div className="ops-modal__body">
          <div className="ops-modal__field">
            <label>Motivo de la suspensión</label>
            <select value={motivo} onChange={e => setMotivo(e.target.value)}>
              {MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="ops-modal__field">
            <label>Explicación detallada / Ticker</label>
            <textarea 
              placeholder="Describa la situación detalladamente..."
              value={explicacion} 
              onChange={e => setExplicacion(e.target.value)}
              rows={3}
            />
          </div>

          <div className="ops-modal__bloques">
            <label>Seleccionar bloques a suspender hoy</label>
            <div className="ops-modal__grid">
              {bloques.map(b => {
                const isSel = bloquesSeleccionados.includes(b.id_bloque);
                return (
                  <label key={b.id_bloque} className={`ops-modal__bloque ${isSel ? 'selected' : ''}`}>
                    <input type="checkbox" checked={isSel} onChange={() => toggleBloque(b.id_bloque)} />
                    {b.hora_inicio.slice(0, 5)} - {b.hora_fin.slice(0, 5)}
                  </label>
                );
              })}
            </div>
          </div>

          {bloquesSeleccionados.length > 0 && (
            <div className="ops-modal__vuelos-afectados">
              <label>Vuelos afectados ({vuelosAfectados.length})</label>
              <div className="ops-modal__vuelos-list">
                {vuelosAfectados.length > 0 ? (
                  vuelosAfectados.map(v => (
                    <div key={v.id_vuelo} className="ops-modal__vuelo-item">
                      <span className="v-aero">{v.aeronave_codigo}</span>
                      <span className="v-alum">{v.alumno_nombre} {v.alumno_apellido}</span>
                      <span className="v-hora">{v.hora_inicio?.slice(0, 5)}</span>
                    </div>
                  ))
                ) : (
                  <p className="ops-modal__no-vuelos">No hay vuelos de aeronaves en estos bloques.</p>
                )}
              </div>
            </div>
          )}

          <p className="ops-modal__hint">
            Se cancelarán automáticamente los vuelos de aeronaves en los bloques seleccionados.
          </p>
        </div>
        <div className="ops-modal__footer">
          <button className="ops-modal__btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="ops-modal__btn-confirm" onClick={handleConfirm}>Confirmar Suspensión</button>
        </div>
      </div>
    </div>
  );
}
