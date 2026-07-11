import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getStandbyCandidatos, getStandbyLista, setStandbyLista } from "../../services/adminApi";
import "./StandbyModal.css";

const DIAS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/**
 * Gestor de lista de espera (stand-by) de un horario (día + bloque). Turno arma y
 * ordena la lista de candidatos. Si el vuelo asignado se cancela con margen, el
 * sistema ofrece el cupo automáticamente respetando este orden.
 *
 * Props: { slot: {id_semana, dia_semana, id_bloque, hora}, onClose }
 */
export default function StandbyModal({ slot, onClose }) {
  const [candidatos, setCandidatos] = useState([]); // alumnos que pidieron el horario
  const [lista, setLista] = useState([]);           // [{id_alumno, alumno_nombre, id_instructor, id_aeronave}]
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [c, l] = await Promise.all([
          getStandbyCandidatos(slot.id_semana, slot.dia_semana, slot.id_bloque),
          getStandbyLista(slot.id_semana, slot.dia_semana, slot.id_bloque),
        ]);
        setCandidatos(Array.isArray(c) ? c : []);
        setLista((Array.isArray(l) ? l : []).map((x) => ({
          id_alumno: x.id_alumno, alumno_nombre: x.alumno_nombre,
          id_instructor: x.id_instructor, id_aeronave: x.id_aeronave, estado: x.estado,
        })));
      } catch { toast.error("No se pudo cargar la lista de espera"); }
      finally { setLoading(false); }
    })();
  }, [slot.id_semana, slot.dia_semana, slot.id_bloque]);

  const enLista = (id) => lista.some((x) => Number(x.id_alumno) === Number(id));
  const agregar = (c) => { if (!enLista(c.id_alumno)) setLista((l) => [...l, { id_alumno: c.id_alumno, alumno_nombre: c.alumno_nombre, id_instructor: c.id_instructor, id_aeronave: c.id_aeronave }]); };
  const quitar = (id) => setLista((l) => l.filter((x) => Number(x.id_alumno) !== Number(id)));
  const mover = (i, dir) => setLista((l) => {
    const j = i + dir; if (j < 0 || j >= l.length) return l;
    const c = [...l]; [c[i], c[j]] = [c[j], c[i]]; return c;
  });

  const guardar = async () => {
    setSaving(true);
    try {
      await setStandbyLista({
        id_semana: slot.id_semana, dia_semana: slot.dia_semana, id_bloque: slot.id_bloque,
        candidatos: lista.map((x) => ({ id_alumno: x.id_alumno, id_instructor: x.id_instructor, id_aeronave: x.id_aeronave })),
      });
      toast.success("Lista de espera guardada");
      onClose?.();
    } catch (e) { toast.error(e?.response?.data?.message || "No se pudo guardar"); }
    finally { setSaving(false); }
  };

  const disponibles = candidatos.filter((c) => !enLista(c.id_alumno));

  return (
    <div className="sbm-overlay" onClick={onClose}>
      <div className="sbm-card" onClick={(e) => e.stopPropagation()}>
        <div className="sbm-head">
          <div>
            <div className="sbm-eyebrow">Lista de espera (stand-by)</div>
            <h3 className="sbm-title">{DIAS[slot.dia_semana]} · {slot.hora || `bloque ${slot.id_bloque}`}</h3>
          </div>
          <button className="sbm-close" onClick={onClose}>&times;</button>
        </div>

        <div className="sbm-body">
          <p className="sbm-hint">Ordená los candidatos. Si el vuelo asignado se cancela con margen (≥6h y no por cierre de operaciones), el cupo se ofrece automáticamente en este orden.</p>

          {loading ? <p>Cargando…</p> : (
            <div className="sbm-cols">
              <div className="sbm-col">
                <div className="sbm-col-title">En espera (orden)</div>
                {lista.length === 0 && <p className="sbm-empty">Sin candidatos en espera.</p>}
                {lista.map((x, i) => (
                  <div key={x.id_alumno} className="sbm-row">
                    <span className="sbm-orden">{i + 1}</span>
                    <span className="sbm-name">{x.alumno_nombre}{x.estado && x.estado !== "EN_ESPERA" ? ` (${x.estado})` : ""}</span>
                    <span className="sbm-actions">
                      <button onClick={() => mover(i, -1)} disabled={i === 0} title="Subir"><i className="bi bi-arrow-up"></i></button>
                      <button onClick={() => mover(i, 1)} disabled={i === lista.length - 1} title="Bajar"><i className="bi bi-arrow-down"></i></button>
                      <button onClick={() => quitar(x.id_alumno)} title="Quitar"><i className="bi bi-x-lg"></i></button>
                    </span>
                  </div>
                ))}
              </div>

              <div className="sbm-col">
                <div className="sbm-col-title">Pidieron este horario</div>
                {disponibles.length === 0 && <p className="sbm-empty">No hay más candidatos.</p>}
                {disponibles.map((c) => (
                  <div key={c.id_alumno} className="sbm-row">
                    <span className="sbm-name">{c.alumno_nombre}</span>
                    <button className="sbm-add" onClick={() => agregar(c)}><i className="bi bi-plus-lg"></i> Agregar</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="sbm-foot">
          <button className="sbm-btn sbm-btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="sbm-btn sbm-btn--primary" onClick={guardar} disabled={saving || loading}>
            {saving ? "Guardando…" : "Guardar lista"}
          </button>
        </div>
      </div>
    </div>
  );
}
