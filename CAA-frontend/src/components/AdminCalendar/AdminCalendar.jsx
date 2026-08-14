import React, { useState, useEffect, useMemo } from "react";
import { io as socketIO } from "socket.io-client";
import { SOCKET_URL } from "../../api/axiosConfig";
import { siglaLicencia } from "../../utils/vueloVisual";
import "./AdminCalendar.css";

const DIAS = [
  { id: 1, label: "LUN", full: "Lunes" },
  { id: 2, label: "MAR", full: "Martes" },
  { id: 3, label: "MIÉ", full: "Miércoles" },
  { id: 4, label: "JUE", full: "Jueves" },
  { id: 5, label: "VIE", full: "Viernes" },
  { id: 6, label: "SÁB", full: "Sábado" },
];

const formatHora = (h) => h?.slice(0, 5);

// Nombre corto tipo "R.Flores": usa el campo *_corto del backend si viene; si no,
// lo deriva del nombre completo (inicial del primer nombre + primer apellido).
const abbrevNombre = (corto, full) => {
  if (corto) return corto;
  if (!full) return "";
  const parts = String(full).trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  // Heurística: inicial del primer token + segundo token (primer apellido si hay
  // 2 nombres, o el apellido si hay 1 nombre). Sirve para el caso común.
  const inicial = parts[0][0];
  const apellido = parts.length >= 3 ? parts[Math.floor(parts.length / 2)] : parts[1];
  return `${inicial}.${apellido}`;
};

// Píldora con la sigla de la licencia del alumno (PPL/CPL/IR/ME/CFI) en la
// tarjeta. Sirve para saber de un vistazo qué está volando cada quien sin
// abrir el popover; usa la misma tabla de siglas que Proyección.
const LicenciaPill = ({ nombre }) => {
  const sigla = siglaLicencia(nombre);
  if (!sigla) return null;
  return (
    <span
      title={`Licencia del alumno: ${nombre}`}
      style={{
        fontSize: '0.6rem',
        fontWeight: 700,
        color: 'var(--c-brand-700)',
        background: 'var(--c-brand-50, rgba(27,54,93,0.08))',
        padding: '1px 5px',
        borderRadius: '999px',
        marginRight: '4px',
        display: 'inline-block',
        letterSpacing: '0.02em',
      }}
    >
      {sigla}
    </span>
  );
};

const getDatesForWeek = (week) => {
  const now = new Date();
  const day = now.getDay(); // 0 (Sun) to 6 (Sat)
  // Adjust to Monday of current week
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  
  if (week === "next") {
    monday.setDate(monday.getDate() + 7);
  }
  
  const dates = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }
  return dates;
};

export default function AdminCalendar({
  bloques = [],
  items = [],
  pendingMoves = [],
  bloqueos = [],
  setDragging,
  dragging,
  handleDrop,
  week = "next",
  instructores = [],
  onCambiarInstructor,
  onRefresh,
  aeronaves = [],
  onGuardarCambio,
  onConflictChange,
  // Extensiones (defaults = comportamiento actual de admin/programación):
  canEditItem,               // (item) => bool: solo estas tarjetas son editables
  onPersistCardEdit,         // (move) => Promise: persistir cambios del popover
  onRechazar,                // (id_detalle) => Promise: acción del botón de rechazo
  onAprobar,                 // (id_detalle) => Promise: acción del botón de aprobar (revisión previa a publicar)
  allowInstructorChange = true, // mostrar el selector de instructor en el popover
  onEmptyCellClick,          // ({dia_semana, id_bloque}) => void: click en celda vacía
  onGestionarEspera,         // (slot) => void: abrir gestor de lista de espera
  onAsignarTramos,           // (id_detalle) => void: abrir modal de asignar alumnos por tramo (rutas con parada)
  onGuardarRemarks,          // (id_detalle, remarks) => Promise: remarks del instructor sobre el vuelo
  rechazarLabel,             // sin override: "Cancelar vuelo" en semana publicada, "Rechazar vuelo" en la próxima
  reservas = [],             // reservas de uso especial (sin alumno) a pintar
  onEliminarReserva,         // (id) => Promise: eliminar una reserva
  mostrarBuscador = false,   // barra de búsqueda para filtrar tarjetas por alumno
}) {
  const isEditable = true; // El Admin siempre puede editar, incluso post-publicación
  const puedeEditarItem = (item) => (typeof canEditItem === "function" ? !!canEditItem(item) : true);

  // Badge BORRADOR / ENVIADA (EN_REVISION) para la semana próxima.
  const estadoSolicitudBadge = (item) => {
    if (week !== "next") return null;
    if (item.estado_solicitud === "EN_REVISION") return { label: "Enviada", cls: "cal-badge--enviada" };
    if (item.estado_solicitud === "BORRADOR") return { label: "Borrador", cls: "cal-badge--borrador" };
    return null;
  };
  const dates = getDatesForWeek(week);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [activePopover, setActivePopover] = useState(null); // { item, x, y }
  const [loadingSave, setLoadingSave] = useState(false);
  const [tempAeronaveId, setTempAeronaveId] = useState("");
  const [tempInstructorId, setTempInstructorId] = useState("");
  const [tempBloqueInicio, setTempBloqueInicio] = useState("");
  const [tempBloqueFin, setTempBloqueFin] = useState("");
  // Tipo de vuelo (categoría) editable desde la tarjeta. Solo NORMAL/CHEQUEO:
  // las otras categorías reemplazan al alumno (ver comentario en el backend).
  const [tempCategoria, setTempCategoria] = useState("NORMAL");
  const [tempLicenciaChequeo, setTempLicenciaChequeo] = useState("");
  const [licencias, setLicencias] = useState([]);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [mobileDayOffset, setMobileDayOffset] = useState(0);
  const [busquedaAlumno, setBusquedaAlumno] = useState("");

  // Catálogo de licencias para el selector "licencia a chequear" del popover.
  // Solo lo necesita el staff (el instructor no edita la categoría).
  useEffect(() => {
    if (!allowInstructorChange) return;
    import("../../services/adminApi")
      .then(({ getLicencias }) => getLicencias())
      .then((d) => setLicencias(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [allowInstructorChange]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);

    // Socket real-time refresh
    const socket = socketIO(SOCKET_URL);
    socket.on("solicitud_rechazada", () => {
      if (onRefresh) onRefresh();
    });
    socket.on("solicitud_aprobada", () => {
      if (onRefresh) onRefresh();
    });
    socket.on("guardar_cambios", () => {
      if (onRefresh) onRefresh();
    });

    return () => {
      window.removeEventListener("resize", handleResize);
      socket.disconnect();
    };
  }, [onRefresh]);
  // id_vuelo → id_instructor seleccionado (pendiente de guardar)
  const [instrPendiente, setInstrPendiente] = useState({});

  const handleInstrChange = (id_vuelo, id_instructor_nuevo) => {
    setInstrPendiente((prev) => ({ ...prev, [id_vuelo]: id_instructor_nuevo }));
  };

  const handleInstrGuardar = async (id_vuelo, id_instructor_original) => {
    const nuevo = instrPendiente[id_vuelo];
    if (!nuevo || Number(nuevo) === Number(id_instructor_original)) return;
    await onCambiarInstructor(id_vuelo, Number(nuevo));
    setInstrPendiente((prev) => {
      const next = { ...prev };
      delete next[id_vuelo];
      return next;
    });
  };

  const safeItems = Array.isArray(items) ? items : [];
  const safeBloqueos = Array.isArray(bloqueos) ? bloqueos : [];
  const safeReservas = Array.isArray(reservas) ? reservas : [];
  const MOTIVO_LABEL = { TRASLADO: "Traslado", PRUEBA: "Prueba", ADMINISTRATIVO: "Administrativo", OTRO: "Uso especial" };

  const isBloqueado = (dia_semana, id_bloque) =>
    safeBloqueos.some((x) => Number(x.dia_semana) === Number(dia_semana) && Number(x.id_bloque) === Number(id_bloque));

  // ── Buscador: filtra las tarjetas por nombre de alumno (sin acentos) ──────
  const normalizar = (s) => (s || "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const busquedaNorm = normalizar(busquedaAlumno.trim());
  const matchesBusqueda = (item) => !busquedaNorm || normalizar(item.alumno_nombre).includes(busquedaNorm);
  // Las reservas de uso especial (sin alumno) no se filtran: no son "de alumno".
  const visibleItems = busquedaNorm ? safeItems.filter(matchesBusqueda) : safeItems;

  // ── Horas solicitadas por alumno esta semana (para el resumen en cada tarjeta) ──
  const bloqueDuracionHoras = (id_bloque) => {
    const b = bloques.find((x) => Number(x.id_bloque) === Number(id_bloque));
    if (!b?.hora_inicio || !b?.hora_fin) return 0;
    const [h1, m1] = b.hora_inicio.split(":").map(Number);
    const [h2, m2] = b.hora_fin.split(":").map(Number);
    return (h2 * 60 + m2 - (h1 * 60 + m1)) / 60;
  };

  const resumenPorAlumno = useMemo(() => {
    const map = {};
    for (const item of safeItems) {
      if (item.estado_vuelo === "CANCELADO" || !item.id_alumno) continue;
      const start = Number(item.id_bloque);
      const end = item.id_bloque_fin ? Number(item.id_bloque_fin) : start;
      let horas = 0;
      for (let b = start; b <= end; b++) horas += bloqueDuracionHoras(b);
      if (!map[item.id_alumno]) map[item.id_alumno] = { horas: 0, detalle: [] };
      map[item.id_alumno].horas += horas;
      map[item.id_alumno].detalle.push({ id_detalle: item.id_detalle, dia_semana: item.dia_semana, id_bloque: start, id_bloque_fin: end, horas });
    }
    return map;
  }, [safeItems, bloques]);

  const formatDetalleDia = (d) => {
    const bIni = bloques.find((b) => Number(b.id_bloque) === Number(d.id_bloque));
    const bFin = bloques.find((b) => Number(b.id_bloque) === Number(d.id_bloque_fin));
    const diaLabel = DIAS.find((x) => x.id === Number(d.dia_semana))?.label || "";
    const horaIni = bIni ? formatHora(bIni.hora_inicio) : "";
    const horaFin = bFin ? formatHora(bFin.hora_fin) : "";
    return d.id_bloque_fin !== d.id_bloque ? `${diaLabel} ${horaIni}–${horaFin}` : `${diaLabel} ${horaIni}`;
  };

  // Texto corto que va SIEMPRE visible en la tarjeta — un conteo de vuelos se
  // entiende de un vistazo; un número de horas por sí solo no dice nada sin
  // contexto (¿es mucho? ¿poco?) y obliga a hacer la cuenta mentalmente.
  const resumenLabel = (item) => {
    const r = resumenPorAlumno[item.id_alumno];
    if (!r) return "";
    const n = r.detalle.length;
    return n === 1 ? "1 vuelo solicitado" : `${n} vuelos solicitados`;
  };

  // El detalle día/bloque + total de horas va en el tooltip (hover): no cabe
  // en la tarjeta sin abrirla, y es lo que de verdad hace falta para detectar
  // solicitudes encimadas o excesivas de un mismo alumno.
  const resumenTooltip = (item) => {
    const r = resumenPorAlumno[item.id_alumno];
    if (!r) return "";
    return `${resumenLabel(item)} (${r.horas.toFixed(1)}h en total):\n${r.detalle.map(formatDetalleDia).join("\n")}`;
  };

  // ── Mapa de conflictos ────────────────────────────────────────────────────
  const conflictMap = useMemo(() => {
    const map = {}; // key: `aero-${dia}-${bloque}-${id_aero}` or `inst-${dia}-${bloque}-${id_inst}`
    for (const item of safeItems) {
      if (item.estado_vuelo === 'CANCELADO') continue;

      const alNombre = [item.alumno_nombre, item.alumno_apellido].filter(Boolean).join(' ');
      
      const startBloque = Number(item.id_bloque);
      const endBloque = item.id_bloque_fin ? Number(item.id_bloque_fin) : startBloque;

      for (let b = startBloque; b <= endBloque; b++) {
        // 1. Conflicto por Aeronave
        const keyAero = `aero-${item.dia_semana}-${b}-${item.id_aeronave}`;
        if (!map[keyAero]) map[keyAero] = [];
        if (!map[keyAero].includes(alNombre)) map[keyAero].push(alNombre);

        // 2. Conflicto por Instructor
        if (item.id_instructor) {
          const keyInst = `inst-${item.dia_semana}-${b}-${item.id_instructor}`;
          if (!map[keyInst]) map[keyInst] = [];
          const instLabel = `${alNombre} (Instr: ${item.instructor_nombre || 'Asignado'})`;
          if (!map[keyInst].includes(instLabel)) map[keyInst].push(instLabel);
        }
      }
    }
    return map;
  }, [safeItems]);

  useEffect(() => {
    const hasConflicts = Object.values(conflictMap).some(arr => arr.length > 1);
    if (onConflictChange) {
      onConflictChange(hasConflicts);
    }
  }, [conflictMap, onConflictChange]);

  const getConflictInfo = (item) => {
    const startBloque = Number(item.id_bloque);
    const endBloque = item.id_bloque_fin ? Number(item.id_bloque_fin) : startBloque;
    
    let aeroConflicts = new Set();
    let instConflicts = new Set();
    
    for (let b = startBloque; b <= endBloque; b++) {
      const keyAero = `aero-${item.dia_semana}-${b}-${item.id_aeronave}`;
      const keyInst = `inst-${item.dia_semana}-${b}-${item.id_instructor}`;
      
      if (conflictMap[keyAero]?.length > 1) {
        conflictMap[keyAero].forEach(c => aeroConflicts.add(c));
      }
      if (item.id_instructor && conflictMap[keyInst]?.length > 1) {
        conflictMap[keyInst].forEach(c => instConflicts.add(c));
      }
    }

    if (aeroConflicts.size === 0 && instConflicts.size === 0) return null;

    let text = "";
    if (aeroConflicts.size > 0) {
      text += `⚠ Conflicto de Aeronave (${item.aeronave_codigo}): ${Array.from(aeroConflicts).join(", ")}\n`;
    }
    if (instConflicts.size > 0) {
      text += `⚠ Conflicto de Instructor: ${Array.from(instConflicts).join(", ")}`;
    }
    return text.trim();
  };

  const findItemsForCell = (id_bloque, dia_semana) =>
    safeItems.filter(
      (i) =>
        Number(i.id_bloque) === Number(id_bloque) &&
        Number(i.dia_semana) === Number(dia_semana)
    );

  const [selectedForMove, setSelectedForMove] = useState(null); 

  const handleCardClick = (e, item) => {
    e.stopPropagation();
    
    // If we are in "move mode" and click a different card, 
    // we assume the user wants to move to THIS cell.
    if (selectedForMove) {
      if (selectedForMove.id_detalle === item.id_detalle) {
        setSelectedForMove(null);
        setDragging(null);
      } else {
        // Move to the cell where this card resides
        handleCellClick(item.dia_semana, item.id_bloque);
      }
      return;
    }

    // El popover siempre abre centrado en pantalla (ver CSS .flight-popover):
    // posicionarlo "al lado de la tarjeta" con getBoundingClientRect() se
    // salía por abajo cada vez que el contenido era alto (remarks + otras
    // solicitudes + Aprobar/Rechazar) y la tarjeta clicada estaba a media
    // altura o más abajo — no había forma de hacer scroll para llegar a los
    // botones. Centrado + max-height + overflow propio lo resuelve para
    // cualquier tamaño de pantalla, sin tener que acertar una posición.
    setActivePopover({ item });
    setTempAeronaveId(item.id_aeronave);
    setTempInstructorId(item.id_instructor);
    setTempBloqueInicio(item.id_bloque);
    setTempBloqueFin(item.id_bloque_fin || item.id_bloque);
    setTempCategoria(item.categoria || "NORMAL");
    setTempLicenciaChequeo(item.id_licencia_chequeo || "");
  };

  const handleCardLongPress = (e, item) => {
    e.preventDefault();
    if (!isEditable || !puedeEditarItem(item)) return;
    setDragging(item);
    setSelectedForMove(item);
    // Vibrate if supported
    if (navigator.vibrate) navigator.vibrate(50);
  };

  const handleCellClick = (dia_semana, id_bloque) => {
    if (!selectedForMove || !isEditable) return;
    
    handleDrop({
      dia_semana,
      id_bloque,
      id_aeronave: selectedForMove.id_aeronave
    });
    setSelectedForMove(null);
    setDragging(null); // Clear parent's dragging state
  };

  const closePopover = () => {
    if (!loadingSave) setActivePopover(null);
  };

  const handleSave = async () => {
    if (!activePopover || loadingSave) return;
    setLoadingSave(true);
    const { item } = activePopover;

    try {
      // 1. Cambiar Instructor si varió
      if (Number(tempInstructorId) !== Number(item.id_instructor)) {
        if (onCambiarInstructor) {
          await onCambiarInstructor(item.id_detalle, Number(tempInstructorId));
        }
      }

      // 2. Cambiar Aeronave, Rango o Tipo de vuelo si varió
      const aeroChanged = Number(tempAeronaveId) !== Number(item.id_aeronave);
      const startChanged = Number(tempBloqueInicio) !== Number(item.id_bloque);
      const endChanged = Number(tempBloqueFin) !== Number(item.id_bloque_fin || item.id_bloque);
      const catActual = item.categoria || "NORMAL";
      const licActual = item.id_licencia_chequeo || "";
      const catChanged = tempCategoria !== catActual
        || (tempCategoria === "CHEQUEO" && String(tempLicenciaChequeo || "") !== String(licActual));

      if (aeroChanged || startChanged || endChanged || catChanged) {
        const move = {
          id_detalle: item.id_detalle,
          dia_semana: item.dia_semana,
          id_bloque: Number(tempBloqueInicio),
          id_bloque_fin: item.tipo_vuelo === 'RUTA' ? Number(tempBloqueFin) : null,
          id_aeronave: Number(tempAeronaveId),
          // Solo se manda cuando cambió: el backend usa COALESCE, así que
          // null = "no tocar la categoría actual".
          ...(catChanged ? {
            categoria: tempCategoria,
            id_licencia_chequeo: tempCategoria === "CHEQUEO" && tempLicenciaChequeo
              ? Number(tempLicenciaChequeo)
              : null,
          } : {}),
        };

        // Persistencia real inmediata: el caller puede inyectar su endpoint
        // (p.ej. el instructor guarda contra /instructor/solicitudes/...).
        if (onPersistCardEdit) {
          await onPersistCardEdit(move);
        } else {
          const { guardarCambiosAdmin } = await import("../../services/adminApi");
          await guardarCambiosAdmin([move]);
        }
      }

      closePopover();
      if (onRefresh) await onRefresh();
    } catch (e) {
      console.error("Error al guardar cambios:", e);
      const { toast } = await import("sonner");
      toast.error(e.response?.data?.message || "Error al persistir cambios");
    } finally {
      setLoadingSave(false);
    }
  };

  // ── Validación en tiempo real para el Popover (Rangos completos) ──────────────────────────────
  const popoverConflict = useMemo(() => {
    if (!activePopover) return { aero: false, inst: false };
    const { item } = activePopover;
    
    const start = Number(tempBloqueInicio);
    const end = Number(tempBloqueFin);
    const aeroId = Number(tempAeronaveId);
    const instId = Number(tempInstructorId);
    
    let aero = false;
    let inst = false;

    for (let b = start; b <= end; b++) {
      const existsAero = safeItems.some(i => 
        Number(i.id_detalle) !== Number(item.id_detalle) && 
        i.estado_vuelo !== 'CANCELADO' &&
        Number(i.dia_semana) === Number(item.dia_semana) &&
        Number(i.id_aeronave) === Number(aeroId) &&
        b >= Number(i.id_bloque) && 
        b <= (i.id_bloque_fin ? Number(i.id_bloque_fin) : Number(i.id_bloque))
      );
      if (existsAero) aero = true;

      if (instId) {
        const existsInst = safeItems.some(i => 
          Number(i.id_detalle) !== Number(item.id_detalle) && 
          i.estado_vuelo !== 'CANCELADO' &&
          Number(i.dia_semana) === Number(item.dia_semana) &&
          Number(i.id_instructor) === Number(instId) &&
          b >= Number(i.id_bloque) && 
          b <= (i.id_bloque_fin ? Number(i.id_bloque_fin) : Number(i.id_bloque))
        );
        if (existsInst) inst = true;
      }
    }
    return { aero, inst };
  }, [activePopover, tempBloqueInicio, tempBloqueFin, tempAeronaveId, tempInstructorId, safeItems]);

  const getEstadoClass = (item) => {
    const estado = item?.estado_vuelo || item?.estado_solicitud || item?.estado_mostrar;
    if (["SALIDA_HANGAR", "EN_VUELO", "REGRESO_HANGAR", "FINALIZANDO"].includes(estado)) {
      return "progreso";
    }
    if (estado === "COMPLETADO") return "completado";
    if (estado === "CANCELADO") return "cancelado";
    // Semana "next" (todavía sin publicar): verde SOLO tras aprobación explícita
    // (botón "Aprobar" del popover, sv.estado='APROBADA') — no basta con que ya
    // no esté en Borrador/Enviada, porque acá nunca hay un estado intermedio
    // automático; el staff tiene que revisarlo a propósito.
    if (week === "next") {
      return item?.estado_vuelo_individual === "APROBADA" ? "agendado" : "programado";
    }
    // Semana publicada: ya es un vuelo real y confirmado — verde de una vez.
    return "agendado";
  };

  const visibleDays = isMobile ? DIAS.slice(mobileDayOffset, mobileDayOffset + 3) : DIAS;
  const visibleDates = isMobile ? dates.slice(mobileDayOffset, mobileDayOffset + 3) : dates;

  const dayConfigs = useMemo(() => {
    let currentGridCol = 2; // Column 1 is Time
    return visibleDays.map((d, dIdx) => {
      const date = visibleDates[dIdx];
      const itemsDelDia = visibleItems.filter(i => Number(i.dia_semana) === Number(d.id) && i.estado_vuelo !== 'CANCELADO');
      
      const locales = itemsDelDia.filter(i => {
        const type = (i.tipo_vuelo || i.tipo || '').toString().trim().toUpperCase();
        return type !== 'RUTA';
      });
      const rutas = itemsDelDia.filter(i => {
        const type = (i.tipo_vuelo || i.tipo || '').toString().trim().toUpperCase();
        return type === 'RUTA';
      });
      
      const numRutas = Math.max(1, rutas.length); // Always at least 1 track for Rutas so the header exists
      const colsCount = 1 + numRutas; // Locales + Rutas
      const startCol = currentGridCol;
      currentGridCol += colsCount;
      
      return { id: d.id, label: d.label, date, startCol, colsCount, numRutas, locales, rutas };
    });
  }, [visibleDays, visibleDates, visibleItems]);

  const gridTemplateColumns = useMemo(() => {
    let cols = ['80px'];
    dayConfigs.forEach(dc => {
      cols.push(`minmax(150px, 1fr)`); // Locales col
      for (let i = 0; i < dc.numRutas; i++) {
        cols.push(`minmax(90px, 1fr)`); // Rutas cols (thinner)
      }
    });
    return cols.join(' ');
  }, [dayConfigs]);

  return (
    <div className={`admin-calendar-root ${selectedForMove ? 'mode-moving' : ''} ${isMobile ? 'is-mobile' : ''}`}>

      {mostrarBuscador && (
        <div className="cal-buscador">
          <i className="bi bi-search"></i>
          <input
            type="text"
            placeholder="Buscar alumno para filtrar el calendario…"
            value={busquedaAlumno}
            onChange={(e) => setBusquedaAlumno(e.target.value)}
          />
          {busquedaAlumno && (
            <button type="button" className="cal-buscador__clear" onClick={() => setBusquedaAlumno("")} aria-label="Limpiar búsqueda">
              <i className="bi bi-x-lg"></i>
            </button>
          )}
        </div>
      )}

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
            disabled={mobileDayOffset >= DIAS.length - 3} 
            onClick={() => setMobileDayOffset(prev => Math.min(DIAS.length - 3, prev + 1))}
          >
            Siguiente <i className="bi bi-chevron-right"></i>
          </button>
        </div>
      )}



      <div className="admin-calendar-wrapper" style={{
        overflowX: 'auto',
        background: 'var(--c-surface-0)',
        position: 'relative',
        display: 'block',
        width: '100%',
        borderRadius: '8px',
        border: '1px solid var(--neutral-border)'
      }}>
        <div className="admin-calendar-grid" style={{ 
          display: 'grid', 
          gridTemplateColumns,
          gridTemplateRows: `auto auto repeat(${bloques.length}, minmax(80px, auto))`,
          minWidth: isMobile ? '100%' : '1000px', 
        }}>
          {/* Top Left Corner */}
          <div style={{ 
            gridColumn: 1, gridRow: '1 / span 2', 
            position: 'sticky', left: 0, zIndex: 30, 
            background: 'var(--c-surface-2)', 
            borderRight: '1px solid var(--neutral-border)',
            borderBottom: '1px solid var(--neutral-border)' 
          }}></div>

          {/* Day Headers (Row 1) & Sub-headers (Row 2) */}
          {dayConfigs.map((dc) => {
            const isToday = dc.date.getTime() === today.getTime();
            return (
              <React.Fragment key={`day-${dc.id}`}>
                {/* Row 1: Day Label */}
                <div style={{ 
                  gridColumn: `${dc.startCol} / span ${dc.colsCount}`,
                  gridRow: 1,
                  padding: '8px', textAlign: 'center', background: 'var(--c-surface-2)',
                  borderRight: '1px solid var(--neutral-border)', 
                  borderBottom: '1px solid var(--neutral-border)'
                }}>
                  <div style={{ 
                    color: isToday ? 'var(--c-primary-700)' : 'var(--c-ink-3)',
                    fontWeight: isToday ? 800 : 700,
                    borderBottom: isToday ? '2px solid var(--c-primary-500)' : 'none',
                    display: 'inline-block', paddingBottom: '2px'
                  }}>
                    {dc.label} {dc.date.getDate()}
                  </div>
                </div>

                {/* Row 2: Sub Headers */}
                <div style={{
                  gridColumn: dc.startCol,
                  gridRow: 2,
                  position: 'sticky', top: 0, zIndex: 15,
                  padding: '6px', textAlign: 'center', background: 'var(--c-surface-2)',
                  borderRight: '1px solid var(--neutral-border)',
                  borderBottom: '1px solid var(--neutral-border)',
                  fontSize: '0.8rem', fontWeight: 600, color: 'var(--c-ink-2)'
                }}>
                  Locales
                </div>
                {dc.numRutas > 0 && (
                  <div style={{
                    gridColumn: `${dc.startCol + 1} / span ${dc.numRutas}`,
                    gridRow: 2,
                    position: 'sticky', top: 0, zIndex: 15,
                    padding: '6px', textAlign: 'center', background: 'var(--c-surface-3)', // Slight diff color for Rutas header
                    borderRight: '1px solid var(--neutral-border)',
                    borderBottom: '1px solid var(--neutral-border)',
                    fontSize: '0.8rem', fontWeight: 600, color: 'var(--c-ink-2)'
                  }}>
                    Rutas
                  </div>
                )}
              </React.Fragment>
            );
          })}

          {/* Time Column (Row 3..N) */}
          {bloques.map((b, rowIdx) => (
            <div key={`time-${b.id_bloque}`} style={{ 
              gridColumn: 1,
              gridRow: 3 + rowIdx,
              position: 'sticky', left: 0, zIndex: 20,
              background: 'var(--c-surface-0)',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
              borderRight: '1px solid var(--neutral-border)',
              borderBottom: '1px solid var(--neutral-border)',
              padding: '12px 4px', fontSize: '0.85rem', color: 'var(--c-ink-3)', fontFamily: 'var(--font-mono)'
            }}>
              {formatHora(b.hora_inicio)}
            </div>
          ))}

          {/* Background Grid Cells for Drop Targets */}
          {bloques.map((b, rowIdx) => (
            dayConfigs.map((dc) => {
              const bloqueado = isBloqueado(dc.id, b.id_bloque);
              const agendable = !!onEmptyCellClick && !bloqueado;
              return (
                <div key={`bg-${dc.id}-${b.id_bloque}`}
                  className={`calendar-cell ${bloqueado ? "lunch-cell" : ""} ${!isEditable ? "readonly" : ""} ${agendable ? "cell-agendable" : ""}`}
                  style={{
                    gridColumn: `${dc.startCol} / span ${dc.colsCount}`,
                    gridRow: 3 + rowIdx,
                    borderRight: '1px solid var(--neutral-border)',
                    borderBottom: '1px solid var(--neutral-border)',
                    zIndex: 1,
                    transition: 'background 0.2s',
                    cursor: agendable ? 'pointer' : 'default',
                  }}
                  title={agendable ? "Click para agendar en este bloque" : undefined}
                  onClick={() => {
                    if (selectedForMove) {
                      if (!isEditable) return;
                      handleDrop({ dia_semana: dc.id, id_bloque: b.id_bloque, id_aeronave: selectedForMove.id_aeronave });
                      setSelectedForMove(null);
                      setDragging(null);
                      return;
                    }
                    if (agendable) onEmptyCellClick({ dia_semana: dc.id, id_bloque: b.id_bloque });
                  }}
                  onDragOver={(!isEditable || bloqueado) ? undefined : (e) => e.preventDefault()}
                  onDrop={
                    (!isEditable || bloqueado || !dragging) ? undefined : () => {
                      handleDrop({ dia_semana: dc.id, id_bloque: b.id_bloque, id_aeronave: dragging.id_aeronave });
                    }
                  }
                ></div>
              );
            })
          ))}

          {/* Locales Flights (Stacked Vertically per block) + Reservas de uso especial */}
          {bloques.map((b, rowIdx) => (
            dayConfigs.map((dc) => {
              const localesHere = dc.locales.filter(i => Number(i.id_bloque) === Number(b.id_bloque));
              const reservasHere = safeReservas.filter(rv => Number(rv.dia_semana) === Number(dc.id) && Number(rv.id_bloque) === Number(b.id_bloque));
              if (localesHere.length === 0 && reservasHere.length === 0) return null;
              return (
                <div key={`locales-${dc.id}-${b.id_bloque}`} style={{
                  gridColumn: dc.startCol,
                  gridRow: 3 + rowIdx,
                  zIndex: 5,
                  display: 'flex', flexDirection: 'column', gap: '4px', padding: '4px',
                  pointerEvents: 'none'
                }}>
                  {reservasHere.map(rv => (
                    <div key={`reserva-${rv.id}`} className="flight-card reserva-card" style={{ minHeight: '52px', pointerEvents: 'auto' }}
                      title={`Reserva (${MOTIVO_LABEL[rv.motivo] || rv.motivo})${rv.descripcion ? ' — ' + rv.descripcion : ''}`}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.72rem' }}>
                          <i className="bi bi-lock-fill" style={{ marginRight: 3 }} />{MOTIVO_LABEL[rv.motivo] || rv.motivo}
                        </div>
                        {onEliminarReserva && (
                          <button className="reserva-card__del" title="Eliminar reserva"
                            onClick={() => onEliminarReserva(rv.id)}>&times;</button>
                        )}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--neutral-dark)' }}>{rv.aeronave_codigo}</div>
                      {rv.descripcion && <div style={{ fontSize: '0.62rem', color: 'var(--c-ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rv.descripcion}</div>}
                    </div>
                  ))}
                  {localesHere.map(item => {
                    const modified = pendingMoves.some(m => Number(m.id_detalle) === Number(item?.id_detalle));
                    const isSelected = selectedForMove?.id_detalle === item.id_detalle;
                    const estadoClass = getEstadoClass(item);
                    const conflictText = getConflictInfo(item);
                    const editable = puedeEditarItem(item);
                    const badge = estadoSolicitudBadge(item);

                    return (
                      <div
                        key={`local-${item.id_detalle}`}
                        className={`flight-card ${estadoClass} ${modified ? "is-dirty" : ""} ${isSelected ? 'selected-for-move' : ''} ${conflictText ? 'vuelo-card--conflicto' : ''} ${!editable ? 'flight-card--readonly' : ''}`}
                        draggable={isEditable && editable}
                        style={{
                          minHeight: '60px',
                          pointerEvents: 'auto',
                          opacity: 0.85, // Set opacity for lunch visibility
                        }}
                        onClick={(e) => handleCardClick(e, item)}
                        onContextMenu={(e) => handleCardLongPress(e, item)}
                        title={conflictText || "Click para detalles, click derecho para mover"}
                        onDragStart={(e) => {
                          if (!isEditable || !editable) return;
                          setDragging({
                            id_detalle: item.id_detalle,
                            id_bloque: item.id_bloque,
                            dia_semana: item.dia_semana,
                            id_aeronave: item.id_aeronave,
                          });
                        }}
                      >
                        <div style={{ padding: '2px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div className="flight-alumno" style={{ fontWeight: 600 }}>
                            {conflictText && <span className="conflict-icon">⚠</span>}
                            {item.saldo_bajo && <span title={`Saldo bajo: el alumno tiene $${Number(item.saldo_alumno ?? 0).toFixed(2)} y este vuelo cuesta aprox. $${Number(item.tarifa_estimada ?? 0).toFixed(2)}/h`} style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--c-warn-700)', background: 'var(--c-warn-50)', border: '1px solid var(--c-warn-700)', padding: '1px 4px', borderRadius: '999px', marginRight: '4px', display: 'inline-block' }}>$</span>}
                            {item.categoria === 'CHEQUEO_LINEA' && item.tipo_instruccion === 'REFRESH' && (
                              <span
                                title={item.debitar_saldo ? "Refresh — debita del saldo del practicante al completarse" : "Refresh — paga al momento / coordinar con Administración"}
                                style={{
                                  fontSize: '0.6rem',
                                  fontWeight: 800,
                                  color: item.debitar_saldo ? 'var(--c-info-700)' : 'var(--c-warn-700)',
                                  background: item.debitar_saldo ? 'var(--c-info-100)' : 'var(--c-warn-50)',
                                  border: `1px solid ${item.debitar_saldo ? 'var(--c-info-700)' : 'var(--c-warn-700)'}`,
                                  padding: '1px 4px',
                                  borderRadius: '999px',
                                  marginRight: '4px',
                                  display: 'inline-block',
                                }}
                              >
                                R$
                              </span>
                            )}
                            {item.es_extracurricular && <span title="Vuelo extracurricular (prioridad menor)" style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--c-info-700)', background: 'var(--c-info-50)', padding: '1px 5px', borderRadius: '999px', marginRight: '4px' }}>EXC</span>}
                            {badge && <span className={`cal-badge ${badge.cls}`}>{badge.label}</span>}
                            <LicenciaPill nombre={item.alumno_licencia_nombre} />
                            {abbrevNombre(item.alumno_nombre_corto, item.alumno_nombre)}
                          </div>
                          <div className="flight-aeronave" style={{ fontSize: '0.7rem', color: 'var(--neutral-dark)' }}>
                            {item.aeronave_codigo}
                            {item.instructor_nombre && ` • Inst: ${abbrevNombre(item.instructor_nombre_corto, item.instructor_nombre)}`}
                          </div>
                          {resumenPorAlumno[item.id_alumno] && (
                            <div className="flight-horas-semana" title={resumenTooltip(item)}>
                              <i className="bi bi-clock-history"></i> {resumenLabel(item)}
                            </div>
                          )}
                          {isSelected && <div className="move-indicator" style={{ fontSize: '0.65rem', color: 'var(--primary)', marginTop: '2px' }}>Moviendo...</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })
          ))}

          {/* Rutas Flights (Span across blocks, horizontal columns) */}
          {dayConfigs.map(dc => {
             return dc.rutas.map((item, rIdx) => {
                const isCurrentInPopover = activePopover?.item?.id_detalle === item.id_detalle;
                const effectiveStart = isCurrentInPopover ? Number(tempBloqueInicio) : Number(item.id_bloque);
                const effectiveEnd = isCurrentInPopover ? Number(tempBloqueFin) : (item.id_bloque_fin ? Number(item.id_bloque_fin) : Number(item.id_bloque));

                const startIdx = bloques.findIndex(b => Number(b.id_bloque) === effectiveStart);
                const endIdx = bloques.findIndex(b => Number(b.id_bloque) === effectiveEnd);
                
                if (startIdx < 0) return null;
                const span = Math.max(1, (endIdx >= 0 ? endIdx : startIdx) - startIdx + 1);
                const col = dc.startCol + 1 + rIdx;

                const modified = pendingMoves.some(m => Number(m.id_detalle) === Number(item?.id_detalle));
                const isSelected = selectedForMove?.id_detalle === item.id_detalle;
                const estadoClass = getEstadoClass(item);
                const conflictText = getConflictInfo(item);
                const editable = puedeEditarItem(item);
                const badge = estadoSolicitudBadge(item);

                // Pastel colors
                const colors = ['#f0fdfa', '#fefce8', '#eff6ff', '#fdf2f8', '#faf5ff', '#fff7ed'];
                const bgColor = colors[Number(item.id_detalle || 0) % colors.length];

                const hasPopConflictInst = activePopover?.item?.id_detalle === item.id_detalle && popoverConflict.inst;
                const hasPopConflictAero = activePopover?.item?.id_detalle === item.id_detalle && popoverConflict.aero;

                return (
                  <div key={`ruta-${item.id_detalle}`} style={{
                    gridColumn: col,
                    gridRow: `${3 + startIdx} / span ${span}`,
                    zIndex: (activePopover?.item?.id_detalle === item.id_detalle) ? 1000 : 10, // Elevate card if popover open
                    padding: '4px',
                    display: 'flex', flexDirection: 'column',
                    pointerEvents: 'none'
                  }}>
                    <div
                      className={`flight-card ${estadoClass} ${modified ? "is-dirty" : ""} ${isSelected ? 'selected-for-move' : ''} ${conflictText || hasPopConflictAero || hasPopConflictInst ? 'vuelo-card--conflicto' : ''} ${hasPopConflictInst ? 'vuelo-card--conflicto-inst' : ''} ${!editable ? 'flight-card--readonly' : ''}`}
                      draggable={isEditable && editable}
                      style={{
                        flexGrow: 1, minHeight: '60px',
                        pointerEvents: 'auto',
                        borderLeft: '4px solid var(--primary)',
                        backgroundColor: bgColor,
                        boxShadow: (activePopover?.item?.id_detalle === item.id_detalle) ? '0 10px 20px rgba(0,0,0,0.1)' : '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                        opacity: 0.85 // Opacity for lunch visibility
                      }}
                      onClick={(e) => handleCardClick(e, item)}
                      onContextMenu={(e) => handleCardLongPress(e, item)}
                      title={conflictText || "Click para detalles, click derecho para mover"}
                      onDragStart={(e) => {
                        if (!isEditable || !editable) return;
                        setDragging({
                          id_detalle: item.id_detalle,
                          id_bloque: item.id_bloque,
                          dia_semana: item.dia_semana,
                          id_aeronave: item.id_aeronave,
                        });
                      }}
                    >
                      <div style={{ position: 'sticky', top: '30px', padding: '2px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div className="flight-alumno" style={{ fontWeight: 600 }}>
                          {conflictText && <span className="conflict-icon">⚠</span>}
                          {item.saldo_bajo && <span title={`Saldo bajo: el alumno tiene $${Number(item.saldo_alumno ?? 0).toFixed(2)} y este vuelo cuesta aprox. $${Number(item.tarifa_estimada ?? 0).toFixed(2)}/h`} style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--c-warn-700)', background: 'var(--c-warn-50)', border: '1px solid var(--c-warn-700)', padding: '1px 4px', borderRadius: '999px', marginRight: '4px', display: 'inline-block' }}>$</span>}
                          {item.categoria === 'CHEQUEO_LINEA' && item.tipo_instruccion === 'REFRESH' && (
                            <span
                              title={item.debitar_saldo ? "Refresh — debita del saldo del practicante al completarse" : "Refresh — paga al momento / coordinar con Administración"}
                              style={{
                                fontSize: '0.6rem',
                                fontWeight: 800,
                                color: item.debitar_saldo ? 'var(--c-info-700)' : 'var(--c-warn-700)',
                                background: item.debitar_saldo ? 'var(--c-info-100)' : 'var(--c-warn-50)',
                                border: `1px solid ${item.debitar_saldo ? 'var(--c-info-700)' : 'var(--c-warn-700)'}`,
                                padding: '1px 4px',
                                borderRadius: '999px',
                                marginRight: '4px',
                                display: 'inline-block',
                              }}
                            >
                              R$
                            </span>
                          )}
                          <span style={{fontSize:'0.65rem', padding:'2px 4px', background:'rgba(0,0,0,0.05)', color:'var(--neutral-dark)', borderRadius:'4px', marginRight:'4px', display:'inline-block'}}>
                            {item.con_parada ? `Ruta · MSSS→${(Array.isArray(item.tramos_ruta) ? item.tramos_ruta : []).join('→')}→MSSS` : 'Ruta'}
                          </span>
                          {item.es_extracurricular && <span title="Vuelo extracurricular (prioridad menor)" style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--c-info-700)', background: 'var(--c-info-50)', padding: '1px 5px', borderRadius: '999px', marginRight: '4px' }}>EXC</span>}
                          {badge && <span className={`cal-badge ${badge.cls}`}>{badge.label}</span>}
                            <LicenciaPill nombre={item.alumno_licencia_nombre} />
                          {item.alumno_nombre.split(" ")[0]}
                        </div>
                        <div className="flight-aeronave" style={{ fontSize: '0.7rem', color: 'var(--neutral-dark)' }}>
                          {item.aeronave_codigo}
                          {item.instructor_nombre && <br/>}
                          {item.instructor_nombre && `Inst: ${abbrevNombre(item.instructor_nombre_corto, item.instructor_nombre)}`}
                        </div>
                        {resumenPorAlumno[item.id_alumno] && (
                          <div className="flight-horas-semana" title={resumenTooltip(item)}>
                            <i className="bi bi-clock-history"></i> {resumenLabel(item)}
                          </div>
                        )}
                        {isSelected && <div className="move-indicator" style={{ fontSize: '0.65rem', color: 'var(--primary)', marginTop: '2px' }}>Moviendo...</div>}
                      </div>

                        {/* Se eliminó el popover sticky interno que causaba problemas de layout */}
                    </div>
                  </div>
                );
             });
          })}
        </div>
      </div>


      <div className="calendar-legend">
        <div className="legend-item"><span className="dot programado"></span> Programado / Pendiente</div>
        <div className="legend-item"><span className="dot agendado"></span> Aprobado</div>
        <div className="legend-item"><span className="dot progreso"></span> En progreso</div>
        <div className="legend-item"><span className="dot completado"></span> Completado</div>
        <div className="legend-item"><span className="dot lunch"></span> Almuerzo / Sin vuelos</div>
      </div>

      {/* ── Popover de Edición (Unificado para Locales y Rutas) ── */}
      {activePopover && (
        <>
          <div className="popover-overlay" onClick={closePopover} />
          <div className="flight-popover">
            <PopoverContent
              activePopover={activePopover}
              tempAeronaveId={tempAeronaveId}
              setTempAeronaveId={setTempAeronaveId}
              tempInstructorId={tempInstructorId}
              setTempInstructorId={setTempInstructorId}
              tempCategoria={tempCategoria}
              setTempCategoria={setTempCategoria}
              tempLicenciaChequeo={tempLicenciaChequeo}
              setTempLicenciaChequeo={setTempLicenciaChequeo}
              licencias={licencias}
              tempBloqueInicio={tempBloqueInicio}
              setTempBloqueInicio={setTempBloqueInicio}
              tempBloqueFin={tempBloqueFin}
              setTempBloqueFin={setTempBloqueFin}
              aeronaves={aeronaves}
              instructores={instructores}
              popoverConflict={popoverConflict}
              bloques={bloques}
              isEditable={isEditable && puedeEditarItem(activePopover.item)}
              allowInstructorChange={allowInstructorChange}
              onRechazar={onRechazar}
              onAprobar={onAprobar}
              week={week}
              onGestionarEspera={onGestionarEspera}
              onAsignarTramos={onAsignarTramos}
              onGuardarRemarks={onGuardarRemarks}
              rechazarLabel={rechazarLabel || (week === "current" ? "Cancelar vuelo" : "Rechazar Vuelo")}
              loadingSave={loadingSave}
              handleSave={handleSave}
              closePopover={closePopover}
              setDragging={setDragging}
              setSelectedForMove={setSelectedForMove}
              onRefresh={onRefresh}
              getEstadoClass={getEstadoClass}
              resumenPorAlumno={resumenPorAlumno}
              formatDetalleDia={formatDetalleDia}
            />
          </div>
        </>
      )}
    </div>
  );
}

function PopoverContent({
  activePopover,
  tempAeronaveId, setTempAeronaveId,
  tempInstructorId, setTempInstructorId,
  tempCategoria, setTempCategoria,
  tempLicenciaChequeo, setTempLicenciaChequeo,
  licencias = [],
  tempBloqueInicio, setTempBloqueInicio,
  tempBloqueFin, setTempBloqueFin,
  aeronaves,
  instructores,
  popoverConflict,
  bloques,
  isEditable,
  allowInstructorChange = true,
  onRechazar,
  onAprobar,
  week,
  onGestionarEspera,
  onAsignarTramos,
  onGuardarRemarks,
  rechazarLabel = "Rechazar Vuelo",
  loadingSave,
  handleSave,
  closePopover,
  setDragging,
  setSelectedForMove,
  onRefresh,
  getEstadoClass,
  resumenPorAlumno,
  formatDetalleDia
}) {
  // Remarks del instructor sobre este vuelo. El popover se monta al abrirse,
  // así que el estado arranca con el valor actual del item.
  const [remarksDraft, setRemarksDraft] = useState(activePopover.item.remarks_instructor || "");
  const [savingRemarks, setSavingRemarks] = useState(false);
  const remarksCambiado = remarksDraft !== (activePopover.item.remarks_instructor || "");

  async function handleGuardarRemarks() {
    setSavingRemarks(true);
    try {
      await onGuardarRemarks(activePopover.item.id_detalle, remarksDraft);
      activePopover.item.remarks_instructor = remarksDraft.trim() || null;
    } finally {
      setSavingRemarks(false);
    }
  }

  // Aprobar: marca la solicitud como revisada antes de publicar la semana
  // (solo tiene sentido en la semana "next", todavía sin publicar). Estado
  // local propio (no basta con mutar activePopover.item: es una mutación de
  // prop sin setState, así que React nunca repinta el popover con eso solo).
  const [aprobando, setAprobando] = useState(false);
  const [yaAprobado, setYaAprobado] = useState(activePopover.item.estado_vuelo_individual === "APROBADA");
  async function handleAprobar() {
    setAprobando(true);
    const { toast } = await import("sonner");
    try {
      if (onAprobar) {
        await onAprobar(activePopover.item.id_detalle);
      } else {
        const { aprobarSolicitudIndividual } = await import("../../services/adminApi");
        await aprobarSolicitudIndividual(activePopover.item.id_detalle);
      }
      activePopover.item.estado_vuelo_individual = "APROBADA";
      setYaAprobado(true);
      toast.success("Vuelo aprobado");
      if (onRefresh) onRefresh();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Error al aprobar");
    } finally {
      setAprobando(false);
    }
  }

  return (
    <>
      <div className="pop-header">
        <div>
          <div className="pop-alumno">{activePopover.item.alumno_nombre}</div>
          <div className={`pop-status-badge ${getEstadoClass(activePopover.item)}`}>
            {activePopover.item.estado_vuelo || activePopover.item.estado_solicitud || 'PROGRAMADO'}
          </div>
        </div>
        <button className="pop-close" onClick={closePopover}>&times;</button>
      </div>

      <div className="pop-body">
        {activePopover.item.comentario_alumno && (
          <div className="pop-alert" style={{ background: 'var(--c-info-50, #eff6ff)', color: 'var(--c-ink-2, #334155)', border: '1px solid var(--c-info-100, #dbeafe)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <i className="bi bi-chat-left-quote" style={{ color: 'var(--c-info-700, #1d4ed8)', marginTop: 2 }}></i>
            <span><strong>Nota del alumno:</strong> {activePopover.item.comentario_alumno}</span>
          </div>
        )}

        {/* Detalle de las OTRAS solicitudes de este mismo alumno esta semana
            (día y hora) — para detectar de un vistazo si está pidiendo
            demasiados vuelos o si se encima con algo que ya tiene. */}
        {(() => {
          const r = resumenPorAlumno?.[activePopover.item.id_alumno];
          const otras = (r?.detalle || []).filter((d) => d.id_detalle !== activePopover.item.id_detalle);
          if (otras.length === 0) return null;
          return (
            <div className="pop-alert" style={{ background: 'var(--c-surface-1, #f8fafc)', color: 'var(--c-ink-2, #334155)', border: '1px solid var(--c-line-1, #e2e8f0)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <i className="bi bi-calendar2-week" style={{ color: 'var(--c-ink-3, #64748b)', marginTop: 2 }}></i>
              <div>
                <strong>Otras solicitudes de {activePopover.item.alumno_nombre?.split(" ")[0]} esta semana ({otras.length}):</strong>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {otras.map((d, i) => (
                    <li key={i} style={{ fontSize: '0.8rem' }}>{formatDetalleDia(d)}</li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })()}

        {/* Remarks del instructor: el instructor los edita en SU calendario de
            solicitudes; programación/admin los ven en solo-lectura. */}
        {onGuardarRemarks && isEditable ? (
          <div style={{ margin: '2px 0 8px' }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--c-ink-3, #64748b)', display: 'block', marginBottom: 3 }}>
              <i className="bi bi-chat-left-text"></i> Remarks para Programación
            </label>
            <textarea
              value={remarksDraft}
              onChange={(e) => setRemarksDraft(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Comentario sobre este vuelo/alumno (lo ve Programación al aprobar)…"
              style={{ width: '100%', fontSize: '0.78rem', padding: 6, border: '1px solid var(--c-line-2, #e2e8f0)', borderRadius: 6, resize: 'vertical', boxSizing: 'border-box' }}
            />
            {remarksCambiado && (
              <button
                onClick={handleGuardarRemarks}
                disabled={savingRemarks}
                style={{ marginTop: 4, fontSize: '0.74rem', fontWeight: 700, padding: '4px 10px', border: 'none', borderRadius: 6, background: 'var(--c-brand-700, #1B365D)', color: '#fff', cursor: 'pointer' }}
              >
                {savingRemarks ? 'Guardando…' : 'Guardar remarks'}
              </button>
            )}
          </div>
        ) : activePopover.item.remarks_instructor ? (
          <div className="pop-alert" style={{ background: 'var(--c-warn-50, #fffbeb)', color: 'var(--c-ink-2, #334155)', border: '1px solid var(--c-warn-100, #fef3c7)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <i className="bi bi-chat-left-text" style={{ color: 'var(--c-warn-700, #b45309)', marginTop: 2 }}></i>
            <span><strong>Remarks del instructor:</strong> {activePopover.item.remarks_instructor}</span>
          </div>
        ) : null}
        {popoverConflict.aero && (
          <div className="pop-alert pop-alert--danger">
            ⚠ <strong>Conflicto de Aeronave:</strong> Este avión ya está asignado en este bloque.
          </div>
        )}
        {popoverConflict.inst && (
          <div className="pop-alert pop-alert--warning">
            ⚠ <strong>Conflicto de Instructor:</strong> El instructor ya tiene un vuelo programado.
          </div>
        )}

        {!isEditable && (
          <div className="pop-alert" style={{ background: 'var(--c-info-50, #eff6ff)', color: 'var(--c-info-700, #1d4ed8)', border: '1px solid var(--c-info-200, #bfdbfe)' }}>
            <i className="bi bi-eye"></i> Solo lectura — este vuelo no es de tus alumnos.
          </div>
        )}

        {activePopover.item.saldo_bajo && (
          <div className="pop-alert" style={{ background: 'var(--c-warn-50, #fffbeb)', color: 'var(--c-warn-700, #b45309)', border: '1px solid var(--c-warn-700, #b45309)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <span style={{ fontWeight: 800 }}>$</span>
            <span>
              <strong>Saldo bajo:</strong> el alumno tiene ${Number(activePopover.item.saldo_alumno ?? 0).toFixed(2)} y
              este vuelo cuesta aprox. ${Number(activePopover.item.tarifa_estimada ?? 0).toFixed(2)}/h.
            </span>
          </div>
        )}

        <div className={`pop-field ${popoverConflict.aero ? 'pop-field--error' : ''}`}>
          <label>Aeronave</label>
          <select value={tempAeronaveId} disabled={!isEditable} onChange={e => setTempAeronaveId(e.target.value)}>
            {aeronaves
              .filter(a => {
                const isActual = Number(a.id_aeronave) === Number(activePopover.item.id_aeronave);
                return (a.activa !== false) || isActual;
              })
              .map(a => (
                <option key={a.id_aeronave} value={a.id_aeronave}>
                  {a.codigo} - {a.modelo} { (Number(a.id_aeronave) === Number(activePopover.item.id_aeronave)) ? '(Actual)' : '' }
                </option>
              ))
            }
          </select>
        </div>

        {allowInstructorChange && (
          <div className={`pop-field ${popoverConflict.inst ? 'pop-field--error' : ''}`}>
            <label>Instructor</label>
            <select value={tempInstructorId} disabled={!isEditable} onChange={e => setTempInstructorId(e.target.value)}>
              <option value="">-- Sin asignar --</option>
              {instructores.map(ins => (
                <option key={ins.id_instructor} value={ins.id_instructor}>
                  {ins.nombre_completo}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Tipo de vuelo. Solo Normal/Chequeo: Demo, Prueba y Chequeo de línea
            REEMPLAZAN al alumno por una ficha placeholder, así que no tienen
            sentido sobre la solicitud de un alumno real — esas se agendan
            desde cero con el botón de agendar. */}
        {allowInstructorChange && (
          <div className="pop-field">
            <label>Tipo de vuelo</label>
            <select value={tempCategoria} disabled={!isEditable} onChange={e => setTempCategoria(e.target.value)}>
              <option value="NORMAL">Normal</option>
              <option value="CHEQUEO">Chequeo</option>
            </select>
          </div>
        )}

        {allowInstructorChange && tempCategoria === "CHEQUEO" && (
          <div className="pop-field">
            <label>Licencia a chequear</label>
            <select value={tempLicenciaChequeo} disabled={!isEditable} onChange={e => setTempLicenciaChequeo(e.target.value)}>
              <option value="">La licencia actual del alumno</option>
              {licencias.map(l => (
                <option key={l.id_licencia} value={l.id_licencia}>{l.nombre}</option>
              ))}
            </select>
          </div>
        )}

        {activePopover.item.tipo_vuelo === 'RUTA' && (
          <>
            <div className="pop-row" style={{ display: 'flex', gap: '10px' }}>
              <div className="pop-field" style={{ flex: 1 }}>
                <label>Bloque Inicio</label>
                <select value={tempBloqueInicio} disabled={!isEditable} onChange={e => setTempBloqueInicio(e.target.value)}>
                  {bloques.map(b => (
                    <option key={b.id_bloque} value={b.id_bloque}>{b.hora_inicio.slice(0,5)}</option>
                  ))}
                </select>
              </div>
              <div className="pop-field" style={{ flex: 1 }}>
                <label>Bloque Fin</label>
                <select value={tempBloqueFin} disabled={!isEditable} onChange={e => setTempBloqueFin(e.target.value)}>
                  {bloques
                    .map((b, idx) => ({ ...b, idx }))
                    .filter(b => b.idx >= bloques.findIndex(bx => Number(bx.id_bloque) === Number(tempBloqueInicio)))
                    .map(b => (
                      <option key={b.id_bloque} value={b.id_bloque}>{b.hora_fin.slice(0,5)}</option>
                    ))
                  }
                </select>
              </div>
            </div>
            {Number(tempBloqueFin) <= Number(tempBloqueInicio) && (
              <div className="pop-alert pop-alert--danger" style={{ fontSize: '0.7rem', marginTop: '-8px', marginBottom: '12px' }}>
                ⚠ La hora de fin debe ser posterior al inicio.
              </div>
            )}
          </>
        )}

        {isEditable && (
          <div className="pop-actions">
            <button
              className={`btn-save ${(popoverConflict.aero || popoverConflict.inst) ? 'btn-save--conflict' : ''}`}
              onClick={handleSave}
              disabled={loadingSave || (activePopover.item.tipo_vuelo === 'RUTA' && Number(tempBloqueFin) <= Number(tempBloqueInicio))}
            >
              {loadingSave ? <span className="pop-spinner"></span> :
               (popoverConflict.aero || popoverConflict.inst) ? 'Guardar con conflictos' : 'Guardar cambios'}
            </button>

            <button
              className="btn-move-v"
              onClick={() => {
                setDragging(activePopover.item);
                setSelectedForMove(activePopover.item);
                closePopover();
              }}
            >
              Mover vuelo
            </button>
          </div>
        )}

        {onGestionarEspera && (
          <button
            type="button"
            className="btn-move-v"
            style={{ width: '100%', marginTop: 8 }}
            onClick={() => onGestionarEspera({
              id_semana: activePopover.item.id_semana,
              dia_semana: activePopover.item.dia_semana,
              id_bloque: activePopover.item.id_bloque,
              hora: activePopover.item.hora_inicio ? String(activePopover.item.hora_inicio).slice(0,5) : "",
            })}
          >
            <i className="bi bi-hourglass-split"></i> Lista de espera
          </button>
        )}

        {/* Solo con id_vuelo: los tramos nacen al publicar la semana, así que en
            la semana próxima (sin publicar) todavía no hay nada que asignar. */}
        {onAsignarTramos && activePopover.item.con_parada && activePopover.item.id_vuelo && (
          <button type="button" className="btn-move-v" style={{ width: '100%', marginTop: 8 }}
            onClick={() => onAsignarTramos(activePopover.item.id_detalle)}>
            <i className="bi bi-people"></i> Asignar alumnos por tramo
          </button>
        )}

        {/* allowInstructorChange=false marca la vista restringida del instructor
            (Instructor/Solicitudes): ahí "aprobar" no aplica — es la revisión
            que hace Programación/Admin sobre lo que el instructor ya envió. */}
        {isEditable && week === "next" && allowInstructorChange && (
          yaAprobado ? (
            <div className="pop-alert" style={{ background: 'var(--c-success-50, #ecfdf5)', color: 'var(--c-success-700, #047857)', border: '1px solid var(--c-success-100, #a7f3d0)', display: 'flex', gap: 6, alignItems: 'center' }}>
              <i className="bi bi-check-circle-fill"></i> Aprobado — listo para publicar.
            </div>
          ) : (
            <button
              type="button"
              className="btn-approve-v"
              onClick={handleAprobar}
              disabled={aprobando}
              style={{ width: '100%', marginBottom: 8 }}
            >
              {aprobando ? "Aprobando…" : <><i className="bi bi-check-lg"></i> Aprobar vuelo</>}
            </button>
          )
        )}

        {isEditable && (
          <div className="pop-danger-zone">
            <button
              className="btn-reject-v"
              onClick={async () => {
                const confirm = window.confirm(`¿${rechazarLabel} de ${activePopover.item.alumno_nombre}?`);
                if (!confirm) return;
                const { toast } = await import("sonner");
                try {
                  if (onRechazar) {
                    await onRechazar(activePopover.item.id_detalle);
                  } else {
                    const { rechazarSolicitudIndividual } = await import("../../services/adminApi");
                    await rechazarSolicitudIndividual(activePopover.item.id_detalle);
                  }
                  toast.success("Vuelo actualizado");
                  closePopover();
                  if (onRefresh) onRefresh();
                } catch (e) {
                  toast.error(e?.response?.data?.message || "Error al procesar");
                }
              }}
            >
              {rechazarLabel}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
