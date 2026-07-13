import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getAlumnosListAdmin,
  getInstructoresActivos,
  getAeronavesActivasAdmin,
} from "../../services/adminApi";
import { editarTripulacionVuelo } from "../../services/turnoApi";
import "../AgendarVueloModal/AgendarVueloModal.css";

/**
 * Modal de Turno para reasignar alumno/instructor/aeronave de un vuelo ya
 * agendado (día en curso), y anotar "almas a bordo" para vuelos demo con
 * pasajeros que no están en el sistema. Pensado para cuando no hay nadie de
 * programación disponible en el momento para hacer el cambio.
 *
 * Props: vuelo (id_vuelo, id_alumno, id_instructor, id_aeronave,
 * alumno_nombre/apellido, instructor_nombre/apellido, aeronave_codigo,
 * almas_a_bordo, pasajeros_extra), onClose, onSaved.
 */
export default function EditarTripulacionModal({ vuelo, onClose, onSaved }) {
  const [alumnos, setAlumnos] = useState([]);
  const [instructores, setInstructores] = useState([]);
  const [aeronaves, setAeronaves] = useState([]);
  const [cargandoCatalogos, setCargandoCatalogos] = useState(true);

  const [idAlumno, setIdAlumno] = useState(String(vuelo.id_alumno));
  const [busqueda, setBusqueda] = useState(`${vuelo.alumno_nombre || ""} ${vuelo.alumno_apellido || ""}`.trim());
  const [alumnoAbierto, setAlumnoAbierto] = useState(false);
  const [alumnoHighlight, setAlumnoHighlight] = useState(0);
  const alumnoBoxRef = useRef(null);

  const [idInstructor, setIdInstructor] = useState(String(vuelo.id_instructor));
  const [idAeronave, setIdAeronave] = useState(String(vuelo.id_aeronave));
  const [almasABordo, setAlmasABordo] = useState(vuelo.almas_a_bordo ?? "");
  const [pasajerosExtra, setPasajerosExtra] = useState(vuelo.pasajeros_extra || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [al, ins, aero] = await Promise.all([
          getAlumnosListAdmin(),
          getInstructoresActivos(),
          getAeronavesActivasAdmin(),
        ]);
        setAlumnos(Array.isArray(al) ? al : []);
        setInstructores(Array.isArray(ins) ? ins : []);
        setAeronaves(Array.isArray(aero) ? aero : []);
      } catch {
        toast.error("No se pudieron cargar los catálogos");
      } finally {
        setCargandoCatalogos(false);
      }
    })();
  }, []);

  const alumnosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const base = !q ? alumnos : alumnos.filter((a) => (a.nombre_completo || `${a.nombre} ${a.apellido}`).toLowerCase().includes(q));
    return base.slice(0, 50);
  }, [alumnos, busqueda]);

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
    if (e.key === "ArrowDown") { e.preventDefault(); setAlumnoHighlight((h) => Math.min(h + 1, alumnosFiltrados.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAlumnoHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const a = alumnosFiltrados[alumnoHighlight]; if (a) seleccionarAlumno(a); }
    else if (e.key === "Escape") { setAlumnoAbierto(false); }
  };

  const almasInvalidas = almasABordo !== "" && (isNaN(Number(almasABordo)) || Number(almasABordo) < 0 || Number(almasABordo) > 10);
  const puedeGuardar = idAlumno && idInstructor && idAeronave && !almasInvalidas && !saving;

  const guardar = async () => {
    if (!puedeGuardar) return;
    setSaving(true);
    try {
      await editarTripulacionVuelo(vuelo.id_vuelo, {
        id_alumno: Number(idAlumno),
        id_instructor: Number(idInstructor),
        id_aeronave: Number(idAeronave),
        almas_a_bordo: almasABordo === "" ? null : Number(almasABordo),
        pasajeros_extra: pasajerosExtra.trim() || null,
      });
      toast.success("Tripulación actualizada");
      onSaved?.();
      onClose?.();
    } catch (e) {
      toast.error(e?.response?.data?.message || "No se pudo actualizar la tripulación");
      setSaving(false);
    }
  };

  return (
    <div className="avm-overlay" onClick={onClose}>
      <div className="avm-card" onClick={(e) => e.stopPropagation()}>
        <div className="avm-head">
          <div>
            <div className="avm-eyebrow">Editar tripulación</div>
            <h3 className="avm-title">Vuelo {vuelo.aeronave_codigo}</h3>
          </div>
          <button className="avm-close" onClick={onClose}>&times;</button>
        </div>

        <div className="avm-body">
          {cargandoCatalogos ? (
            <p className="avm-hint">Cargando catálogos…</p>
          ) : (
            <>
              <div className="avm-field" ref={alumnoBoxRef}>
                <label>Alumno</label>
                <div className="avm-combo">
                  <input
                    className="avm-search"
                    placeholder="Buscar alumno por nombre…"
                    value={busqueda}
                    onFocus={() => setAlumnoAbierto(true)}
                    onChange={(e) => { setBusqueda(e.target.value); setIdAlumno(""); setAlumnoAbierto(true); }}
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

              <div className="avm-field">
                <label>Instructor</label>
                <select value={idInstructor} onChange={(e) => setIdInstructor(e.target.value)}>
                  <option value="">— Elegí un instructor —</option>
                  {instructores.map((i) => (
                    <option key={i.id_instructor} value={i.id_instructor}>{i.nombre_completo}</option>
                  ))}
                </select>
              </div>

              <div className="avm-field">
                <label>Aeronave</label>
                <select value={idAeronave} onChange={(e) => setIdAeronave(e.target.value)}>
                  <option value="">— Elegí una aeronave —</option>
                  {aeronaves.filter((a) => a.activa !== false).map((a) => (
                    <option key={a.id_aeronave} value={a.id_aeronave}>{a.codigo} — {a.modelo}</option>
                  ))}
                </select>
              </div>

              <div className="avm-row">
                <div className="avm-field avm-field--inline">
                  <label>Almas a bordo (opcional)</label>
                  <input
                    type="number" min="0" max="10"
                    value={almasABordo}
                    onChange={(e) => setAlmasABordo(e.target.value)}
                    className={almasInvalidas ? "avm-error" : ""}
                    placeholder="Ej.: 3"
                  />
                </div>
              </div>
              <p className="avm-hint">Útil en vuelos demo: total de personas a bordo, incluyendo alumno e instructor.</p>

              <div className="avm-field">
                <label>Pasajeros adicionales / notas (opcional)</label>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={pasajerosExtra}
                  onChange={(e) => setPasajerosExtra(e.target.value)}
                  placeholder="Nombres o detalle de quiénes suben además del alumno/instructor…"
                />
              </div>
            </>
          )}
        </div>

        <div className="avm-actions">
          <button className="avm-btn avm-btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="avm-btn avm-btn--primary" onClick={guardar} disabled={!puedeGuardar}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
