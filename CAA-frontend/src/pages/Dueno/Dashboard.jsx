import { useCallback, useEffect, useState } from "react";
import { getCalendarioPublico } from "../../services/programacionApi";
import { getTurnoDia } from "../../services/turnoApi";
import OperacionesWidget from "../../components/OperacionesWidget/OperacionesWidget";
import MetarWidget from "../../components/MetarWidget/MetarWidget";
import EstadoFlotaWidget from "../../components/ProgWidgets/EstadoFlotaWidget";
import WindyWidget from "../../components/ProgWidgets/WindyWidget";
import AvisosTurnoWidget from "../../components/AvisosTurnoWidget/AvisosTurnoWidget";
import VuelosEnCursoTable from "../../components/VuelosEnCursoTable/VuelosEnCursoTable";
import PushToggle from "../../components/PushToggle/PushToggle";
import "../Proyeccion/PaginaProgramacion.css";
import "./Dashboard.css";

// Dashboard de solo lectura para el dueño de la escuela: mismo look (oscuro,
// tarjetas, colores por aeronave, barra de progreso) que Proyección — reusa
// sus mismos componentes/estilos (`.pp`, VuelosEnCursoTable, OperacionesWidget,
// MetarWidget, EstadoFlotaWidget, WindyWidget) para heredar automáticamente
// cualquier mejora futura a esa pantalla. Todo en una sola columna,
// mobile-first, sin botones de acción — es un vistazo pasivo.

function jsDayToDb(jsDay) {
  return jsDay === 0 ? 7 : jsDay;
}

const TURNO_META = {
  ABIERTO:  { label: "TURNO ABIERTO",             cls: "pp__turno--abierto",  icon: "bi-sunrise" },
  EN_PAUSA: { label: "TURNO EN PAUSA · ALMUERZO",  cls: "pp__turno--pausa",    icon: "bi-cup-hot" },
  CERRADO:  { label: "TURNO CERRADO",             cls: "pp__turno--cerrado",  icon: "bi-sunset" },
};

export default function DuenoDashboard() {
  const [turnoDia, setTurnoDia] = useState(null);
  const [vuelosHoy, setVuelosHoy] = useState([]);
  const [clock, setClock] = useState("");

  const cargar = useCallback(async () => {
    const [dia, calendario] = await Promise.all([
      getTurnoDia().catch(() => null),
      getCalendarioPublico().catch(() => []),
    ]);
    setTurnoDia(dia);
    const diaHoy = jsDayToDb(new Date().getDay());
    setVuelosHoy(
      (calendario || [])
        .filter((v) => Number(v.dia_semana) === diaHoy && v.estado !== "CANCELADO")
        .sort((a, b) => (a.hora_inicio || "").localeCompare(b.hora_inicio || ""))
    );
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 20000);
    return () => clearInterval(t);
  }, [cargar]);

  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit", hour12: false }));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const turnoMeta = turnoDia?.dia?.estado ? TURNO_META[turnoDia.dia.estado] : null;
  const presentes = (turnoDia?.asistencias || []).filter((a) => !a.salida_en);

  return (
    <div className="pp duo">
      <div className="pp__topbar">
        <div className="pp__topbar-left">
          <span className="pp__topbar-label">CAAA</span>
        </div>
        <div className="pp__topbar-right">
          <span className="pp__topbar-clock">{clock} CST</span>
        </div>
      </div>

      <main className="duo__main">
        <div className="duo__push">
          <p className="duo__push-text">Active esto para recibir avisos en su celular:</p>
          <PushToggle className="duo__push-btn" />
        </div>

        {turnoMeta && (
          <div className={`pp__turno-strip ${turnoMeta.cls}`}>
            <span className="pp__turno-estado"><i className={`bi ${turnoMeta.icon}`} /> {turnoMeta.label}</span>
            {presentes.length > 0 && (
              <span className="pp__turno-instructores">
                {presentes.map((a) => (
                  <span key={a.id_asistencia} className="pp__turno-chip">
                    <i className="bi bi-person-badge" /> Cap. {a.nombre_completo}
                  </span>
                ))}
              </span>
            )}
          </div>
        )}

        <OperacionesWidget />

        <div className="pp__card">
          <div className="pp__card-head">
            <h2 className="pp__card-title"><i className="bi bi-broadcast-pin" /> Vuelos de hoy</h2>
          </div>
          <VuelosEnCursoTable vuelos={vuelosHoy} emptyLabel="No hay vuelos programados para hoy." />
        </div>

        <AvisosTurnoWidget />
        <MetarWidget />
        <EstadoFlotaWidget />
        <WindyWidget />
      </main>
    </div>
  );
}
