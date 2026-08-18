import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { previewEstimado, guardarEstimado } from "../../../services/tallerApi";
import { fecha } from "../inventario/formato";

/**
 * "¿Cuándo lo tenés listo?" — el estimado de finalización del Taller.
 *
 * El caso real: se destapa el avión, aparece más trabajo, y lo que Operaciones
 * calculó en dos días se vuelve una semana. La fecha del Taller manda.
 *
 * Por eso el dry-run no es opcional: mover la fecha puede cancelarle el vuelo a
 * diez alumnos, y eso se ve ANTES de confirmar, no después.
 */
export default function EstimadoModal({ item, onClose, onGuardado }) {
  const [f, setF] = useState({
    fecha_fin: item.fecha_fin ? String(item.fecha_fin).slice(0, 10) : "",
    hora_listo: "",
    motivo: "",
  });
  const [prev, setPrev] = useState(null);
  const [cargandoPrev, setCargandoPrev] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const mirar = useCallback(async (valor) => {
    if (!valor) { setPrev(null); return; }
    setCargandoPrev(true);
    try {
      setPrev(await previewEstimado(item.id_mantenimiento, valor));
    } catch {
      setPrev(null);
    } finally {
      setCargandoPrev(false);
    }
  }, [item.id_mantenimiento]);

  useEffect(() => {
    const t = setTimeout(() => mirar(f.fecha_fin), 350);
    return () => clearTimeout(t);
  }, [f.fecha_fin, mirar]);

  const guardar = async () => {
    if (!f.fecha_fin) return toast.error("Elegí hasta cuándo estimás tenerlo");
    if (!f.motivo.trim()) return toast.error("Escribí por qué cambia la fecha");
    setGuardando(true);
    try {
      const r = await guardarEstimado(item.id_mantenimiento, {
        fecha_fin: f.fecha_fin, hora_listo: f.hora_listo || null, motivo: f.motivo,
      });
      toast.success(
        `${r.aeronave_codigo}: listo estimado el ${r.fecha_fin}.`
        + (r.cancelados ? ` Se cancelaron ${r.cancelados} vuelo(s).` : "")
        + (r.restaurados ? ` Se recuperaron ${r.restaurados} vuelo(s).` : "")
      );
      onGuardado();
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudo guardar el estimado");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="adf-modal-backdrop" onClick={onClose}>
      <div className="adf-card adf-modal-card" style={{ padding: 0, maxWidth: 660 }} onClick={(e) => e.stopPropagation()}>
        <div className="adf-edit-head">
          <span className="adf-edit-head__title">
            <span className="adf-edit-head__chip"><i className="bi bi-calendar-event"></i></span>
            ¿Cuándo tenés listo el {item.aeronave_codigo}?
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="adf-btn" disabled={guardando} onClick={guardar}><i className="bi bi-check"></i>Guardar</button>
            <button type="button" className="adf-btn secondary" onClick={onClose}>Cerrar</button>
          </div>
        </div>

        <div style={{ padding: "0 var(--sp-5) var(--sp-5)" }}>
          <p style={{ fontSize: "0.9rem", color: "var(--c-ink-3)" }}>
            Entró el <strong>{fecha(item.fecha_inicio)}</strong>.
            {item.fecha_fin_original
              ? <> Operaciones lo había calculado hasta el <strong>{fecha(item.fecha_fin_original)}</strong>, y el Taller ya lo movió al <strong>{fecha(item.fecha_fin)}</strong>.</>
              : <> Operaciones lo calculó hasta el <strong>{fecha(item.fecha_fin)}</strong>.</>}
          </p>

          <div className="adf-form-grid">
            <div className="adf-form-field">
              <label>Lo tengo listo el</label>
              <input type="date" value={f.fecha_fin} onChange={(e) => set("fecha_fin", e.target.value)} />
            </div>
            <div className="adf-form-field">
              <label>A la hora (opcional)</label>
              <input type="time" value={f.hora_listo} onChange={(e) => set("hora_listo", e.target.value)} />
              <small style={{ color: "var(--c-ink-4)" }}>Si la ponés, ese día queda libre desde esa hora.</small>
            </div>
          </div>

          <div className="adf-form-field" style={{ marginTop: 12 }}>
            <label>¿Por qué cambia?</label>
            <textarea rows={2} value={f.motivo} onChange={(e) => set("motivo", e.target.value)}
              placeholder="Se encontró corrosión en el tren de aterrizaje; hay que esperar el repuesto." />
            <small style={{ color: "var(--c-ink-4)" }}>Es lo que le van a preguntar a Operaciones.</small>
          </div>

          {cargandoPrev && <p style={{ fontSize: "0.85rem", color: "var(--c-ink-3)" }}>Mirando qué vuelos toca…</p>}

          {prev && !cargandoPrev && (
            <div className={prev.cancelaria.length ? "inv-faltantes" : "adf-note"} style={{ marginTop: 12 }}>
              {prev.cancelaria.length > 0 ? (
                <>
                  <h4><i className="bi bi-exclamation-triangle"></i> Se van a cancelar {prev.cancelaria.length} vuelo(s)</h4>
                  <ul>
                    {prev.cancelaria.slice(0, 8).map((v) => (
                      <li key={v.id_vuelo}>
                        {fecha(v.fecha_vuelo)} {String(v.hora_inicio).slice(0, 5)} — {v.alumno || "sin alumno"}
                        {v.instructor ? ` con ${v.instructor}` : ""}
                      </li>
                    ))}
                    {prev.cancelaria.length > 8 && <li>…y {prev.cancelaria.length - 8} más.</li>}
                  </ul>
                </>
              ) : (
                <>Con esa fecha <strong>no se cancela ningún vuelo</strong>.</>
              )}
              {prev.restauraria.length > 0 && (
                <p style={{ marginTop: 8, marginBottom: 0 }}>
                  Y se recuperan <strong>{prev.restauraria.length}</strong> vuelo(s) que se habían cancelado por este mantenimiento.
                </p>
              )}
            </div>
          )}

          <p className="adf-note" style={{ marginTop: 12 }}>
            La fecha del Taller <strong>manda</strong> sobre la que puso Operaciones, y a ellos les
            llega el aviso con el motivo. Esto no devuelve el avión al servicio: eso lo hacen ellos
            cuando el trabajo esté aprobado.
          </p>
        </div>
      </div>
    </div>
  );
}
