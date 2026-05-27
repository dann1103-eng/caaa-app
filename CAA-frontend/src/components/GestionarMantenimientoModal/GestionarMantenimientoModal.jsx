import { useState, useEffect } from "react";
import { toast } from "sonner";
import { 
  getMantenimientoDetalle, 
  agregarBloquesMantenimientoAeronave, 
  getBloquesHorario,
  previewMantenimiento 
} from "../../services/adminApi";
import "./GestionarMantenimientoModal.css";

export default function GestionarMantenimientoModal({ maintenance, onClose, onSuccess }) {
  const [loading, setLoading] = useState(true);
  const [detalle, setDetalle] = useState(null);
  const [bloquesHorario, setBloquesHorario] = useState([]);
  
  const [fechaBloques, setFechaBloques] = useState("");
  const [bloquesOriginales, setBloquesOriginales] = useState([]); // {fecha, id_bloque}
  const [bloquesNuevos, setBloquesNuevos] = useState([]); // {fecha, id_bloque}
  
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [allowedDates, setAllowedDates] = useState([]);
  const today = new Date().toISOString().split('T')[0];

  const formatFecha = (iso) => {
    const d = new Date(iso + "T12:00:00Z");
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const [d, bh] = await Promise.all([
          getMantenimientoDetalle(maintenance.id_mantenimiento),
          getBloquesHorario()
        ]);
        setDetalle(d);
        setBloquesHorario(bh);
        
        const orig = d.bloques.map(b => ({
          fecha: b.fecha.split('T')[0],
          id_bloque: b.id_bloque
        }));
        setBloquesOriginales(orig);

        if (orig.length > 0) {
          const sortedDates = [...new Set(orig.map(b => b.fecha))].sort();
          const lastDate = new Date(sortedDates[sortedDates.length - 1] + "T12:00:00Z");
          const nextDate = new Date(lastDate);
          nextDate.setDate(lastDate.getDate() + 1);

          const lastDateStr = lastDate.toISOString().split('T')[0];
          const nextDateStr = nextDate.toISOString().split('T')[0];
          
          setAllowedDates([lastDateStr, nextDateStr]);
          setFechaBloques(lastDateStr);
        } else {
          setAllowedDates([today]);
          setFechaBloques(today);
        }
      } catch (e) {
        toast.error("Error al cargar detalles");
        onClose();
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [maintenance.id_mantenimiento]);

  useEffect(() => {
    if (bloquesNuevos.length === 0) {
      setPreview(null);
      return;
    }
    const delay = setTimeout(cargarPreview, 500);
    return () => clearTimeout(delay);
  }, [bloquesNuevos]);

  const cargarPreview = async () => {
    setLoadingPreview(true);
    try {
      // Usamos el endpoint de preview normal, pero solo con los nuevos bloques
      const data = await previewMantenimiento(maintenance.id_aeronave, {
        tipo: "PREVENTIVO",
        bloques: bloquesNuevos
      });
      setPreview(data);
    } catch (e) {
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  };

  const toggleBloque = (id_bloque) => {
    if (!fechaBloques) return;
    
    // Si es original, no se puede quitar
    const esOriginal = bloquesOriginales.some(b => b.fecha === fechaBloques && b.id_bloque === id_bloque);
    if (esOriginal) return;

    const existeNuevo = bloquesNuevos.find(b => b.fecha === fechaBloques && b.id_bloque === id_bloque);
    if (existeNuevo) {
      setBloquesNuevos(bloquesNuevos.filter(b => b !== existeNuevo));
    } else {
      setBloquesNuevos([...bloquesNuevos, { fecha: fechaBloques, id_bloque }]);
    }
  };

  const handleGuardar = async () => {
    if (bloquesNuevos.length === 0) {
      toast.info("No hay bloques nuevos para agregar");
      return;
    }
    
    setSaving(true);
    setError("");
    try {
      await agregarBloquesMantenimientoAeronave(maintenance.id_aeronave, maintenance.id_mantenimiento, bloquesNuevos);
      toast.success("Mantenimiento actualizado correctamente");
      onSuccess();
      onClose();
    } catch (e) {
      setError(e.response?.data?.message || "Error al actualizar");
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className="mnt-gest-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mnt-gest-modal">
        <div className="mnt-gest-modal__header">
          <h3>Gestionar Mantenimiento — {maintenance.aeronave_codigo}</h3>
          <button className="mnt-gest-modal__close" onClick={onClose}>&times;</button>
        </div>
        
        <div className="mnt-gest-modal__body">
          <div className="mnt-gest-modal__info">
            <p><strong>Tipo:</strong> {detalle.tipo}</p>
            <p><strong>Estado:</strong> {detalle.estado}</p>
            {detalle.descripcion && <p><strong>Descripción:</strong> {detalle.descripcion}</p>}
          </div>

          <div className="mnt-gest-modal__bloques">
            <h4>Agregar más bloques de tiempo</h4>
            <p className="mnt-gest-modal__help">Seleccioná días y bloques adicionales en los que la aeronave seguirá en mantenimiento.</p>
            
            <div className="mnt-gest-modal__field">
              <label>Día (Último día o Siguiente)</label>
              <select value={fechaBloques} onChange={e => setFechaBloques(e.target.value)}>
                {allowedDates.map(d => (
                  <option key={d} value={d}>{formatFecha(d)}</option>
                ))}
              </select>
            </div>
            
            {fechaBloques && (
              <div className="mnt-gest-modal__bloques-grid">
                {bloquesHorario.map(b => {
                  const isOriginal = bloquesOriginales.some(sel => sel.fecha === fechaBloques && sel.id_bloque === b.id_bloque);
                  const isNuevo = bloquesNuevos.some(sel => sel.fecha === fechaBloques && sel.id_bloque === b.id_bloque);
                  
                  return (
                    <label 
                      key={b.id_bloque} 
                      className={`mnt-gest-modal__bloque-btn ${isOriginal ? 'original' : isNuevo ? 'selected' : ''}`}
                    >
                      <input 
                        type="checkbox" 
                        checked={isOriginal || isNuevo} 
                        disabled={isOriginal}
                        onChange={() => toggleBloque(b.id_bloque)} 
                      />
                      {b.hora_inicio.slice(0,5)} - {b.hora_fin.slice(0,5)}
                      {isOriginal && <span className="mnt-gest-modal__tag">Fijo</span>}
                    </label>
                  );
                })}
              </div>
            )}

            <div className="mnt-gest-modal__summary">
              <div className="mnt-gest-modal__summary-section">
                <h5>Bloques actuales (no modificables)</h5>
                <ul className="mnt-gest-modal__summary-list">
                  {Object.entries(
                    bloquesOriginales.reduce((acc, b) => {
                      acc[b.fecha] = (acc[b.fecha] || 0) + 1;
                      return acc;
                    }, {})
                  ).sort((a, b) => a[0].localeCompare(b[0])).map(([fecha, count]) => (
                    <li key={fecha}>{formatFecha(fecha)}: {count} bloques</li>
                  ))}
                </ul>
              </div>

              {bloquesNuevos.length > 0 && (
                <div className="mnt-gest-modal__summary-section nuevo">
                  <h5>Bloques a agregar</h5>
                  <ul className="mnt-gest-modal__summary-list">
                    {Object.entries(
                      bloquesNuevos.reduce((acc, b) => {
                        acc[b.fecha] = (acc[b.fecha] || 0) + 1;
                        return acc;
                      }, {})
                    ).sort((a, b) => a[0].localeCompare(b[0])).map(([fecha, count]) => (
                      <li key={fecha} className="nuevo">{formatFecha(fecha)}: {count} bloques</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Preview Section */}
          <div className="mnt-gest-modal__preview">
            <h4>Impacto de los NUEVOS bloques</h4>
            {loadingPreview ? (
              <p>Calculando vuelos afectados...</p>
            ) : preview ? (
              preview.length > 0 ? (
                <>
                  <div className="mnt-gest-modal__alert">
                    ⚠️ Se cancelarán {preview.length} vuelo(s) adicionales.
                  </div>
                  <ul className="mnt-gest-modal__flight-list">
                    {preview.slice(0, 3).map(v => (
                      <li key={v.id_vuelo}>
                        {new Date(v.fecha_vuelo).toLocaleDateString()} {v.hora_inicio.slice(0,5)} - {v.alumno}
                      </li>
                    ))}
                    {preview.length > 3 && <li>...y {preview.length - 3} más</li>}
                  </ul>
                </>
              ) : (
                <p className="mnt-gest-modal__success">✓ No hay vuelos adicionales afectados.</p>
              )
            ) : (
              <p className="mnt-gest-modal__helptext">Seleccioná bloques nuevos para ver el impacto.</p>
            )}
          </div>

          {error && <p className="mnt-gest-modal__error">{error}</p>}
        </div>
        
        <div className="mnt-gest-modal__footer">
          <button className="mnt-gest-modal__btn-cancel" onClick={onClose} disabled={saving}>Cancelar</button>
          <button 
            className="mnt-gest-modal__btn-confirm" 
            onClick={handleGuardar} 
            disabled={saving || bloquesNuevos.length === 0}
          >
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
