import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getAlumnosListAdmin,
  getInstructoresActivos,
  getAeronavesPermitidasAlumno,
  getLicencias,
  getAeronavesPorLicencia,
} from "../../services/adminApi";
import {
  agendarSolicitudCalendario,
  agendarVueloDirectoCalendario,
} from "../../services/programacionApi";
import { crearReservaAeronave } from "../../services/adminApi";
import "./AgendarVueloModal.css";

/**
 * Modal para agendar un vuelo desde una celda vacía del calendario.
 * - Semana NO publicada → crea solicitud (aditiva).
 * - Semana publicada    → crea vuelo directo (notifica).
 *
 * Props:
 *   week, publicada, id_semana, dia_semana, id_bloque, bloques, aeronaves,
 *   fixedInstructor (id_instructor a forzar, opcional), alumnosScope (lista de
 *   alumnos a permitir; si se omite se cargan todos), onClose, onCreated.
 */
const DIAS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export default function AgendarVueloModal({
  week, publicada, id_semana, dia_semana, id_bloque,
  bloques = [], aeronaves = [], fixedInstructor = null, alumnosScope = null,
  createFn = null, // si se provee, se usa en vez de los endpoints de programación
  pickSlot = false, // permite elegir día + bloque dentro del modal (p.ej. Turno)
  onClose, onCreated,
}) {
  // Día/bloque efectivos: vienen fijos de la celda, salvo en modo pickSlot.
  const [diaSel, setDiaSel] = useState(Number(dia_semana) || 1);
  const [bloqueSel, setBloqueSel] = useState(Number(id_bloque) || Number(bloques[0]?.id_bloque) || 1);
  const diaEff = pickSlot ? diaSel : Number(dia_semana);
  const bloqueEff = pickSlot ? bloqueSel : Number(id_bloque);
  const [alumnos, setAlumnos] = useState(alumnosScope || []);
  const [instructores, setInstructores] = useState([]);
  const [idAlumno, setIdAlumno] = useState("");
  const [idInstructor, setIdInstructor] = useState(fixedInstructor ? String(fixedInstructor) : "");
  const [busqueda, setBusqueda] = useState("");
  const [alumnoAbierto, setAlumnoAbierto] = useState(false);
  const [alumnoHighlight, setAlumnoHighlight] = useState(0);
  const alumnoBoxRef = useRef(null);
  const [idAeronave, setIdAeronave] = useState("");
  const [tipoVuelo, setTipoVuelo] = useState("LOCAL");
  const [bloqueFin, setBloqueFin] = useState(String(id_bloque));
  const [extra, setExtra] = useState(false);
  const [permitidas, setPermitidas] = useState(null); // ids permitidas por licencia
  const [saving, setSaving] = useState(false);
  // Modo "uso especial" (reserva de aeronave sin alumno): solo staff (no instructor).
  const [esReserva, setEsReserva] = useState(false);
  const [motivo, setMotivo] = useState("TRASLADO");
  const [descReserva, setDescReserva] = useState("");
  const permiteReserva = !createFn; // el instructor no reserva aviones
  // Tipo de vuelo (solo staff, no en el createFn del instructor): NORMAL (alumno
  // real, su propia licencia), DEMO (pasajero externo no registrado), CHEQUEO
  // (alumno real, pero se elige la licencia a chequear — filtra aeronaves) y
  // CHEQUEO_LINEA (instructor-con-instructor: practicante + PIC).
  const [categoria, setCategoria] = useState("NORMAL");
  const [tipoInstruccion, setTipoInstruccion] = useState("CHEQUEO"); // sub-tipo de CHEQUEO_LINEA
  const [idPracticante, setIdPracticante] = useState(""); // id_usuario del practicante (CHEQUEO_LINEA)
  const [licencias, setLicencias] = useState([]);
  const [idLicenciaChequeo, setIdLicenciaChequeo] = useState("");
  const [aeronavesChequeo, setAeronavesChequeo] = useState(null); // ids permitidas por la licencia elegida (CHEQUEO)
  const [nombreExterno, setNombreExterno] = useState(""); // referencia opcional del pasajero (DEMO)
  const permiteTipoEspecial = !createFn;

  const cambiarCategoria = (nueva) => {
    setCategoria(nueva);
    setIdAlumno(""); setBusqueda("");
    setIdPracticante("");
    setIdLicenciaChequeo(""); setAeronavesChequeo(null);
    setNombreExterno("");
    setExtra(false);
  };

  useEffect(() => {
    (async () => {
      try {
        if (!alumnosScope) {
          const al = await getAlumnosListAdmin();
          setAlumnos(Array.isArray(al) ? al : []);
        }
        if (!fixedInstructor) {
          const ins = await getInstructoresActivos();
          setInstructores(Array.isArray(ins) ? ins : []);
        }
        if (permiteTipoEspecial) {
          const lic = await getLicencias();
          setLicencias(Array.isArray(lic) ? lic : []);
        }
      } catch { /* noop */ }
    })();
  }, [alumnosScope, fixedInstructor, permiteTipoEspecial]);

  // CHEQUEO: al elegir la licencia a chequear, cargar sus aeronaves permitidas.
  useEffect(() => {
    if (categoria !== "CHEQUEO" || !idLicenciaChequeo) { setAeronavesChequeo(null); return; }
    (async () => {
      try {
        const p = await getAeronavesPorLicencia(idLicenciaChequeo);
        setAeronavesChequeo(Array.isArray(p) ? p.map(x => Number(x.id_aeronave)) : []);
      } catch { setAeronavesChequeo(null); }
    })();
  }, [categoria, idLicenciaChequeo]);

  // Al elegir alumno: instructor por defecto = su instructor de vuelo; y cargar
  // aeronaves permitidas por su licencia.
  useEffect(() => {
    if (!idAlumno) { setPermitidas(null); return; }
    const a = alumnos.find(x => Number(x.id_alumno) === Number(idAlumno));
    if (a && !fixedInstructor && a.id_instructor) setIdInstructor(String(a.id_instructor));
    (async () => {
      try {
        const p = await getAeronavesPermitidasAlumno(idAlumno);
        setPermitidas(Array.isArray(p) ? p.map(x => Number(x.id_aeronave)) : []);
      } catch { setPermitidas(null); /* sin acceso al listado → valida el backend */ }
    })();
  }, [idAlumno]); // eslint-disable-line

  const alumnosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const base = !q ? alumnos : alumnos.filter(a => (a.nombre_completo || `${a.nombre} ${a.apellido}`).toLowerCase().includes(q));
    return base.slice(0, 50); // lista larga (todos los alumnos) → limitar el desplegable
  }, [alumnos, busqueda]);

  // Cerrar el desplegable de alumno al hacer click fuera.
  useEffect(() => {
    const onDocClick = (e) => {
      if (alumnoBoxRef.current && !alumnoBoxRef.current.contains(e.target)) setAlumnoAbierto(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => { setAlumnoHighlight(0); }, [busqueda]);

  const seleccionarAlumno = (a) => {
    setIdAlumno(String(a.id_alumno));
    setBusqueda(a.nombre_completo || `${a.nombre} ${a.apellido}`);
    setAlumnoAbierto(false);
  };

  const onAlumnoKeyDown = (e) => {
    if (!alumnoAbierto && (e.key === "ArrowDown" || e.key === "ArrowUp")) { setAlumnoAbierto(true); return; }
    if (!alumnoAbierto) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setAlumnoHighlight(h => Math.min(h + 1, alumnosFiltrados.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAlumnoHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const a = alumnosFiltrados[alumnoHighlight]; if (a) seleccionarAlumno(a); }
    else if (e.key === "Escape") { setAlumnoAbierto(false); }
  };

  // Licencia efectiva a validar: CHEQUEO usa la elegida (si la hay), si no cae
  // a la propia del alumno igual que NORMAL; DEMO/CHEQUEO_LINEA no aplica.
  const permitidasEfectivas = useMemo(() => {
    if (categoria === "CHEQUEO" && idLicenciaChequeo) return aeronavesChequeo;
    if (categoria === "NORMAL" || categoria === "CHEQUEO") return permitidas;
    return null;
  }, [categoria, idLicenciaChequeo, aeronavesChequeo, permitidas]);

  const aeronaveNoPermitida = useMemo(() => {
    if (extra || !idAeronave || permitidasEfectivas === null) return false;
    return !permitidasEfectivas.includes(Number(idAeronave));
  }, [extra, idAeronave, permitidasEfectivas]);

  const rutaInvalida = tipoVuelo === "RUTA" && Number(bloqueFin) < bloqueEff;
  const puedeGuardar = esReserva
    ? (idAeronave && !rutaInvalida && !saving)
    : categoria === "CHEQUEO_LINEA"
    ? (idPracticante && idInstructor && idAeronave && !rutaInvalida && !saving)
    : categoria === "DEMO"
    ? (idInstructor && idAeronave && !rutaInvalida && !saving)
    : (idAlumno && idAeronave && (!publicada || idInstructor) && !aeronaveNoPermitida && !rutaInvalida && !saving);

  const guardar = async () => {
    if (!puedeGuardar) return;
    setSaving(true);

    // Modo reserva de uso especial (sin alumno).
    if (esReserva) {
      try {
        await crearReservaAeronave({
          id_aeronave: Number(idAeronave),
          id_semana,
          dia_semana: diaEff,
          id_bloque: bloqueEff,
          id_bloque_fin: tipoVuelo === "RUTA" ? Number(bloqueFin) : bloqueEff,
          motivo,
          descripcion: descReserva || null,
        });
        toast.success("Aeronave reservada");
        onCreated?.();
        onClose?.();
      } catch (e) {
        toast.error(e?.response?.data?.message || "No se pudo reservar la aeronave");
        setSaving(false);
      }
      return;
    }

    const payloadBase = {
      id_semana,
      id_instructor: idInstructor ? Number(idInstructor) : null,
      dia_semana: diaEff,
      id_bloque: bloqueEff,
      id_bloque_fin: tipoVuelo === "RUTA" ? Number(bloqueFin) : bloqueEff,
      id_aeronave: Number(idAeronave),
      tipo_vuelo: tipoVuelo,
      categoria,
    };
    const payload =
      categoria === "CHEQUEO_LINEA" ? {
        ...payloadBase,
        id_usuario_practicante: Number(idPracticante),
        tipo_instruccion: tipoInstruccion,
      } :
      categoria === "DEMO" ? {
        ...payloadBase,
        nombre_externo: nombreExterno.trim() || null,
      } :
      categoria === "CHEQUEO" ? {
        ...payloadBase,
        id_alumno: Number(idAlumno),
        id_licencia_chequeo: idLicenciaChequeo ? Number(idLicenciaChequeo) : null,
        es_extracurricular: extra,
      } : {
        ...payloadBase,
        id_alumno: Number(idAlumno),
        es_extracurricular: extra,
      };
    try {
      if (createFn) {
        await createFn(payload);
        toast.success("Vuelo agendado");
      } else if (publicada) {
        if (!idInstructor) { toast.error("Elegí un instructor"); setSaving(false); return; }
        await agendarVueloDirectoCalendario(payload);
        toast.success("Vuelo agendado y publicado");
      } else {
        await agendarSolicitudCalendario(payload);
        toast.success("Vuelo agendado");
      }
      onCreated?.();
      onClose?.();
    } catch (e) {
      toast.error(e?.response?.data?.message || "No se pudo agendar el vuelo");
      setSaving(false);
    }
  };

  const horaBloque = bloques.find(b => Number(b.id_bloque) === bloqueEff);
  const horaTxt = horaBloque ? `${String(horaBloque.hora_inicio).slice(0,5)}` : `bloque ${bloqueEff}`;

  return (
    <div className="avm-overlay" onClick={onClose}>
      <div className="avm-card" onClick={(e) => e.stopPropagation()}>
        <div className="avm-head">
          <div>
            <div className="avm-eyebrow">
              {esReserva ? "Reservar aeronave (uso especial)"
                : categoria === "CHEQUEO_LINEA" ? "Chequeo de línea (instructor con instructor)"
                : categoria === "DEMO" ? "Vuelo demo (pasajero externo)"
                : categoria === "CHEQUEO" ? "Chequeo de licencia"
                : publicada ? "Agendar vuelo (semana publicada)" : "Agendar vuelo"}
            </div>
            <h3 className="avm-title">{DIAS[diaEff]} · {horaTxt}</h3>
          </div>
          <button className="avm-close" onClick={onClose}>&times;</button>
        </div>

        <div className="avm-body">
          {pickSlot && (
            <div className="avm-row">
              <div className="avm-field" style={{ flex: 1 }}>
                <label>Día</label>
                <select value={diaSel} onChange={(e) => setDiaSel(Number(e.target.value))}>
                  {[1,2,3,4,5,6].map(d => <option key={d} value={d}>{DIAS[d]}</option>)}
                </select>
              </div>
              <div className="avm-field" style={{ flex: 1 }}>
                <label>Bloque</label>
                <select value={bloqueSel} onChange={(e) => setBloqueSel(Number(e.target.value))}>
                  {bloques.map(b => <option key={b.id_bloque} value={b.id_bloque}>{String(b.hora_inicio).slice(0,5)}</option>)}
                </select>
              </div>
            </div>
          )}
          {permiteReserva && (
            <label className="avm-check" style={{ marginBottom: 2 }}>
              <input type="checkbox" checked={esReserva} onChange={(e) => { setEsReserva(e.target.checked); if (e.target.checked) cambiarCategoria("NORMAL"); }} />
              Uso especial del avión (sin alumno): traslado, prueba, administrativo…
            </label>
          )}

          {permiteTipoEspecial && !esReserva && (
            <div className="avm-field">
              <label>Tipo de vuelo</label>
              <select value={categoria} onChange={(e) => cambiarCategoria(e.target.value)}>
                <option value="NORMAL">Normal</option>
                <option value="DEMO">Demo (pasajero externo)</option>
                <option value="CHEQUEO">Chequeo (con licencia)</option>
                <option value="CHEQUEO_LINEA">Chequeo de línea (instructor con instructor)</option>
              </select>
            </div>
          )}

          {esReserva && (
            <>
              <div className="avm-field">
                <label>Motivo</label>
                <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                  <option value="TRASLADO">Traslado</option>
                  <option value="PRUEBA">Prueba</option>
                  <option value="ADMINISTRATIVO">Administrativo</option>
                  <option value="OTRO">Otro</option>
                </select>
              </div>
              <div className="avm-field">
                <label>Descripción (opcional)</label>
                <input value={descReserva} onChange={(e) => setDescReserva(e.target.value)} placeholder="Ej.: traslado a Comalapa por revisión…" />
              </div>
            </>
          )}

          {!esReserva && categoria === "CHEQUEO_LINEA" && (<>
          <div className="avm-field">
            <label>Practicante (instructor que recibe instrucción) <span className="avm-req">*</span></label>
            <select value={idPracticante} onChange={(e) => setIdPracticante(e.target.value)}>
              <option value="">— Elegí al practicante —</option>
              {instructores.map(i => (
                <option key={i.id_usuario} value={i.id_usuario}>{i.nombre_completo}</option>
              ))}
            </select>
          </div>
          <div className="avm-field">
            <label>Sub-tipo <span className="avm-req">*</span></label>
            <select value={tipoInstruccion} onChange={(e) => setTipoInstruccion(e.target.value)}>
              <option value="CHEQUEO">Chequeo — lo paga la escuela (no se debita a nadie)</option>
              <option value="REFRESH">Refresh — lo paga el practicante (cobro manual)</option>
            </select>
          </div>
          </>)}

          {!esReserva && categoria === "DEMO" && (
            <div className="avm-field">
              <label>Nombre del pasajero (opcional)</label>
              <input
                value={nombreExterno}
                onChange={(e) => setNombreExterno(e.target.value)}
                placeholder="Referencia para facturar manualmente después…"
                maxLength={120}
              />
              <p className="avm-hint">No se debita ningún saldo — se factura manual con estos datos.</p>
            </div>
          )}

          {!esReserva && (categoria === "NORMAL" || categoria === "CHEQUEO") && (
          <div className="avm-field" ref={alumnoBoxRef}>
            <label>Alumno</label>
            <div className="avm-combo">
              <input
                className="avm-search"
                placeholder="Buscar alumno por nombre…"
                value={busqueda}
                onFocus={() => setAlumnoAbierto(true)}
                onChange={(e) => {
                  setBusqueda(e.target.value);
                  setIdAlumno("");
                  setAlumnoAbierto(true);
                }}
                onKeyDown={onAlumnoKeyDown}
                role="combobox"
                aria-expanded={alumnoAbierto}
                aria-autocomplete="list"
              />
              {alumnoAbierto && (
                <div className="avm-combo__list" role="listbox">
                  {alumnosFiltrados.length === 0 ? (
                    <div className="avm-combo__empty">Sin coincidencias.</div>
                  ) : (
                    alumnosFiltrados.map((a, idx) => (
                      <div
                        key={a.id_alumno}
                        role="option"
                        aria-selected={Number(idAlumno) === Number(a.id_alumno)}
                        className={`avm-combo__item ${idx === alumnoHighlight ? "avm-combo__item--active" : ""} ${Number(idAlumno) === Number(a.id_alumno) ? "avm-combo__item--selected" : ""}`}
                        onMouseDown={(e) => { e.preventDefault(); seleccionarAlumno(a); }}
                        onMouseEnter={() => setAlumnoHighlight(idx)}
                      >
                        {a.nombre_completo || `${a.nombre} ${a.apellido}`}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
          )}

          {!esReserva && categoria === "CHEQUEO" && (
            <div className="avm-field">
              <label>Licencia a chequear</label>
              <select value={idLicenciaChequeo} onChange={(e) => setIdLicenciaChequeo(e.target.value)}>
                <option value="">— Usar la licencia propia del alumno —</option>
                {licencias.map(l => (
                  <option key={l.id_licencia} value={l.id_licencia}>{l.nombre}</option>
                ))}
              </select>
              <p className="avm-hint">Filtra las aeronaves disponibles según esa licencia (no cambia la licencia real del alumno).</p>
            </div>
          )}

          {!esReserva && (
          <div className="avm-field">
            <label>{categoria === "CHEQUEO_LINEA" ? "PIC (instructor que instruye)" : "Instructor"} {(publicada || categoria === "DEMO" || categoria === "CHEQUEO_LINEA") && <span className="avm-req">*</span>}</label>
            {fixedInstructor ? (
              <input value={(instructores.find(i => Number(i.id_instructor) === Number(fixedInstructor))?.nombre_completo) || "Vos"} disabled />
            ) : (
              <select value={idInstructor} onChange={(e) => setIdInstructor(e.target.value)}>
                <option value="">— Sin asignar —</option>
                {instructores.map(i => (
                  <option key={i.id_instructor} value={i.id_instructor}>{i.nombre_completo}</option>
                ))}
              </select>
            )}
            <p className="avm-hint">{categoria === "CHEQUEO_LINEA" ? "El PIC cobra la hora; debe ser distinto del practicante." : "Podés asignar cualquier instructor (no tiene que ser el de cabecera del alumno)."}</p>
          </div>
          )}

          <div className="avm-field">
            <label>Aeronave</label>
            <select value={idAeronave} onChange={(e) => setIdAeronave(e.target.value)} className={aeronaveNoPermitida ? "avm-error" : ""}>
              <option value="">— Elegí una aeronave —</option>
              {aeronaves.filter(a => a.activa !== false).map(a => (
                <option key={a.id_aeronave} value={a.id_aeronave}>{a.codigo} — {a.modelo}</option>
              ))}
            </select>
            {aeronaveNoPermitida && (
              <p className="avm-warn"><i className="bi bi-exclamation-triangle"></i> Esa aeronave no está en {categoria === "CHEQUEO" ? "esa licencia" : "la licencia del alumno"}. Marcá "extracurricular" para permitirla.</p>
            )}
          </div>

          <div className="avm-row">
            <label className="avm-check">
              <input type="checkbox" checked={tipoVuelo === "RUTA"} onChange={(e) => setTipoVuelo(e.target.checked ? "RUTA" : "LOCAL")} />
              Vuelo de ruta (varios bloques)
            </label>
            {tipoVuelo === "RUTA" && (
              <div className="avm-field avm-field--inline">
                <label>Hasta</label>
                <select value={bloqueFin} onChange={(e) => setBloqueFin(e.target.value)} className={rutaInvalida ? "avm-error" : ""}>
                  {bloques.filter(b => Number(b.id_bloque) >= bloqueEff).map(b => (
                    <option key={b.id_bloque} value={b.id_bloque}>{String(b.hora_fin).slice(0,5)}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {!esReserva && (categoria === "NORMAL" || categoria === "CHEQUEO") && (
            <label className="avm-check">
              <input type="checkbox" checked={extra} onChange={(e) => setExtra(e.target.checked)} />
              Extracurricular (cualquier aeronave; no cuenta al límite semanal)
            </label>
          )}
        </div>

        <div className="avm-actions">
          <button className="avm-btn avm-btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="avm-btn avm-btn--primary" onClick={guardar} disabled={!puedeGuardar}>
            {saving ? "Guardando…" : esReserva ? "Reservar avión" : (publicada ? "Agendar y publicar" : "Agendar")}
          </button>
        </div>
      </div>
    </div>
  );
}
