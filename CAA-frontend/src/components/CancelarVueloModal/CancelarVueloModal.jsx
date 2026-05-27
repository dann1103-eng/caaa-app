import { useEffect, useState } from "react";
import { getCondicionesCancelacion, solicitarCancelacion } from "../../services/alumnoApi";
import "./CancelarVueloModal.css";

/**
 * Props:
 *   vuelo          – { id_vuelo, fecha_hora_vuelo, ... }
 *   onClose()      – cierra sin refrescar
 *   onCancelado()  – llamado tras enviar solicitud exitosa
 */
export default function CancelarVueloModal({ vuelo, onClose, onCancelado }) {
  const [condiciones, setCondiciones] = useState([]);
  const [cancelacionesAceptadasMes, setCancelacionesAceptadasMes] = useState(0);
  const [loadingCond, setLoadingCond] = useState(true);
  const [aceptadoCondiciones, setAceptadoCondiciones] = useState(false);
  const [aceptadoMulta, setAceptadoMulta] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getCondicionesCancelacion()
      .then((res) => {
        setCondiciones(res.condiciones || []);
        setCancelacionesAceptadasMes(res.cancelaciones_aceptadas_mes || 0);
      })
      .catch(() => setCondiciones([]))
      .finally(() => setLoadingCond(false));
  }, []);

  const tieneMulta = cancelacionesAceptadasMes >= 4;

  const puedeConfirmar =
    aceptadoCondiciones &&
    motivo.trim().length > 0 &&
    (!tieneMulta || aceptadoMulta) &&
    !submitting;

  const handleConfirmar = async () => {
    setError("");
    setSubmitting(true);
    try {
      await solicitarCancelacion(vuelo.id_vuelo, motivo.trim());
      onCancelado();
    } catch (e) {
      setError(e.response?.data?.message || "No se pudo solicitar la cancelación. Intentá de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="cv-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cv-modal">

        {/* Header */}
        <div className="cv-header">
          <h2>Solicitar cancelación</h2>
          <button className="cv-close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>

        {/* Body */}
        <div className="cv-body">

          {/* Aviso Multa */}
          {tieneMulta && (
            <div style={{ backgroundColor: '#fef2f2', border: '1px solid #f87171', padding: '12px', borderRadius: '6px', marginBottom: '16px', color: '#b91c1c', fontSize: '0.9rem' }}>
              ⚠ Has superado 4 cancelaciones este mes. Esta solicitud tiene un costo de $35. ¿Aceptás el cargo?
              <label style={{ display: 'flex', alignItems: 'center', marginTop: '10px', gap: '8px', cursor: 'pointer', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={aceptadoMulta}
                  onChange={(e) => setAceptadoMulta(e.target.checked)}
                />
                Sí, acepto el cargo.
              </label>
            </div>
          )}

          {/* Condiciones */}
          {loadingCond ? (
            <p style={{ fontSize: "0.85rem", color: "#6b7280" }}>Cargando condiciones…</p>
          ) : condiciones.length > 0 && (
            <div>
              <p className="cv-condiciones-titulo">Condiciones de cancelación</p>
              <ul className="cv-condiciones-lista">
                {condiciones.map((c) => (
                  <li key={c.id_condicion} className="cv-condicion-item">
                    <div className="cv-condicion-titulo">{c.texto}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Checkbox de aceptación */}
          <label className="cv-acepto">
            <input
              type="checkbox"
              checked={aceptadoCondiciones}
              onChange={(e) => setAceptadoCondiciones(e.target.checked)}
            />
            He leído y acepto las condiciones de cancelación
          </label>

          {/* Motivo */}
          <div className="cv-field">
            <label className="cv-label">
              Motivo <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <textarea
              className="cv-textarea"
              placeholder="Explicá brevemente el motivo de tu solicitud de cancelación…"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
            />
          </div>

          {error && <div className="cv-error">{error}</div>}
        </div>

        {/* Footer */}
        <div className="cv-footer">
          <button className="cv-btn-cancelar" onClick={onClose} disabled={submitting}>
            Volver
          </button>
          <button
            className="cv-btn-confirmar"
            onClick={handleConfirmar}
            disabled={!puedeConfirmar}
          >
            {submitting ? "Enviando…" : "Enviar solicitud"}
          </button>
        </div>

      </div>
    </div>
  );
}
