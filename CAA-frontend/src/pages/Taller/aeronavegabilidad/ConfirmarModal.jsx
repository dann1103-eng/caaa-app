import { useState } from "react";
import { toast } from "sonner";
import { confirmarTarea } from "../../../services/tallerApi";
import { aLibro } from "./vencimientos";

/**
 * Resolver un conflicto del papel. El mismo AD figura en la lista de ADs y en la
 * de vida límite del mismo avión diciendo cosas distintas — en el 82-27-08 del
 * YS-334-PE, "cada 100 h" contra "cada 5,000 h".
 *
 * El sistema precargó la lista de ADs, que trae la fecha más nueva, pero no
 * elige en silencio: acá el jefe dicta cuál vale. La nota queda como rastro.
 *
 * Las horas se escriben en ESCALA DE LIBRO, que es lo que dice el papel; se
 * convierten al guardar.
 */
export default function ConfirmarModal({ tarea, aeronave, onClose, onSaved }) {
  const offset = Number(aeronave?.tac_offset || 0);
  const [f, setF] = useState({
    intervalo_horas: tarea.intervalo_horas ?? "",
    intervalo_dias: tarea.intervalo_dias ?? "",
    ultima_fecha: tarea.ultima_fecha ? String(tarea.ultima_fecha).slice(0, 10) : "",
    proxima_libro: aLibro(tarea.proxima_horas, offset) ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const guardar = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await confirmarTarea(tarea.id_tarea, {
        intervalo_horas: f.intervalo_horas === "" ? null : Number(f.intervalo_horas),
        intervalo_dias: f.intervalo_dias === "" ? null : Number(f.intervalo_dias),
        ultima_fecha: f.ultima_fecha || null,
        // De escala de libro a escala del sistema.
        proxima_horas: f.proxima_libro === "" ? null : Number(f.proxima_libro) - offset,
      });
      toast.success("Conflicto resuelto");
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message || "No se pudo resolver");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="adf-modal-backdrop" onClick={onClose}>
      <div className="adf-card adf-modal-card" style={{ padding: 0, maxWidth: 620 }}
        onClick={(e) => e.stopPropagation()}>
        <div className="adf-edit-head">
          <span className="adf-edit-head__title">
            <span className="adf-edit-head__chip"><i className="bi bi-exclamation-diamond"></i></span>
            Resolver conflicto del papel
          </span>
          <div>
            <button type="submit" form="formConfirmar" className="adf-btn" disabled={saving}>
              <i className="bi bi-check"></i> Guardar
            </button>
            <button type="button" className="adf-btn secondary" onClick={onClose}>Cerrar</button>
          </div>
        </div>

        <div style={{ padding: "0 var(--sp-5) var(--sp-5)" }}>
          <p style={{ fontWeight: 600, marginBottom: 4 }}>{tarea.nombre}</p>
          <div className="adf-note" style={{ marginBottom: 16 }}>{tarea.nota_confirmacion}</div>

          <form id="formConfirmar" onSubmit={guardar}>
            <div className="adf-form-grid">
              <div className="adf-form-field">
                <label>Cada cuántas horas</label>
                <input type="number" step="0.1" value={f.intervalo_horas}
                  onChange={(e) => set("intervalo_horas", e.target.value)} placeholder="Ej. 100" />
              </div>
              <div className="adf-form-field">
                <label>Cada cuántos días</label>
                <input type="number" value={f.intervalo_dias}
                  onChange={(e) => set("intervalo_dias", e.target.value)} placeholder="Ej. 365" />
              </div>
              <div className="adf-form-field">
                <label>Última aplicación</label>
                <input type="date" value={f.ultima_fecha}
                  onChange={(e) => set("ultima_fecha", e.target.value)} />
              </div>
              <div className="adf-form-field">
                <label>Próxima (TAC del libro)</label>
                <input type="number" step="0.01" value={f.proxima_libro}
                  onChange={(e) => set("proxima_libro", e.target.value)} placeholder="Ej. 10100.03" />
                {offset > 0 && (
                  <small style={{ color: "var(--c-ink-3)" }}>
                    Este avión lleva {offset.toLocaleString("es-SV")} h de diferencia entre el
                    tacómetro y el libro. Escribí el número del libro.
                  </small>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
