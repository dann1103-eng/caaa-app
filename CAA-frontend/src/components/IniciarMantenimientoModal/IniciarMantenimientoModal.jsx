import { useState, useEffect } from "react";
import { toast } from "sonner";
import { iniciarMantenimiento, previewMantenimiento, getBloquesHorario } from "../../services/adminApi";
import "./IniciarMantenimientoModal.css";

export default function IniciarMantenimientoModal({ aeronave, onClose, onSuccess }) {
  const [tipo, setTipo] = useState("CORRECTIVO");
  const [descripcion, setDescripcion] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [horasEstimadas, setHorasEstimadas] = useState("");
  
  // Para preventivo con bloques
  const [bloquesHorario, setBloquesHorario] = useState([]);
  const [fechaBloques, setFechaBloques] = useState("");
  const [bloquesSeleccionados, setBloquesSeleccionados] = useState([]);

  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const today = new Date().toISOString().split('T')[0];

  const formatFecha = (iso) => {
    const d = new Date(iso + "T12:00:00Z");
    const hoy = new Date();
    const manana = new Date();
    manana.setDate(hoy.getDate() + 1);
    
    const esHoy = d.toISOString().split('T')[0] === hoy.toISOString().split('T')[0];
    const esManana = d.toISOString().split('T')[0] === manana.toISOString().split('T')[0];
    
    const dayStr = d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
    
    if (esHoy) return `Hoy (${dayStr})`;
    if (esManana) return `Mañana (${dayStr})`;
    return dayStr;
  };

  useEffect(() => {
    // Si viene de alerta (50 o 100 hr), preseleccionar
    if (aeronave.requiere_mantenimiento || aeronave.horas_restantes <= 5) {
      setTipo(aeronave.tipo_proxima_revision || "CORRECTIVO");
    }
    
    getBloquesHorario().then(setBloquesHorario).catch(console.error);
  }, [aeronave]);

  useEffect(() => {
    // Timeout para auto-preview
    const delay = setTimeout(() => {
      cargarPreview();
    }, 500);
    return () => clearTimeout(delay);
  }, [tipo, fechaInicio, fechaFin, bloquesSeleccionados]);

  const cargarPreview = async () => {
    if (tipo !== "PREVENTIVO" && tipo !== "CORRECTIVO") {
      if (!fechaInicio || !fechaFin) {
        setPreview(null);
        return;
      }
    } else {
      if (bloquesSeleccionados.length === 0) {
        setPreview(null);
        return;
      }
    }

    setLoadingPreview(true);
    try {
      const data = await previewMantenimiento(aeronave.id_aeronave, {
        tipo,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        bloques: bloquesSeleccionados
      });
      setPreview(data);
    } catch (e) {
      console.error(e);
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  const toggleBloque = (id_bloque) => {
    if (!fechaBloques) return;
    const existe = bloquesSeleccionados.find(b => b.fecha === fechaBloques && b.id_bloque === id_bloque);
    if (existe) {
      setBloquesSeleccionados(bloquesSeleccionados.filter(b => b !== existe));
    } else {
      setBloquesSeleccionados([...bloquesSeleccionados, { fecha: fechaBloques, id_bloque }]);
    }
  };

  const handleConfirmar = async () => {
    if (tipo === "CORRECTIVO" && !descripcion.trim()) {
      setError("La descripción es obligatoria para mantenimiento correctivo.");
      return;
    }
    
    setSaving(true);
    setError("");
    try {
      await iniciarMantenimiento(aeronave.id_aeronave, {
        tipo,
        descripcion,
        fecha_inicio: (tipo === "PREVENTIVO" || tipo === "CORRECTIVO") ? null : fechaInicio,
        fecha_fin: (tipo === "PREVENTIVO" || tipo === "CORRECTIVO") ? null : fechaFin,
        horas_estimadas: horasEstimadas ? parseFloat(horasEstimadas) : null,
        bloques: (tipo === "PREVENTIVO" || tipo === "CORRECTIVO") ? bloquesSeleccionados : []
      });
      toast.success("Mantenimiento iniciado");
      onSuccess();
      onClose();
    } catch (e) {
      setError(e.response?.data?.message || "Error al iniciar mantenimiento");
      setSaving(false);
    }
  };

  return (
    <div className="mnt-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mnt-modal">
        <div className="mnt-modal__header">
          <h3>Iniciar Mantenimiento — {aeronave.codigo}</h3>
          <button className="mnt-modal__close" onClick={onClose}>&times;</button>
        </div>
        
        <div className="mnt-modal__body">
          <div className="mnt-modal__row">
            <div className="mnt-modal__field">
              <label>Tipo de Mantenimiento</label>
              <select value={tipo} onChange={e => {
                setTipo(e.target.value);
                setPreview(null);
                setBloquesSeleccionados([]);
              }}>
                <option value="CORRECTIVO">Correctivo</option>
                <option value="25HR">25 Horas</option>
                <option value="50HR">50 Horas</option>
                <option value="100HR">100 Horas</option>
              </select>
            </div>
            
            <div className="mnt-modal__field">
              <label>Horas estimadas (opcional)</label>
              <input type="number" step="0.5" value={horasEstimadas} onChange={e => setHorasEstimadas(e.target.value)} />
            </div>
          </div>

          <div className="mnt-modal__field">
            <label>Descripción {(tipo === "PREVENTIVO" || tipo === "CORRECTIVO") && <span className="mnt-req">*</span>}</label>
            <input type="text" placeholder="Ej: Cambio de aceite..." value={descripcion} onChange={e => setDescripcion(e.target.value)} />
          </div>

          {(tipo === "PREVENTIVO" || tipo === "CORRECTIVO") ? (
            <div className="mnt-modal__bloques">
              <h4>Seleccionar Bloques (Opcional)</h4>
              <div className="mnt-modal__row">
                <div className="mnt-modal__field">
                  <label>Día</label>
                  <input type="date" min={today} value={fechaBloques} onChange={e => setFechaBloques(e.target.value)} />
                </div>
              </div>
              
              {fechaBloques && (
                <div className="mnt-modal__bloques-grid">
                  {bloquesHorario.map(b => {
                    const sel = bloquesSeleccionados.some(sel => sel.fecha === fechaBloques && sel.id_bloque === b.id_bloque);
                    return (
                      <label key={b.id_bloque} className={`mnt-modal__bloque-btn ${sel ? 'selected' : ''}`}>
                        <input type="checkbox" checked={sel} onChange={() => toggleBloque(b.id_bloque)} />
                        {b.hora_inicio.slice(0,5)} - {b.hora_fin.slice(0,5)}
                      </label>
                    );
                  })}
                </div>
              )}
              {bloquesSeleccionados.length > 0 && (
                <div className="mnt-modal__summary">
                  <p className="mnt-modal__helptext">
                    <strong>Total: {bloquesSeleccionados.length} bloques seleccionados</strong>
                  </p>
                  <ul className="mnt-modal__summary-list">
                    {Object.entries(
                      bloquesSeleccionados.reduce((acc, b) => {
                        acc[b.fecha] = (acc[b.fecha] || 0) + 1;
                        return acc;
                      }, {})
                    ).sort((a, b) => a[0].localeCompare(b[0])).map(([fecha, count]) => (
                      <li key={fecha}>{formatFecha(fecha)}: {count} bloques</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="mnt-modal__row">
              <div className="mnt-modal__field">
                <label>Fecha inicio</label>
                <input type="date" min={today} value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} />
              </div>
              <div className="mnt-modal__field">
                <label>Fecha fin</label>
                <input type="date" min={today} value={fechaFin} onChange={e => setFechaFin(e.target.value)} />
              </div>
            </div>
          )}

          {/* Preview Section */}
          <div className="mnt-modal__preview">
            <h4>Impacto en vuelos</h4>
            {loadingPreview ? (
              <p>Calculando vuelos afectados...</p>
            ) : preview ? (
              preview.length > 0 ? (
                <>
                  <div className="mnt-modal__alert">
                    ⚠️ Se cancelarán {preview.length} vuelo(s) automáticamente. Los alumnos serán notificados.
                  </div>
                  <ul className="mnt-modal__flight-list">
                    {preview.slice(0, 5).map(v => (
                      <li key={v.id_vuelo}>
                        {new Date(v.fecha_vuelo).toLocaleDateString()} {v.hora_inicio.slice(0,5)} - {v.alumno}
                      </li>
                    ))}
                    {preview.length > 5 && <li>...y {preview.length - 5} más</li>}
                  </ul>
                </>
              ) : (
                <p className="mnt-modal__success">✓ No hay vuelos afectados en este periodo.</p>
              )
            ) : (
              <p className="mnt-modal__helptext">Completa los datos para ver los vuelos afectados.</p>
            )}
          </div>

          {error && <p className="mnt-modal__error">{error}</p>}

        </div>
        
        <div className="mnt-modal__footer">
          <button className="mnt-modal__btn-cancel" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="mnt-modal__btn-confirm" onClick={handleConfirmar} disabled={saving}>
            {saving ? "Procesando..." : "Confirmar mantenimiento"}
          </button>
        </div>
      </div>
    </div>
  );
}
