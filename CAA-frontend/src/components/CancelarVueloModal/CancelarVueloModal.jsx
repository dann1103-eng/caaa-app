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
  const [estado, setEstado] = useState({ count_mes: 0, racha_semanas: 0, ya_cancelo_esta_semana: false, proxima_tiene_multa: false, motivo: null, monto: 0 });
  const [loadingCond, setLoadingCond] = useState(true);
  const [aceptadoCondiciones, setAceptadoCondiciones] = useState(false);
  const [aceptadoMulta, setAceptadoMulta] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getCondicionesCancelacion(vuelo.id_vuelo)
      .then((res) => {
        setCondiciones(res.condiciones || []);
        setEstado({
          count_mes: res.count_mes ?? res.cancelaciones_aceptadas_mes ?? 0,
          racha_semanas: res.racha_semanas ?? 0,
          ya_cancelo_esta_semana: !!res.ya_cancelo_esta_semana,
          proxima_tiene_multa: !!res.proxima_tiene_multa,
          motivo: res.motivo ?? null,
          monto: res.monto ?? 0,
        });
      })
      .catch(() => setCondiciones([]))
      .finally(() => setLoadingCond(false));
  }, [vuelo.id_vuelo]);

  const tieneMulta = estado.proxima_tiene_multa;
  const bloqueadoSemana = estado.ya_cancelo_esta_semana;

  const puedeConfirmar =
    aceptadoCondiciones &&
    motivo.trim().length > 0 &&
    (!tieneMulta || aceptadoMulta) &&
    !bloqueadoSemana &&
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

          {/* Resumen del estado de cancelaciones del alumno */}
          {!loadingCond && (
            <div style={{ backgroundColor: 'var(--c-surface-2, #f1f5f9)', border: '1px solid var(--c-line, #e2e8f0)', padding: '10px 12px', borderRadius: 'var(--radius-sm, 8px)', marginBottom: '14px', fontSize: '0.84rem', color: 'var(--c-ink-2, #334155)', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <span><strong>{estado.count_mes}</strong> cancelacion{estado.count_mes === 1 ? '' : 'es'} este mes</span>
              <span><strong>{estado.racha_semanas}</strong> semana{estado.racha_semanas === 1 ? '' : 's'} seguida{estado.racha_semanas === 1 ? '' : 's'}</span>
            </div>
          )}

          {/* Bloqueo: ya canceló esta semana (1 por semana) */}
          {bloqueadoSemana && (
            <div style={{ backgroundColor: 'var(--c-danger-50)', border: '1px solid var(--c-danger-100)', padding: '12px', borderRadius: 'var(--radius-sm)', marginBottom: '16px', color: 'var(--c-danger-700)', fontSize: '0.9rem' }}>
              <i className="bi bi-lock" /> Ya tenés una cancelación esta semana. Solo se permite <strong>1 por semana</strong>.
            </div>
          )}

          {/* Aviso Multa (server-driven: mensual o racha) */}
          {tieneMulta && !bloqueadoSemana && (
            <div style={{ backgroundColor: 'var(--c-danger-50)', border: '1px solid var(--c-danger-100)', padding: '12px', borderRadius: 'var(--radius-sm)', marginBottom: '16px', color: 'var(--c-danger-700)', fontSize: '0.9rem' }}>
              <i className="bi bi-exclamation-triangle" />{" "}
              {estado.motivo === 'RACHA'
                ? `Es tu 4ª semana consecutiva cancelando. `
                : `Superaste 3 cancelaciones este mes. `}
              Esta solicitud tiene un costo de <strong>${estado.monto || 35}</strong>. ¿Aceptás el cargo?
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

          {/* Aviso preventivo (aún sin multa pero cerca del umbral) */}
          {!tieneMulta && !bloqueadoSemana && (estado.count_mes >= 3 || estado.racha_semanas >= 3) && (
            <div style={{ backgroundColor: 'var(--c-warn-50, #fffbeb)', border: '1px solid var(--c-warn-100, #fef3c7)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', marginBottom: '14px', color: 'var(--c-warn-700, #b45309)', fontSize: '0.85rem' }}>
              <i className="bi bi-info-circle" /> Ojo: tu próxima cancelación podría generar multa de $35.
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
