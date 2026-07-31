import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getTramosRuta, asignarAlumnoTramo, getAlumnosListAdmin } from "../../services/adminApi";
import "../AterrizajeTramoModal/AterrizajeTramoModal.css";

// Asignar un alumno distinto a cada tramo de una ruta con parada (caso: la ida
// la vuela un alumno y el retorno otro; el instructor es el mismo).
export default function AsignarTramosModal({ id_detalle, onClose, onSaved }) {
  const [tramos, setTramos] = useState([]);
  const [alumnos, setAlumnos] = useState([]);
  const [saving, setSaving] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setCargando(true);
    setError("");
    getTramosRuta(id_detalle)
      .then(setTramos)
      .catch(() => setError("No se pudieron cargar los tramos de esta ruta."))
      .finally(() => setCargando(false));
    getAlumnosListAdmin().then((r) => setAlumnos(r || [])).catch(() => {});
  }, [id_detalle]);

  const cambiar = async (t, id_alumno) => {
    setSaving(t.id_vuelo);
    try {
      await asignarAlumnoTramo(t.id_vuelo, Number(id_alumno));
      const data = await getTramosRuta(id_detalle);
      setTramos(data);
      toast.success(`Tramo ${t.orden_tramo} reasignado.`);
      if (onSaved) onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.message || "No se pudo reasignar el tramo.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="atm-overlay" onClick={onClose}>
      <div className="atm-modal" onClick={(e) => e.stopPropagation()}>
        <h3><i className="bi bi-people"></i> Asignar alumnos por tramo</h3>
        <p className="atm-sub">Cada tramo cobra y acredita horas al alumno asignado. Solo se pueden reasignar tramos que aún no volaron.</p>
        {cargando && <p className="atm-sub">Cargando tramos…</p>}
        {!cargando && error && <p className="atm-sub" style={{ color: "var(--c-danger-700)" }}>{error}</p>}
        {!cargando && !error && tramos.length === 0 && (
          <p className="atm-sub">
            Los tramos se crean al publicar la semana — todavía no hay vuelos que asignar.
          </p>
        )}
        {tramos.map((t) => {
          const editable = ["PUBLICADO", "PROGRAMADO", "EN_ESPERA_TRAMO"].includes(t.estado);
          // El alumno actual puede no estar en la lista (ficha de DEMO/práctica,
          // o alumno dado de baja): sin esta opción el select mostraría por
          // defecto al primero de la lista, que es otra persona.
          const faltaEnLista = !alumnos.some((a) => a.id_alumno === t.id_alumno);
          return (
            <div key={t.id_vuelo} className="atm-field">
              <label>Tramo {t.orden_tramo}/{t.total_tramos} · {t.icao_origen}→{t.icao_destino} · {t.estado}</label>
              <select
                value={t.id_alumno}
                disabled={!editable || saving === t.id_vuelo}
                onChange={(e) => cambiar(t, e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--c-line-2, #cbd5e1)" }}
              >
                {faltaEnLista && (
                  <option value={t.id_alumno}>
                    {[t.alumno_nombre, t.alumno_apellido].filter(Boolean).join(" ") || "Alumno actual"}
                  </option>
                )}
                {alumnos.map((a) => (
                  <option key={a.id_alumno} value={a.id_alumno}>{a.nombre} {a.apellido}</option>
                ))}
              </select>
            </div>
          );
        })}
        <div className="atm-actions">
          <button className="atm-btn-save" onClick={onClose}>Listo</button>
        </div>
      </div>
    </div>
  );
}
