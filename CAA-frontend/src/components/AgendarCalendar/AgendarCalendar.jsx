import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getBloquesHorario,
  getBloquesOcupados,
  getAeronavesPermitidas,
  getBloquesBloqueados,
} from "../../services/agendarApi";
import "./AgendarCalendar.css";

const DIAS = [
  { id: 1, label: "Lunes" },
  { id: 2, label: "Martes" },
  { id: 3, label: "Miércoles" },
  { id: 4, label: "Jueves" },
  { id: 5, label: "Viernes" },
  { id: 6, label: "Sábado" },
];

export default function AgendarCalendar({ 
  selecciones, 
  setSelecciones, 
  bloqueado, 
  limiteAvion = 3, 
  limiteSimulador = 3,
  userRole = 'ALUMNO',
  aeronaves: aeronavesProp,
  bloques: bloquesProp,
  bloqueos: bloqueosProp
}) {
  const [bloques, setBloques] = useState(bloquesProp || []);
  const [aeronaves, setAeronaves] = useState(aeronavesProp || []);
  const [ocupadas, setOcupadas] = useState([]);
  const [bloqueos, setBloqueos] = useState(bloqueosProp || []);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  const [mobileDayOffset, setMobileDayOffset] = useState(0);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    async function load() {
      if (!bloquesProp) setBloques(await getBloquesHorario());
      else setBloques(bloquesProp);

      if (!aeronavesProp) setAeronaves(await getAeronavesPermitidas());
      else setAeronaves(aeronavesProp);

      setOcupadas(await getBloquesOcupados("next"));

      if (!bloqueosProp) setBloqueos(await getBloquesBloqueados()); 
      else setBloqueos(bloqueosProp);
    }
    load();
  }, [bloquesProp, aeronavesProp, bloqueosProp]);

  const formatHora = (hora) => hora?.slice(0, 5) ?? "";

  const isBloqueado = (id_bloque, dia_semana) => {
    if (!Array.isArray(bloqueos)) return false;
    return bloqueos.some(
      (x) => x.id_bloque === id_bloque && x.dia_semana === dia_semana
    );
  };

  const toggle = (item) => {
    if (bloqueado) return;

    const existe = selecciones.find(
      (s) =>
        Number(s.dia_semana) === Number(item.dia_semana) &&
        Number(s.id_bloque) === Number(item.id_bloque) &&
        Number(s.id_aeronave) === Number(item.id_aeronave)
    );

    if (existe) {
      setSelecciones(prev => prev.filter((s) => s !== existe));
      return;
    }

    // Validar máximo una aeronave por bloque
    const mismoBloque = selecciones.find(
      (s) => Number(s.dia_semana) === Number(item.dia_semana) && Number(s.id_bloque) === Number(item.id_bloque)
    );
    if (mismoBloque) {
      toast.warning("Solo puedes seleccionar una aeronave por bloque", { id: "bloque-msg" });
      return;
    }

    const aeroInfo = aeronaves.find(a => Number(a.id_aeronave) === Number(item.id_aeronave));
    const esSimulador = aeroInfo?.tipo === 'SIMULADOR';

    // --- Validar Límites Totales ---
    if (esSimulador) {
      const numSims = selecciones.filter(s => {
        const a = aeronaves.find(ax => Number(ax.id_aeronave) === Number(s.id_aeronave));
        return a?.tipo === 'SIMULADOR';
      }).length;
      if (numSims >= limiteSimulador) {
        toast.error(`Has alcanzado tu límite de ${limiteSimulador} simuladores por semana.`, { id: 'lim-sim' });
        return;
      }
    } else {
      const numAviones = selecciones.filter(s => {
        const a = aeronaves.find(ax => Number(ax.id_aeronave) === Number(s.id_aeronave));
        return a?.tipo !== 'SIMULADOR';
      }).length;
      if (numAviones >= limiteAvion) {
        toast.error(`Has alcanzado tu límite de ${limiteAvion} aviones por semana.`, { id: 'lim-av' });
        return;
      }

      // Validar máximo 1 avión por día
      const avionEseDia = selecciones.some(s => {
        const aeroSel = aeronaves.find(a => Number(a.id_aeronave) === Number(s.id_aeronave));
        return Number(s.dia_semana) === Number(item.dia_semana) && aeroSel?.tipo !== 'SIMULADOR';
      });

      if (avionEseDia) {
        toast.warning('Solo puedes seleccionar 1 avión por día', { id: "dia-msg" });
        return;
      }
    }

    setSelecciones(prev => [...prev, item]);
  };

  // ── Mapa de conflictos (solo ADMIN / PROGRAMACION) ───────────────────────
  // Rastreamos ocupación por aeronave y por instructor
  const conflictMap = {};
  if (userRole !== 'ALUMNO') {
    for (const o of ocupadas) {
      const nombreAl = [o.alumno_nombre, o.alumno_apellido].filter(Boolean).join(' ');
      
      // 1. Conflicto por AERONAVE
      const keyAero = `aero-${o.dia_semana}-${o.id_bloque}-${o.id_aeronave}`;
      if (!conflictMap[keyAero]) conflictMap[keyAero] = [];
      if (nombreAl && !conflictMap[keyAero].includes(nombreAl)) conflictMap[keyAero].push(nombreAl);

      // 2. Conflicto por INSTRUCTOR
      if (o.id_instructor) {
        const keyInst = `inst-${o.dia_semana}-${o.id_bloque}-${o.id_instructor}`;
        if (!conflictMap[keyInst]) conflictMap[keyInst] = [];
        const nombreInst = [o.instructor_nombre, o.instructor_apellido].filter(Boolean).join(' ');
        const labelAlInst = `${nombreAl} (con ${nombreInst})`;
        if (nombreAl && !conflictMap[keyInst].includes(labelAlInst)) {
          conflictMap[keyInst].push(labelAlInst);
        }
      }
    }
  }

  const visibleDays = isMobile ? DIAS.slice(mobileDayOffset, mobileDayOffset + 2) : DIAS;

  return (
    <div className={`calendar-wrapper ${isMobile ? 'is-mobile' : ''}`}>
      
      {isMobile && (
        <div className="calendar-mobile-nav">
          <button 
            disabled={mobileDayOffset === 0} 
            onClick={() => setMobileDayOffset(prev => Math.max(0, prev - 1))}
          >
            <i className="bi bi-chevron-left"></i> Anterior
          </button>
          <span className="nav-label">
            {visibleDays[0].label} - {visibleDays[visibleDays.length - 1].label}
          </span>
          <button 
            disabled={mobileDayOffset >= DIAS.length - 2} 
            onClick={() => setMobileDayOffset(prev => Math.min(DIAS.length - 2, prev + 1))}
          >
            Siguiente <i className="bi bi-chevron-right"></i>
          </button>
        </div>
      )}


      <table className="calendar">
        <thead>
          <tr>
            <th>Hora</th>
            <th>Aeronave</th>
            {visibleDays.map((d) => (
              <th key={d.id}>{d.label}</th>
            ))}
          </tr>
        </thead>

        <tbody>
          {bloques.map((b) =>
            aeronaves.map((a, idx) => (
              <tr key={`${b.id_bloque}-${a.id_aeronave}`} className={idx === aeronaves.length - 1 ? 'last-in-block' : ''}>
                {idx === 0 && (
                  <td rowSpan={aeronaves.length} className="hora-cell">
                    {formatHora(b.hora_inicio)}
                  </td>
                )}

                  <td className="aeronave-cell">
                    <div className={`aeronave-badge ${a.tipo === 'SIMULADOR' ? 'aeronave-badge--sim' : ''}`}>
                      <i className={`bi ${a.tipo === 'SIMULADOR' ? 'bi-display' : 'bi-airplane-engines'} me-2`}></i>
                      {a.codigo}
                    </div>
                  </td>

                {visibleDays.map((d) => {
                  if (isBloqueado(b.id_bloque, d.id)) {
                    return <td key={d.id} className="slot-almuerzo"></td>;
                  }

                  // Buscar conflictos en este slot
                  const conflictKeyAero = `aero-${d.id}-${b.id_bloque}-${a.id_aeronave}`;
                  const alumnosAero = conflictMap[conflictKeyAero] ?? [];
                  const esConflictoAero = alumnosAero.length > 1;

                  // Buscar conflicto de instructor para este slot (quién ocupa este slot)
                  const ocupanteActual = ocupadas.find(
                    o => Number(o.dia_semana) === Number(d.id) && 
                         Number(o.id_bloque) === Number(b.id_bloque) && 
                         Number(o.id_aeronave) === Number(a.id_aeronave)
                  );
                  
                  let esConflictoInst = false;
                  let alumnosInst = [];
                  if (ocupanteActual?.id_instructor) {
                    const conflictKeyInst = `inst-${d.id}-${b.id_bloque}-${ocupanteActual.id_instructor}`;
                    alumnosInst = conflictMap[conflictKeyInst] ?? [];
                    esConflictoInst = alumnosInst.length > 1;
                  }

                  const esConflicto = esConflictoAero || esConflictoInst;

                  // Buscar si este bloque está ocupado por una ruta (propia o de otros)
                  const isMatch = (s, dId, bId, aId) => {
                    const basic = Number(s.dia_semana) === Number(dId) && Number(s.id_aeronave) === Number(aId);
                    if (!basic) return false;
                    if (s.tipo_vuelo === 'RUTA' && s.id_bloque_fin) {
                      return Number(bId) >= Number(s.id_bloque) && Number(bId) <= Number(s.id_bloque_fin);
                    }
                    return Number(s.id_bloque) === Number(bId);
                  };

                  const ocupado = ocupadas.some(o => isMatch(o, d.id, b.id_bloque, a.id_aeronave));
                  const selectedItem = selecciones.find(s => isMatch(s, d.id, b.id_bloque, a.id_aeronave));
                  const selected = !!selectedItem;
                  const isRutaLock = selectedItem?.tipo_vuelo === 'RUTA';

                  // Clases y tooltip según estado
                  let slotClass = 'available';
                  let titleText = 'Disponible para agendar';

                  if (esConflicto) {
                    slotClass = 'conflicto';
                    const listado = [...new Set([...alumnosAero, ...alumnosInst])];
                    titleText = `⚠ Conflicto (${listado.length} involucrados): ${listado.join(', ')}`;
                  } else if (selected) {
                    slotClass = 'selected';
                    titleText = isRutaLock ? 'Vuelo de Ruta Agendado' : 'Seleccionado para tu solicitud';
                  } else if (ocupado) {
                    slotClass = 'ocupado';
                    titleText = 'Bloque no disponible';
                  }

                  return (
                    <td key={d.id} className="slot-cell">
                      <button
                        className={`slot-btn ${slotClass} ${isRutaLock ? 'is-ruta' : ''}`}
                        disabled={bloqueado || isRutaLock}
                        onClick={() =>
                          toggle({
                            dia_semana: d.id,
                            id_bloque: b.id_bloque,
                            id_aeronave: a.id_aeronave,
                          })
                        }
                        title={titleText}
                      >
                        {esConflicto ? (
                          <span>⚠ {alumnosAero.length + alumnosInst.length}</span>
                        ) : selected ? (
                          <i className="bi bi-check-lg"></i>
                        ) : ocupado ? (
                          <i className="bi bi-lock-fill"></i>
                        ) : (
                          <span className="slot-dot"></span>
                        )}
                      </button>
                    </td>
                  );
                })}

              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>

  );
}
