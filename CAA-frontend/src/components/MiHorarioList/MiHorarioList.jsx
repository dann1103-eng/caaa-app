import { useState } from "react";
import { useNavigate } from "react-router-dom";
import CancelarVueloModal from "../CancelarVueloModal/CancelarVueloModal";
import { quitarSolicitudCancelacion } from "../../services/alumnoApi";
import { toast } from "sonner";
import ReporteVueloModal from "../ReporteVueloModal/ReporteVueloModal";
import { fechaLocal } from "../../utils/fechas";
import "./MiHorarioList.css";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function formatHora12(hora24) {
  const hhmm = (hora24 || "").slice(0, 5);
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${String(hour).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatFecha(isoString) {
  if (!isoString) return "";
  // fecha_vuelo es DATE (medianoche UTC) → formatearla en local restaba un día
  // (el alumno veía "LUNES 7 jun" para el vuelo del lunes 8).
  const d = fechaLocal(isoString);
  return d ? d.toLocaleDateString("es-SV", { day: "numeric", month: "short" }) : "";
}

const ESTADO_CFG = {
  PUBLICADO:      { label: "Publicado",       cls: "mhl__badge--publicado" },
  // Sinónimo histórico de PUBLICADO (mismo significado; turnoController.js ya
  // los trata igual en su tabla de transición NEXT_ESTADO). Quedó en 108
  // vuelos de la semana cargada por Excel del 22-27 jun 2026 (migración
  // 20260624000004) que usó este nombre en vez de PUBLICADO.
  PROGRAMADO:     { label: "Publicado",       cls: "mhl__badge--publicado" },
  BORRADOR:       { label: "Borrador",        cls: "mhl__badge--borrador" },
  CANCELADO:      { label: "Cancelado",       cls: "mhl__badge--cancelado" },
  COMPLETADO:     { label: "Completado",      cls: "mhl__badge--completado" },
  SALIDA_HANGAR:  { label: "Salida hangar",   cls: "mhl__badge--en-vuelo" },
  EN_PROGRESO:    { label: "En progreso",     cls: "mhl__badge--en-vuelo" },
  REGRESO_HANGAR: { label: "Regreso hangar",  cls: "mhl__badge--en-vuelo" },
  FINALIZANDO:    { label: "Finalizando",     cls: "mhl__badge--en-vuelo" },
  AJUSTADO:       { label: "Ajustado",        cls: "mhl__badge--ajustado" },
};

function VueloCard({ v, weekMode, horasTotales, onSolicitarCancelacion, onQuitarSolicitud, onPlan, onReporte }) {
  const fechaReferencia = v.fecha_hora_vuelo || v.fecha_vuelo;
  const esFuturo = new Date(fechaReferencia) > new Date();
  const msRestantes = new Date(fechaReferencia) - new Date();
  const esEmergencia = esFuturo && msRestantes / (1000 * 60 * 60) <= 24;
  const esReal = v.aeronave_tipo !== "SIMULADOR";
  const cfg = ESTADO_CFG[v.estado] ?? { label: v.estado, cls: "" };

  return (
    <div className={`mhl__vuelo mhl__vuelo--${v.estado ? String(v.estado).toLowerCase() : 'unknown'}`}>
      <div className="mhl__vuelo-row">
        <div className="mhl__vuelo-meta">
          <span className="mhl__vuelo-hora">{formatHora12(v.hora_inicio)}</span>
          <span className="mhl__vuelo-sep">·</span>
          <span className="mhl__vuelo-aeronave">{v.aeronave_codigo}</span>
          {v.aeronave_tipo === "SIMULADOR" && (
            <span className="mhl__vuelo-sim">SIM</span>
          )}
        </div>
        <span className={`mhl__badge ${cfg.cls}`}>{cfg.label}</span>
      </div>

      {(v.estado === "PUBLICADO" || v.estado === "AJUSTADO" || v.estado === "PROGRAMADO") && (
        <div className="mhl__vuelo-actions">
          {esReal && (
            horasTotales >= 0 ? (
              <button className="mhl__btn mhl__btn--plan" onClick={onPlan}>
                {(v.loadsheet_estado === 'ENVIADO' || v.loadsheet_estado === 'COMPLETADO')
                  ? 'Revisar plan de vuelo'
                  : 'Plan de vuelo'}
              </button>
            ) : (
              <span className="mhl__btn-locked" title="El plan de vuelo digital está disponible para alumnos con 0 o más horas de vuelo acumuladas">
                Plan de vuelo
              </span>
            )
          )}

          {esFuturo && v.estado_solicitud_cancelacion === 'PENDIENTE' && (
            <button
              className="mhl__btn mhl__btn--withdraw"
              onClick={onQuitarSolicitud}
            >
              Quitar solicitud
            </button>
          )}

          {esFuturo && v.estado_solicitud_cancelacion !== 'PENDIENTE' && (
            <button
              className="mhl__btn mhl__btn--cancel"
              onClick={onSolicitarCancelacion}
            >
              Solicitar cancelación
            </button>
          )}
        </div>
      )}

      {v.estado === "COMPLETADO" && v.reporte_estado === "PENDIENTE_ALUMNO" && (
        <div className="mhl__vuelo-actions">
          <button className="mhl__btn mhl__btn--reporte" onClick={onReporte}>
            Reporte pendiente de firma
          </button>
        </div>
      )}

      {v.estado === "COMPLETADO" && v.reporte_estado === "COMPLETADO" && (
        <div className="mhl__vuelo-actions">
          <button className="mhl__btn mhl__btn--reporte" onClick={onReporte}>
            Ver Reporte de Vuelo
          </button>
        </div>
      )}

      {v.estado === "BORRADOR" && (
        <p className="mhl__vuelo-draft-note">Slot solicitado · pendiente de publicación</p>
      )}
    </div>
  );
}

export default function MiHorarioList({ vuelos = [], weekMode, loading, onRefresh }) {
  const navigate = useNavigate();
  const [modalVuelo, setModalVuelo]     = useState(null);
  const [reporteVuelo, setReporteVuelo] = useState(null);

  const horasTotales = vuelos.length > 0 ? Number(vuelos[0].horas_totales ?? 0) : 0;

  const porDia = {};
  for (const v of vuelos) {
    if (!porDia[v.dia_semana]) porDia[v.dia_semana] = [];
    porDia[v.dia_semana].push(v);
  }
  const dias = Object.keys(porDia).map(Number).sort();

  const abrirLoadsheet = (v) => {
    // El loadsheet ahora vive dentro de la misma app (no app externa).
    navigate(`/alumno/loadsheet/${v.id_vuelo}`);
  };

  const abrirCancelar = (v) => {
    setModalVuelo(v);
  };

  const handleQuitarSolicitud = async (v) => {
    if (!v.id_solicitud_cancelacion) return;
    if (!window.confirm("¿Estás seguro de que querés retirar la solicitud de cancelación?")) return;

    try {
      await quitarSolicitudCancelacion(v.id_solicitud_cancelacion);
      toast.success("Solicitud retirada correctamente");
      onRefresh?.();
    } catch (e) {
      toast.error(e.response?.data?.message || "Error al retirar solicitud");
    }
  };

  if (loading) {
    return (
      <div className="mhl__state">
        <span className="mhl__spinner" />
        <span>Cargando horario…</span>
      </div>
    );
  }

  if (vuelos.length === 0) {
    return (
      <div className="mhl__state mhl__state--empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
        <p>Sin vuelos programados para esta semana.</p>
      </div>
    );
  }

  return (
    <div className="mhl">
      {reporteVuelo && (
        <ReporteVueloModal
          id_vuelo={reporteVuelo.id_vuelo}
          mode="alumno"
          onClose={() => { setReporteVuelo(null); onRefresh?.(); }}
        />
      )}
      {modalVuelo && (
        <CancelarVueloModal
          vuelo={modalVuelo}
          onClose={() => setModalVuelo(null)}
          onCancelado={() => { setModalVuelo(null); onRefresh?.(); toast.success("Solicitud enviada exitosamente"); }}
        />
      )}
      <div className="mhl__list">
        {dias.map((dia) => {
          const primerVuelo = porDia[dia][0];
          return (
            <div key={dia} className="mhl__day">
              <div className="mhl__day-header">
                <span className="mhl__day-name">{DIAS[dia - 1]}</span>
                {primerVuelo?.fecha_vuelo && (
                  <span className="mhl__day-date">
                    {formatFecha(primerVuelo.fecha_vuelo)}
                  </span>
                )}
              </div>
              {porDia[dia].map((v) => (
                <VueloCard
                  key={v.id_vuelo}
                  v={v}
                  weekMode={weekMode}
                  horasTotales={horasTotales}
                  onSolicitarCancelacion={() => abrirCancelar(v)}
                  onQuitarSolicitud={() => handleQuitarSolicitud(v)}
                  onPlan={() => abrirLoadsheet(v)}
                  onReporte={() => setReporteVuelo(v)}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
