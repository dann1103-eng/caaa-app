import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  subirConstanciasCancelacion,
  getUrlConstanciaCancelacion,
  borrarConstanciaCancelacion,
} from "../../services/alumnoApi";
import {
  ACCEPT_CONSTANCIAS, MAX_CONSTANCIAS, problemaDeConstancias, pesoLegible, iconoDeConstancia,
  abrirConUrlFirmada,
} from "../../utils/constancias";
import "../MiHorarioList/MiHorarioList.css";
import "./MisCancelaciones.css";

const ESTADOS = {
  PENDIENTE: "Pendiente",
  ACEPTADA: "Aceptada",
  RECHAZADA: "Rechazada",
  EXPIRADA: "Expirada",
};

// Las horas llegan como instantes reales; se muestran en hora de El Salvador
// esté donde esté el teléfono.
const fechaHora = (valor) => {
  const d = new Date(valor);
  return isNaN(d) ? "—" : d.toLocaleString("es-SV", {
    timeZone: "America/El_Salvador",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
};

function SolicitudCard({ s, onRefresh }) {
  const [ocupado, setOcupado] = useState(false);
  const inputRef = useRef(null);

  const adjuntos = Array.isArray(s.adjuntos) ? s.adjuntos : [];
  const pendiente = s.estado === "PENDIENTE";
  // En una emergencia la constancia es requisito: la última no se quita (el
  // servidor tampoco lo permite; acá solo se evita ofrecer algo que va a fallar).
  const esLaUltimaDeEmergencia = s.es_emergencia && adjuntos.length <= 1;

  const abrir = async (ad) => {
    try {
      await abrirConUrlFirmada(async () => (await getUrlConstanciaCancelacion(ad.id_adjunto)).url);
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudo abrir la constancia");
    }
  };

  const agregar = async (e) => {
    const nuevos = Array.from(e.target.files || []);
    e.target.value = "";
    if (nuevos.length === 0) return;
    const problema = problemaDeConstancias(nuevos, { yaHay: adjuntos.length });
    if (problema) { toast.error(problema); return; }
    setOcupado(true);
    try {
      const r = await subirConstanciasCancelacion(s.id_solicitud_cancelacion, nuevos);
      if (r?.aviso_adjuntos) toast.warning(r.aviso_adjuntos);
      else toast.success(nuevos.length === 1 ? "Constancia agregada" : "Constancias agregadas");
      onRefresh?.();
    } catch (err) {
      toast.error(err.response?.data?.message || "No se pudo subir la constancia");
    } finally {
      setOcupado(false);
    }
  };

  const quitar = async (ad) => {
    if (!window.confirm(`¿Quitar "${ad.nombre_archivo}" de tu solicitud?`)) return;
    setOcupado(true);
    try {
      await borrarConstanciaCancelacion(ad.id_adjunto);
      toast.success("Constancia quitada");
      onRefresh?.();
    } catch (err) {
      toast.error(err.response?.data?.message || "No se pudo quitar la constancia");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <article className="mc__card">
      <header className="mc__card-head">
        <span className="mc__aeronave">{s.aeronave_codigo}</span>
        <span className="mc__badges">
          {s.es_emergencia && <span className="mc__badge mc__badge--emergencia">Emergencia</span>}
          <span className={`mc__badge mc__badge--${String(s.estado || "pendiente").toLowerCase()}`}>
            {ESTADOS[s.estado] || s.estado}
          </span>
        </span>
      </header>

      <dl className="mc__datos">
        <div><dt>Vuelo</dt><dd>{fechaHora(s.fecha_hora_vuelo)}</dd></div>
        <div><dt>Pedida</dt><dd>{fechaHora(s.creado_en)}</dd></div>
      </dl>
      <p className="mc__motivo">{s.motivo}</p>

      {(adjuntos.length > 0 || pendiente) && (
        <div className="mc__constancias">
          <span className="mc__constancias-titulo">
            Constancias{adjuntos.length > 0 ? ` (${adjuntos.length})` : ""}
          </span>

          {adjuntos.length === 0 && (
            <p className="mc__sin-constancias">No adjuntaste ninguna. Podés agregar una mientras la solicitud siga pendiente.</p>
          )}

          {adjuntos.length > 0 && (
            <ul className="mc__archivos">
              {adjuntos.map((ad) => (
                <li key={ad.id_adjunto} className="mc__archivo">
                  <button type="button" className="mc__archivo-abrir" onClick={() => abrir(ad)} title={`Abrir ${ad.nombre_archivo}`}>
                    <i className={`bi ${iconoDeConstancia(ad.content_type)}`} aria-hidden="true" />
                    <span className="mc__archivo-nombre">{ad.nombre_archivo}</span>
                    <span className="mc__archivo-peso">{pesoLegible(ad.tamano_bytes)}</span>
                  </button>
                  {pendiente && !esLaUltimaDeEmergencia && (
                    <button
                      type="button"
                      className="mc__archivo-quitar"
                      onClick={() => quitar(ad)}
                      disabled={ocupado}
                      aria-label={`Quitar ${ad.nombre_archivo}`}
                      title="Quitar"
                    >
                      <i className="bi bi-x-lg" aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {pendiente && adjuntos.length < MAX_CONSTANCIAS && (
            <>
              <input ref={inputRef} type="file" multiple hidden accept={ACCEPT_CONSTANCIAS} onChange={agregar} />
              <button type="button" className="mc__agregar" onClick={() => inputRef.current?.click()} disabled={ocupado}>
                <i className="bi bi-paperclip" aria-hidden="true" />
                {ocupado ? "Subiendo…" : "Agregar constancia"}
              </button>
            </>
          )}

          {pendiente && esLaUltimaDeEmergencia && adjuntos.length === 1 && (
            <p className="mc__nota">Es una cancelación de emergencia: necesita al menos una constancia. Para cambiarla, agregá la nueva y después quitá esta.</p>
          )}
        </div>
      )}

      {s.tiene_multa && <p className="mc__multa">Con multa de ${s.monto_multa}</p>}
    </article>
  );
}

/**
 * La pestaña "Mis cancelaciones" del alumno: sus solicitudes, con las
 * constancias que adjuntó. Mientras una solicitud siga pendiente puede agregar
 * más (por ejemplo, la constancia médica que consiguió después de avisar).
 *
 * Props: solicitudes, loading, estadoCancel ({ count_mes, racha_semanas }),
 * onRefresh().
 */
export default function MisCancelaciones({ solicitudes, loading, estadoCancel, onRefresh }) {
  return (
    <div className="mhl__list mc">
      {estadoCancel && (
        <div className="mc__resumen">
          <span><strong>{estadoCancel.count_mes ?? 0}</strong> este mes</span>
          <span><strong>{estadoCancel.racha_semanas ?? 0}</strong> semana(s) seguida(s)</span>
          <p>
            Recordá: solo <strong>1 cancelación por semana</strong>. La 4ª del mes o la 4ª semana seguida generan multa de $35.
            Con menos de 24 horas para el vuelo es una <strong>cancelación de emergencia</strong> y necesita constancia.
            {(estadoCancel.count_mes >= 3 || estadoCancel.racha_semanas >= 3) && (
              <span className="mc__resumen-aviso"> Tu próxima cancelación podría tener multa.</span>
            )}
          </p>
        </div>
      )}

      {loading && solicitudes.length === 0 ? (
        <div className="mhl__state"><span className="mhl__spinner" /><span>Cargando solicitudes...</span></div>
      ) : solicitudes.length === 0 ? (
        <div className="mhl__state mhl__state--empty">No tenés solicitudes de cancelación de vuelo.</div>
      ) : (
        <div className="mc__lista">
          {solicitudes.map((s) => (
            <SolicitudCard key={s.id_solicitud_cancelacion} s={s} onRefresh={onRefresh} />
          ))}
        </div>
      )}
    </div>
  );
}
