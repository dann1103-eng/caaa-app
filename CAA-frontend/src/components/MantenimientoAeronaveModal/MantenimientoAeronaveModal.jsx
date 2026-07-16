import { useState, useEffect } from "react";
import { toast } from "sonner";
import { getBloquesHorario } from "../../services/adminApi";
import { previewMantenimientoAeronave, iniciarMantenimientoAeronave } from "../../services/turnoApi";
import "../SuspenderOperacionesModal/SuspenderOperacionesModal.css";
import "./MantenimientoAeronaveModal.css";

// Mantenimiento imprevisto: en la inspección pre-vuelo se detecta una falla y
// la aeronave debe salir de servicio. Misma mecánica que "Suspender
// operaciones" pero acotada a UNA aeronave: se eligen los bloques de hoy a
// cerrar (según lo que reporte taller) y opcionalmente una fecha estimada de
// reintegro; los vuelos afectados se cancelan y sus tripulaciones se notifican.
export default function MantenimientoAeronaveModal({ aeronaves = [], onClose, onConfirm }) {
  const operativas = aeronaves.filter((a) => !a.id_mantenimiento);
  const [idAeronave, setIdAeronave] = useState(operativas[0]?.id_aeronave ?? "");
  const [descripcion, setDescripcion] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [bloques, setBloques] = useState([]);
  const [bloquesSeleccionados, setBloquesSeleccionados] = useState([]);
  const [vuelosAfectados, setVuelosAfectados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const hoyISO = new Date().toLocaleDateString("sv-SE", { timeZone: "America/El_Salvador" });

  useEffect(() => {
    getBloquesHorario()
      .then((data) => setBloques(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Vista previa de vuelos afectados (del servidor: incluye días futuros si
  // hay fecha estimada, no solo los vuelos de hoy).
  useEffect(() => {
    if (!idAeronave) { setVuelosAfectados([]); return; }
    let cancelado = false;
    previewMantenimientoAeronave(idAeronave, { bloques: bloquesSeleccionados, fecha_fin: fechaFin || null })
      .then((rows) => { if (!cancelado) setVuelosAfectados(rows); })
      .catch(() => { if (!cancelado) setVuelosAfectados([]); });
    return () => { cancelado = true; };
  }, [idAeronave, bloquesSeleccionados, fechaFin]);

  const toggleBloque = (id) => {
    setBloquesSeleccionados((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]
    );
  };

  const handleConfirm = async () => {
    if (!idAeronave) { toast.warning("Elegí la aeronave."); return; }
    if (!descripcion.trim()) { toast.warning("Describí la falla o el reporte de taller."); return; }
    if (bloquesSeleccionados.length === 0 && !fechaFin) {
      toast.warning("Seleccioná al menos un bloque de hoy a cerrar (o una fecha estimada de reintegro).");
      return;
    }
    setSaving(true);
    try {
      const r = await iniciarMantenimientoAeronave(idAeronave, {
        descripcion: descripcion.trim(),
        bloques: bloquesSeleccionados,
        fecha_fin: fechaFin || null,
      });
      toast.success(`Aeronave en mantenimiento. ${r.vuelos_cancelados} vuelo(s) cancelado(s) y tripulaciones notificadas.`);
      onConfirm?.();
    } catch (e) {
      toast.error(e?.response?.data?.message || "No se pudo registrar el mantenimiento.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  const aeroSel = operativas.find((a) => String(a.id_aeronave) === String(idAeronave));

  return (
    <div className="ops-modal-overlay">
      <div className="ops-modal">
        <div className="ops-modal__header">
          <h3><i className="bi bi-tools" style={{ marginRight: 8 }} />Aeronave a mantenimiento</h3>
          <button className="ops-modal__close" onClick={onClose}>&times;</button>
        </div>
        <div className="ops-modal__body">
          <div className="ops-modal__field">
            <label>Aeronave</label>
            <select value={idAeronave} onChange={(e) => setIdAeronave(e.target.value)}>
              {operativas.length === 0 && <option value="">No hay aeronaves operativas</option>}
              {operativas.map((a) => (
                <option key={a.id_aeronave} value={a.id_aeronave}>
                  {a.codigo} · {a.modelo}
                </option>
              ))}
            </select>
          </div>

          <div className="ops-modal__field">
            <label>Falla / reporte de taller</label>
            <textarea
              className="mant-modal__textarea"
              placeholder="Ej. Fuga de aceite detectada en inspección pre-vuelo…"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={3}
            />
          </div>

          <div className="ops-modal__bloques">
            <label>Bloques de HOY a cerrar para {aeroSel?.codigo || "la aeronave"}</label>
            <div className="ops-modal__grid">
              {bloques.map((b) => {
                const isSel = bloquesSeleccionados.includes(b.id_bloque);
                return (
                  <label key={b.id_bloque} className={`ops-modal__bloque ${isSel ? "selected" : ""}`}>
                    <input type="checkbox" checked={isSel} onChange={() => toggleBloque(b.id_bloque)} />
                    {b.hora_inicio.slice(0, 5)} - {b.hora_fin.slice(0, 5)}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="ops-modal__field">
            <label>Fecha estimada de reintegro (opcional)</label>
            <input
              type="date"
              className="mant-modal__date"
              min={hoyISO}
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
            />
            <span className="mant-modal__field-hint">
              Si taller estima varios días, también se cancelan los vuelos de esos días completos.
              Si se deja vacío, la aeronave queda fuera de servicio hasta que la marqués operativa.
            </span>
          </div>

          <div className="ops-modal__vuelos-afectados">
            <label>Vuelos que se cancelarán ({vuelosAfectados.length})</label>
            <div className="ops-modal__vuelos-list">
              {vuelosAfectados.length > 0 ? (
                vuelosAfectados.map((v) => (
                  <div key={v.id_vuelo} className="ops-modal__vuelo-item">
                    <span className="v-aero">{new Date(v.fecha_vuelo).toLocaleDateString("es-SV", { timeZone: "UTC", day: "2-digit", month: "2-digit" })}</span>
                    <span className="v-alum">{v.alumno} · Inst. {v.instructor}</span>
                    <span className="v-hora">{v.hora_inicio?.slice(0, 5)}</span>
                  </div>
                ))
              ) : (
                <p className="ops-modal__no-vuelos">Ningún vuelo programado cae en el cierre seleccionado.</p>
              )}
            </div>
          </div>

          <p className="ops-modal__hint">
            La aeronave pasa a estado MANTENIMIENTO, se cancelan sus vuelos afectados y se
            notifica a cada tripulación (alumno e instructor). Se publica además un aviso en el ticker.
          </p>
        </div>
        <div className="ops-modal__footer">
          <button className="ops-modal__btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="ops-modal__btn-confirm" disabled={saving || !idAeronave} onClick={handleConfirm}>
            {saving ? "Procesando…" : "Confirmar mantenimiento"}
          </button>
        </div>
      </div>
    </div>
  );
}
