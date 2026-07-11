import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getAlumnosListAdmin,
  getInstructoresActivos,
  getAeronavesPermitidasAlumno,
} from "../../services/adminApi";
import {
  agendarSolicitudCalendario,
  agendarVueloDirectoCalendario,
} from "../../services/programacionApi";
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
  onClose, onCreated,
}) {
  const [alumnos, setAlumnos] = useState(alumnosScope || []);
  const [instructores, setInstructores] = useState([]);
  const [idAlumno, setIdAlumno] = useState("");
  const [idInstructor, setIdInstructor] = useState(fixedInstructor ? String(fixedInstructor) : "");
  const [busqueda, setBusqueda] = useState("");
  const [idAeronave, setIdAeronave] = useState("");
  const [tipoVuelo, setTipoVuelo] = useState("LOCAL");
  const [bloqueFin, setBloqueFin] = useState(String(id_bloque));
  const [extra, setExtra] = useState(false);
  const [permitidas, setPermitidas] = useState(null); // ids permitidas por licencia
  const [saving, setSaving] = useState(false);

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
      } catch { /* noop */ }
    })();
  }, [alumnosScope, fixedInstructor]);

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
    if (!q) return alumnos;
    return alumnos.filter(a => (a.nombre_completo || `${a.nombre} ${a.apellido}`).toLowerCase().includes(q));
  }, [alumnos, busqueda]);

  const aeronaveNoPermitida = useMemo(() => {
    if (extra || !idAeronave || permitidas === null) return false;
    return !permitidas.includes(Number(idAeronave));
  }, [extra, idAeronave, permitidas]);

  const rutaInvalida = tipoVuelo === "RUTA" && Number(bloqueFin) < Number(id_bloque);
  const puedeGuardar = idAlumno && idAeronave && (!publicada || idInstructor) && !aeronaveNoPermitida && !rutaInvalida && !saving;

  const guardar = async () => {
    if (!puedeGuardar) return;
    setSaving(true);
    const payload = {
      id_semana,
      id_alumno: Number(idAlumno),
      id_instructor: idInstructor ? Number(idInstructor) : null,
      dia_semana: Number(dia_semana),
      id_bloque: Number(id_bloque),
      id_bloque_fin: tipoVuelo === "RUTA" ? Number(bloqueFin) : Number(id_bloque),
      id_aeronave: Number(idAeronave),
      tipo_vuelo: tipoVuelo,
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

  const horaBloque = bloques.find(b => Number(b.id_bloque) === Number(id_bloque));
  const horaTxt = horaBloque ? `${String(horaBloque.hora_inicio).slice(0,5)}` : `bloque ${id_bloque}`;

  return (
    <div className="avm-overlay" onClick={onClose}>
      <div className="avm-card" onClick={(e) => e.stopPropagation()}>
        <div className="avm-head">
          <div>
            <div className="avm-eyebrow">{publicada ? "Agendar vuelo (semana publicada)" : "Agendar vuelo"}</div>
            <h3 className="avm-title">{DIAS[Number(dia_semana)]} · {horaTxt}</h3>
          </div>
          <button className="avm-close" onClick={onClose}>&times;</button>
        </div>

        <div className="avm-body">
          <div className="avm-field">
            <label>Alumno</label>
            <input
              className="avm-search"
              placeholder="Buscar alumno por nombre…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            <select value={idAlumno} onChange={(e) => setIdAlumno(e.target.value)} size={1}>
              <option value="">— Elegí un alumno —</option>
              {alumnosFiltrados.map(a => (
                <option key={a.id_alumno} value={a.id_alumno}>
                  {a.nombre_completo || `${a.nombre} ${a.apellido}`}
                </option>
              ))}
            </select>
          </div>

          <div className="avm-field">
            <label>Instructor {publicada && <span className="avm-req">*</span>}</label>
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
            <p className="avm-hint">Podés asignar cualquier instructor (no tiene que ser el de cabecera del alumno).</p>
          </div>

          <div className="avm-field">
            <label>Aeronave</label>
            <select value={idAeronave} onChange={(e) => setIdAeronave(e.target.value)} className={aeronaveNoPermitida ? "avm-error" : ""}>
              <option value="">— Elegí una aeronave —</option>
              {aeronaves.filter(a => a.activa !== false).map(a => (
                <option key={a.id_aeronave} value={a.id_aeronave}>{a.codigo} — {a.modelo}</option>
              ))}
            </select>
            {aeronaveNoPermitida && (
              <p className="avm-warn"><i className="bi bi-exclamation-triangle"></i> Esa aeronave no está en la licencia del alumno. Marcá "extracurricular" para permitirla.</p>
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
                  {bloques.filter(b => Number(b.id_bloque) >= Number(id_bloque)).map(b => (
                    <option key={b.id_bloque} value={b.id_bloque}>{String(b.hora_fin).slice(0,5)}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <label className="avm-check">
            <input type="checkbox" checked={extra} onChange={(e) => setExtra(e.target.checked)} />
            Extracurricular (cualquier aeronave; no cuenta al límite semanal)
          </label>
        </div>

        <div className="avm-actions">
          <button className="avm-btn avm-btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="avm-btn avm-btn--primary" onClick={guardar} disabled={!puedeGuardar}>
            {saving ? "Guardando…" : (publicada ? "Agendar y publicar" : "Agendar")}
          </button>
        </div>
      </div>
    </div>
  );
}
