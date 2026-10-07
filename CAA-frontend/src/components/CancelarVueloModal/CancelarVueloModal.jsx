import { useEffect, useRef, useState } from "react";
import { getCondicionesCancelacion, solicitarCancelacion } from "../../services/alumnoApi";
import {
  ACCEPT_CONSTANCIAS, MAX_CONSTANCIAS, problemaDeConstancias, pesoLegible, iconoDeConstancia,
} from "../../utils/constancias";
import "./CancelarVueloModal.css";

/**
 * Props:
 *   vuelo          – { id_vuelo, fecha_hora_vuelo, ... }
 *   onClose()      – cierra sin refrescar
 *   onCancelado()  – llamado tras enviar solicitud exitosa
 *
 * Con menos de 24 horas para el vuelo la cancelación es de EMERGENCIA y la
 * constancia pasa de opcional a requisito. Si es emergencia lo dice el servidor
 * (getCondicionesCancelacion), no el reloj del teléfono.
 */
export default function CancelarVueloModal({ vuelo, onClose, onCancelado }) {
  const [condiciones, setCondiciones] = useState([]);
  const [estado, setEstado] = useState({ count_mes: 0, racha_semanas: 0, ya_cancelo_esta_semana: false, proxima_tiene_multa: false, motivo: null, monto: 0 });
  const [esEmergencia, setEsEmergencia] = useState(false);
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
        setEsEmergencia(!!res.es_emergencia);
      })
      .catch(() => setCondiciones([]))
      .finally(() => setLoadingCond(false));
  }, [vuelo.id_vuelo]);

  const tieneMulta = estado.proxima_tiene_multa;
  const bloqueadoSemana = estado.ya_cancelo_esta_semana;

  // Constancias. Los archivos se ACUMULAN: en el teléfono se elige de a uno, y
  // elegir el segundo no tiene que reemplazar al primero.
  const [constancias, setConstancias] = useState([]);
  const [errorConstancias, setErrorConstancias] = useState("");
  const inputRef = useRef(null);

  const agregarConstancias = (e) => {
    const nuevos = Array.from(e.target.files || []);
    e.target.value = ""; // para poder volver a elegir el mismo archivo
    if (nuevos.length === 0) return;
    const todas = [...constancias, ...nuevos];
    const problema = problemaDeConstancias(todas);
    if (problema) { setErrorConstancias(problema); return; }
    setErrorConstancias("");
    setError(""); // si el envío falló por falta de constancia, ya no aplica
    setConstancias(todas);
  };

  const quitarConstancia = (i) => {
    setErrorConstancias("");
    setConstancias((lista) => lista.filter((_, j) => j !== i));
  };

  // La solicitud ya se envió, pero alguna constancia no se pudo guardar. El
  // formulario se reemplaza por el aviso: no hay nada más que enviar acá.
  const [avisoAdjuntos, setAvisoAdjuntos] = useState("");
  const enviada = avisoAdjuntos !== "";

  const faltaConstancia = esEmergencia && constancias.length === 0;

  const puedeConfirmar =
    aceptadoCondiciones &&
    motivo.trim().length > 0 &&
    (!tieneMulta || aceptadoMulta) &&
    !bloqueadoSemana &&
    !faltaConstancia &&
    !submitting;

  const handleConfirmar = async () => {
    setError("");
    setSubmitting(true);
    try {
      const r = await solicitarCancelacion(vuelo.id_vuelo, motivo.trim(), constancias);
      if (r?.aviso_adjuntos) {
        setAvisoAdjuntos(r.aviso_adjuntos);
        return;
      }
      onCancelado();
    } catch (e) {
      if (e.response?.data?.codigo === "CONSTANCIA_REQUERIDA") {
        // El formulario se abrió con margen y se envió ya dentro de las 24 h:
        // pasa a modo emergencia acá mismo, sin perder lo escrito.
        setEsEmergencia(true);
        setError("Tu vuelo ya está a menos de 24 horas: ahora es una cancelación de emergencia y necesita una constancia. Adjuntala y volvé a enviar.");
      } else {
        setError(e.response?.data?.message || "No se pudo solicitar la cancelación. Intentá de nuevo.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Mientras sube no se cierra: el pedido seguiría solo y la lista no se
  // enteraría. Una vez enviada, cerrar es refrescar.
  const cerrar = () => {
    if (submitting) return;
    if (enviada) onCancelado();
    else onClose();
  };

  return (
    <div className="cv-overlay" onClick={(e) => e.target === e.currentTarget && cerrar()}>
      <div className="cv-modal">

        {/* Header */}
        <div className="cv-header">
          <h2>{esEmergencia ? "Cancelación de emergencia" : "Solicitar cancelación"}</h2>
          {esEmergencia && <span className="cv-badge-emergencia">Menos de 24 h</span>}
          <button className="cv-close" onClick={cerrar} aria-label="Cerrar">×</button>
        </div>

        {enviada ? (
          <>
            <div className="cv-body">
              <div className="cv-enviada">
                <i className="bi bi-check-circle-fill" aria-hidden="true" />
                <div>
                  <strong>Tu solicitud de cancelación quedó enviada.</strong>
                  <p>{avisoAdjuntos}</p>
                </div>
              </div>
            </div>
            <div className="cv-footer">
              <button className="cv-btn-cancelar" onClick={onCancelado}>Entendido</button>
            </div>
          </>
        ) : (
          <>
            {/* Body */}
            <div className="cv-body">

              {esEmergencia && (
                <div className="cv-emergencia" role="alert">
                  <i className="bi bi-exclamation-octagon-fill" aria-hidden="true" />
                  <span>
                    Faltan <strong>menos de 24 horas</strong> para tu vuelo. Para enviar la solicitud
                    necesitás adjuntar <strong>al menos una constancia</strong> del motivo
                    (constancia médica, foto, captura).
                  </span>
                </div>
              )}

              {/* Resumen del estado de cancelaciones del alumno */}
              {!loadingCond && (
                <div style={{ backgroundColor: 'var(--c-surface-2, #f1f5f9)', border: '1px solid var(--c-line, #e2e8f0)', padding: '10px 12px', borderRadius: 'var(--radius-sm, 8px)', fontSize: '0.84rem', color: 'var(--c-ink-2, #334155)', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <span><strong>{estado.count_mes}</strong> cancelacion{estado.count_mes === 1 ? '' : 'es'} este mes</span>
                  <span><strong>{estado.racha_semanas}</strong> semana{estado.racha_semanas === 1 ? '' : 's'} seguida{estado.racha_semanas === 1 ? '' : 's'}</span>
                </div>
              )}

              {/* Bloqueo: ya canceló esta semana (1 por semana) */}
              {bloqueadoSemana && (
                <div style={{ backgroundColor: 'var(--c-danger-50)', border: '1px solid var(--c-danger-100)', padding: '12px', borderRadius: 'var(--radius-sm)', color: 'var(--c-danger-700)', fontSize: '0.9rem' }}>
                  <i className="bi bi-lock" /> Ya tenés una cancelación esta semana. Solo se permite <strong>1 por semana</strong>.
                </div>
              )}

              {/* Aviso Multa (server-driven: mensual o racha) */}
              {tieneMulta && !bloqueadoSemana && (
                <div style={{ backgroundColor: 'var(--c-danger-50)', border: '1px solid var(--c-danger-100)', padding: '12px', borderRadius: 'var(--radius-sm)', color: 'var(--c-danger-700)', fontSize: '0.9rem' }}>
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
                <div className="cv-aviso">
                  <i className="bi bi-info-circle" /> Ojo: tu próxima cancelación podría generar multa de $35.
                </div>
              )}

              {/* Condiciones */}
              {loadingCond ? (
                <p className="cv-ayuda">Cargando condiciones…</p>
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
                <label className="cv-label" htmlFor="cv-motivo">
                  Motivo <span className="cv-requerido">*</span>
                </label>
                <textarea
                  id="cv-motivo"
                  className="cv-textarea"
                  placeholder="Explicá brevemente el motivo de tu solicitud de cancelación…"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={3}
                />
              </div>

              {/* Constancias: requisito en emergencia, opcionales con margen */}
              <div className="cv-field">
                <span className="cv-label">
                  Constancia del motivo{" "}
                  {esEmergencia
                    ? <span className="cv-requerido">*</span>
                    : <span className="cv-opcional">(opcional)</span>}
                </span>
                <p className="cv-ayuda">
                  {esEmergencia
                    ? "Obligatoria en una cancelación de emergencia. "
                    : "Si tenés un respaldo —constancia médica, captura, etc.— podés adjuntarlo. "}
                  Fotos JPG o PNG y archivos PDF, hasta {MAX_CONSTANCIAS} archivos de 8 MB cada uno.
                </p>

                {constancias.length > 0 && (
                  <ul className="cv-archivos">
                    {constancias.map((a, i) => (
                      <li key={`${a.name}-${i}`} className="cv-archivo">
                        <i className={`bi ${iconoDeConstancia(a.type)}`} aria-hidden="true" />
                        <span className="cv-archivo__nombre">{a.name}</span>
                        <span className="cv-archivo__peso">{pesoLegible(a.size)}</span>
                        <button
                          type="button"
                          className="cv-archivo__quitar"
                          onClick={() => quitarConstancia(i)}
                          disabled={submitting}
                          aria-label={`Quitar ${a.name}`}
                          title="Quitar"
                        >
                          <i className="bi bi-x-lg" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  hidden
                  accept={ACCEPT_CONSTANCIAS}
                  onChange={agregarConstancias}
                />
                {constancias.length < MAX_CONSTANCIAS && (
                  <button
                    type="button"
                    className={`cv-adjuntar${faltaConstancia ? " cv-adjuntar--falta" : ""}`}
                    onClick={() => inputRef.current?.click()}
                    disabled={submitting}
                  >
                    <i className="bi bi-paperclip" aria-hidden="true" />
                    {constancias.length === 0 ? "Adjuntar foto o documento" : "Agregar otro"}
                  </button>
                )}
                {errorConstancias && <div className="cv-error">{errorConstancias}</div>}
              </div>

              {error && <div className="cv-error">{error}</div>}
            </div>

            {/* Footer */}
            <div className="cv-footer">
              <button className="cv-btn-cancelar" onClick={cerrar} disabled={submitting}>
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
          </>
        )}

      </div>
    </div>
  );
}
