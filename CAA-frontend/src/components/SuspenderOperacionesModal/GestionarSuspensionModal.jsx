import { useState, useEffect } from "react";
import { getBloquesHorario } from "../../services/adminApi";
import "./SuspenderOperacionesModal.css";

export default function GestionarSuspensionModal({ currentBloques = [], onClose, onConfirm }) {
  const [bloques, setBloques] = useState([]);
  const [nuevosBloques, setNuevosBloques] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBloquesHorario().then(data => {
      setBloques(data);
      setLoading(false);
    }).catch(console.error);
  }, []);

  const toggleBloque = (id) => {
    if (currentBloques.includes(id)) return; // Fijo

    if (nuevosBloques.includes(id)) {
      setNuevosBloques(nuevosBloques.filter(b => b !== id));
    } else {
      setNuevosBloques([...nuevosBloques, id]);
    }
  };

  const handleConfirm = () => {
    if (nuevosBloques.length === 0) {
      onClose();
      return;
    }
    onConfirm(nuevosBloques);
  };

  if (loading) return null;

  return (
    <div className="ops-modal-overlay">
      <div className="ops-modal">
        <div className="ops-modal__header">
          <h3>Gestionar Suspensión</h3>
          <button className="ops-modal__close" onClick={onClose}>&times;</button>
        </div>
        <div className="ops-modal__body">
          <div className="ops-modal__bloques">
            <label>Agregar más bloques a la suspensión actual</label>
            <div className="ops-modal__grid">
              {bloques.map(b => {
                const isFixed = currentBloques.includes(b.id_bloque);
                const isNew = nuevosBloques.includes(b.id_bloque);
                return (
                  <label key={b.id_bloque} className={`ops-modal__bloque ${isFixed ? 'fixed' : isNew ? 'selected' : ''}`}>
                    <input type="checkbox" checked={isFixed || isNew} disabled={isFixed} onChange={() => toggleBloque(b.id_bloque)} />
                    {b.hora_inicio.slice(0,5)} - {b.hora_fin.slice(0,5)}
                    {isFixed && <span className="ops-modal__tag">Suspendido</span>}
                  </label>
                );
              })}
            </div>
          </div>
          
          <p className="ops-modal__hint">
            Se cancelarán los vuelos de los nuevos bloques agregados.
          </p>
        </div>
        <div className="ops-modal__footer">
          <button className="ops-modal__btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="ops-modal__btn-confirm" onClick={handleConfirm} disabled={nuevosBloques.length === 0}>
            Agregar bloques
          </button>
        </div>
      </div>
    </div>
  );
}
