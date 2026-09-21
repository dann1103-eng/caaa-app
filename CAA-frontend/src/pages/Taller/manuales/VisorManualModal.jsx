import VisorManual from "./VisorManual";

/**
 * El visor en un modal. El clic en el fondo cierra SOLO este modal
 * (stopPropagation): se abre encima de otros modales (la orden de trabajo) y
 * sin eso el clic cerraba los dos.
 */
export default function VisorManualModal({ manual, paginaInicial, accion, onClose }) {
  return (
    <div className="adf-modal-backdrop vm-fondo" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="adf-card adf-modal-card vm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="adf-edit-head">
          <span className="adf-edit-head__title vm-modal__titulo" title={manual.titulo}>
            <span className="adf-edit-head__chip"><i className="bi bi-book"></i></span>
            <span className="vm-modal__texto">
              {manual.titulo}
              {manual.revision && <small className="man-tenue"> · {manual.revision}</small>}
            </span>
          </span>
          <button type="button" className="adf-btn secondary" onClick={onClose}>Cerrar</button>
        </div>
        <VisorManual manual={manual} paginaInicial={paginaInicial} accion={accion} />
      </div>
    </div>
  );
}
