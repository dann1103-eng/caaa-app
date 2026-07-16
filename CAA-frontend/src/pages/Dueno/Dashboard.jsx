import { useCallback, useEffect, useState } from "react";
import { getCalendarioPublico } from "../../services/programacionApi";
import { getEstadoOperaciones, getTurnoDia } from "../../services/turnoApi";
import AvisosTurnoWidget from "../../components/AvisosTurnoWidget/AvisosTurnoWidget";
import PushToggle from "../../components/PushToggle/PushToggle";
import "./Dashboard.css";

// Dashboard de solo lectura para el dueño de la escuela: letra grande, un solo
// vistazo, sin botones de acción. Reusa los mismos endpoints de Proyección
// (accesibles con cualquier JWT via proyeccionMiddleware) — no hay ruta nueva
// en el backend para esto, solo lectura de lo que ya existe.

function jsDayToDb(jsDay) {
  return jsDay === 0 ? 7 : jsDay;
}

const OPERACIONES_META = {
  ACTIVO:        { label: "Operando con normalidad", cls: "duo__pill--activo" },
  PAUSA_TURNO:   { label: "En pausa de almuerzo",    cls: "duo__pill--pausa" },
  CERRADO_TURNO: { label: "Turno cerrado",           cls: "duo__pill--cerrado" },
  SUSPENDIDO:    { label: "Operaciones suspendidas", cls: "duo__pill--suspendido" },
};

const ESTADO_VUELO_LABEL = {
  PUBLICADO: "Por salir", PROGRAMADO: "Por salir",
  SALIDA_HANGAR: "En hangar, saliendo", EN_PROGRESO: "Volando", EN_VUELO: "Volando",
  REGRESO_HANGAR: "Regresando", FINALIZANDO: "Regresando",
  COMPLETADO: "Terminado", CANCELADO: "Cancelado",
};

function formatHora(h) {
  return h ? h.slice(0, 5) : "—";
}

export default function DuenoDashboard() {
  const [operaciones, setOperaciones] = useState(null);
  const [turnoDia, setTurnoDia] = useState(null);
  const [vuelosHoy, setVuelosHoy] = useState([]);
  const [loading, setLoading] = useState(true);
  const [horaActual, setHoraActual] = useState("");

  const cargar = useCallback(async () => {
    try {
      const [ops, dia, calendario] = await Promise.all([
        getEstadoOperaciones().catch(() => null),
        getTurnoDia().catch(() => null),
        getCalendarioPublico().catch(() => []),
      ]);
      setOperaciones(ops);
      setTurnoDia(dia);
      const diaHoy = jsDayToDb(new Date().getDay());
      setVuelosHoy(
        (calendario || [])
          .filter((v) => Number(v.dia_semana) === diaHoy && v.estado !== "CANCELADO")
          .sort((a, b) => (a.hora_inicio || "").localeCompare(b.hora_inicio || ""))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 20000);
    return () => clearInterval(t);
  }, [cargar]);

  useEffect(() => {
    const tick = () =>
      setHoraActual(new Date().toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit", hour12: true }));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const efectivo = operaciones?.estado_efectivo
    || (operaciones?.estado_general === "ACTIVO" ? "ACTIVO" : "SUSPENDIDO");
  const opsMeta = OPERACIONES_META[efectivo] || OPERACIONES_META.ACTIVO;

  const estadoTurno = turnoDia?.dia?.estado ?? "SIN_ABRIR";
  const asistenciasActivas = (turnoDia?.asistencias || []).filter((a) => !a.salida_en);

  return (
    <div className="duo">
      <header className="duo__header">
        <div className="duo__brand">
          <img src="/iso-caaa-white.png" alt="" className="duo__brand-logo" />
          <span>CAAA</span>
        </div>
        <span className="duo__clock">{horaActual}</span>
      </header>

      <main className="duo__main">
        <section className="duo__push">
          <p className="duo__push-text">
            Active esto para recibir avisos en su celular cada vez que cambie algo:
          </p>
          <PushToggle className="duo__push-btn" />
        </section>

        <section className={`duo__card duo__estado ${opsMeta.cls}`}>
          <span className="duo__estado-label">Estado de operaciones</span>
          <span className="duo__estado-valor">{opsMeta.label}</span>
          {efectivo === "SUSPENDIDO" && operaciones?.motivo_inactivo && (
            <span className="duo__estado-motivo">{operaciones.motivo_inactivo}</span>
          )}
        </section>

        <section className="duo__card">
          <span className="duo__card-title">Turno de hoy</span>
          <span className="duo__turno-estado">
            {estadoTurno === "SIN_ABRIR" && "Aún no ha abierto"}
            {estadoTurno === "ABIERTO" && "Abierto"}
            {estadoTurno === "EN_PAUSA" && "En pausa (almuerzo)"}
            {estadoTurno === "CERRADO" && "Cerrado"}
          </span>
          {asistenciasActivas.length > 0 && (
            <div className="duo__capitanes">
              {asistenciasActivas.map((a) => (
                <span key={a.id_asistencia} className="duo__capitan-chip">Cap. {a.nombre_completo}</span>
              ))}
            </div>
          )}
        </section>

        <section className="duo__card">
          <span className="duo__card-title">Vuelos de hoy</span>
          {loading ? (
            <p className="duo__vacio">Cargando…</p>
          ) : vuelosHoy.length === 0 ? (
            <p className="duo__vacio">No hay vuelos programados para hoy.</p>
          ) : (
            <ul className="duo__vuelos">
              {vuelosHoy.map((v) => (
                <li key={v.id_vuelo} className="duo__vuelo">
                  <div className="duo__vuelo-top">
                    <span className="duo__vuelo-hora">{formatHora(v.hora_inicio)}</span>
                    <span className="duo__vuelo-aero">{v.aeronave_codigo}</span>
                  </div>
                  <div className="duo__vuelo-personas">
                    {v.alumno_nombre || "—"} <span className="duo__vuelo-sep">·</span> Cap. {v.instructor_nombre || "—"}
                  </div>
                  <span className="duo__vuelo-estado">
                    {ESTADO_VUELO_LABEL[v.estado] || v.estado}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <AvisosTurnoWidget />
      </main>
    </div>
  );
}
