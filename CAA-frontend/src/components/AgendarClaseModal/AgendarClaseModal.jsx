import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getDisponibilidadSalones, getRosterCurso, editarSesionClase, getAulaUnidades,
} from "../../services/administracionApi";
import "./AgendarClaseModal.css";

export default function AgendarClaseModal({
  cursos = [], bloques = [], instructores = [], instructoresPicker = false,
  crearFn, sesion = null, // si viene `sesion`, es edición (usa editarSesionClase)
  onClose, onSaved,
}) {
  const [idCurso, setIdCurso] = useState(sesion?.id_curso ? String(sesion.id_curso) : "");
  const [unidades, setUnidades] = useState([]);
  const [idUnidad, setIdUnidad] = useState(sesion?.id_unidad ? String(sesion.id_unidad) : "");
  const [fecha, setFecha] = useState(sesion?.fecha?.slice(0, 10) || new Date().toISOString().slice(0, 10));
  const [idBloque, setIdBloque] = useState(sesion?.id_bloque ? String(sesion.id_bloque) : String(bloques[0]?.id_bloque || ""));
  const [idBloqueFin, setIdBloqueFin] = useState(sesion?.id_bloque_fin ? String(sesion.id_bloque_fin) : "");
  const [idSalon, setIdSalon] = useState(sesion?.id_salon ? String(sesion.id_salon) : "");
  const [salones, setSalones] = useState([]);
  const [examen, setExamen] = useState(!!sesion?.examen);
  const [tema, setTema] = useState(sesion?.tema || "");
  const [idInstructor, setIdInstructor] = useState(sesion?.id_instructor ? String(sesion.id_instructor) : "");
  const [roster, setRoster] = useState([]);
  const [alumnosSel, setAlumnosSel] = useState([]);
  const [filtroAlumno, setFiltroAlumno] = useState("");
  const [saving, setSaving] = useState(false);

  // Unidades del curso elegido — reusa el endpoint ya existente de Aula Virtual
  // (GET /administracion/aula/unidades?id_curso=), no hace falta uno nuevo.
  useEffect(() => {
    if (!idCurso) { setUnidades([]); return; }
    getAulaUnidades({ id_curso: idCurso })
      .then((r) => setUnidades(r?.data || []))
      .catch(() => setUnidades([]));
  }, [idCurso]);

  useEffect(() => {
    if (!idCurso) { setRoster([]); return; }
    getRosterCurso(idCurso).then((r) => setRoster(r?.data || [])).catch(() => setRoster([]));
  }, [idCurso]);

  useEffect(() => {
    if (!fecha || !idBloque) { setSalones([]); return; }
    getDisponibilidadSalones(fecha, idBloque, idBloqueFin || idBloque)
      .then((r) => setSalones(r?.data || []))
      .catch(() => setSalones([]));
  }, [fecha, idBloque, idBloqueFin]);

  const rosterFiltrado = useMemo(
    () => roster.filter((a) => a.nombre.toLowerCase().includes(filtroAlumno.toLowerCase())),
    [roster, filtroAlumno]
  );

  const toggleAlumno = (id_alumno) => {
    setAlumnosSel((prev) =>
      prev.includes(id_alumno) ? prev.filter((x) => x !== id_alumno) : [...prev, id_alumno]
    );
  };

  const puedeGuardar = idCurso && fecha && idBloque && idSalon && alumnosSel.length > 0 &&
    (instructoresPicker ? idInstructor : true);

  const handleGuardar = async () => {
    setSaving(true);
    const payload = {
      id_curso: Number(idCurso), id_unidad: idUnidad ? Number(idUnidad) : null,
      fecha, id_bloque: Number(idBloque), id_bloque_fin: idBloqueFin ? Number(idBloqueFin) : null,
      id_salon: Number(idSalon), examen, tema: tema || null,
      alumnos: alumnosSel,
      ...(instructoresPicker ? { id_instructor: Number(idInstructor) } : {}),
    };
    try {
      if (sesion) await editarSesionClase(sesion.id, payload);
      else await crearFn(payload);
      toast.success(sesion ? "Clase actualizada" : "Clase agendada");
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.message || "Error al guardar la clase");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="acm-overlay" onClick={onClose}>
      <div className="acm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="acm-header">
          <h3>{sesion ? "Editar clase" : "Agendar clase"}</h3>
          <button className="acm-close" onClick={onClose}>×</button>
        </div>

        {instructoresPicker && (
          <label className="acm-field">
            <span>Instructor</span>
            <select value={idInstructor} onChange={(e) => setIdInstructor(e.target.value)}>
              <option value="">Elegir…</option>
              {instructores.map((i) => (
                <option key={i.id_instructor} value={i.id_instructor}>{i.nombre}</option>
              ))}
            </select>
          </label>
        )}

        <label className="acm-field">
          <span>Curso</span>
          <select value={idCurso} onChange={(e) => { setIdCurso(e.target.value); setIdUnidad(""); setAlumnosSel([]); }}>
            <option value="">Elegir…</option>
            {cursos.map((c) => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
          </select>
        </label>

        <label className="acm-field">
          <span>Unidad (opcional)</span>
          <select value={idUnidad} onChange={(e) => setIdUnidad(e.target.value)} disabled={!idCurso}>
            <option value="">Sin unidad específica</option>
            {unidades.map((u) => <option key={u.id} value={u.id}>U{u.numero} — {u.nombre}</option>)}
          </select>
        </label>

        <div className="acm-row">
          <label className="acm-field">
            <span>Fecha</span>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>
          <label className="acm-field">
            <span>Bloque inicio</span>
            <select value={idBloque} onChange={(e) => setIdBloque(e.target.value)}>
              {bloques.map((b) => <option key={b.id_bloque} value={b.id_bloque}>{b.hora_inicio?.slice(0,5)}</option>)}
            </select>
          </label>
          <label className="acm-field">
            <span>Bloque fin (si dura más de uno)</span>
            <select value={idBloqueFin} onChange={(e) => setIdBloqueFin(e.target.value)}>
              <option value="">Igual al inicio</option>
              {bloques.filter((b) => Number(b.id_bloque) >= Number(idBloque)).map((b) => (
                <option key={b.id_bloque} value={b.id_bloque}>{b.hora_fin?.slice(0,5)}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="acm-field">
          <span>Salón</span>
          <select value={idSalon} onChange={(e) => setIdSalon(e.target.value)}>
            <option value="">Elegir…</option>
            {salones.map((s) => (
              <option key={s.id} value={s.id} disabled={!s.libre}>
                {s.nombre}{!s.libre ? ` — ocupado (${s.motivo})` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="acm-checkbox">
          <input type="checkbox" checked={examen} onChange={(e) => setExamen(e.target.checked)} />
          <span>Habrá examen en esta clase</span>
        </label>

        <label className="acm-field">
          <span>Tema (opcional)</span>
          <input type="text" value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Ej. Meteorología — capítulo 4" />
        </label>

        <div className="acm-field">
          <span>Alumnos ({alumnosSel.length} elegidos)</span>
          <input
            type="text" placeholder="Buscar alumno…" value={filtroAlumno}
            onChange={(e) => setFiltroAlumno(e.target.value)} className="acm-buscador"
          />
          <div className="acm-roster">
            {rosterFiltrado.length === 0 && <p className="acm-empty">Sin alumnos inscritos en este curso.</p>}
            {rosterFiltrado.map((a) => (
              <label key={a.id_alumno} className="acm-checkbox">
                <input
                  type="checkbox" checked={alumnosSel.includes(a.id_alumno)}
                  onChange={() => toggleAlumno(a.id_alumno)}
                />
                <span>{a.nombre}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="acm-footer">
          <button className="acm-btn-secundario" onClick={onClose}>Cancelar</button>
          <button className="acm-btn-primario" onClick={handleGuardar} disabled={!puedeGuardar || saving}>
            {saving ? "Guardando…" : sesion ? "Guardar cambios" : "Agendar"}
          </button>
        </div>
      </div>
    </div>
  );
}
