import { useEffect, useState } from "react";
import { toast } from "sonner";
import axios from "axios";
import { getSession } from "../../utils/auth";

const API = () => window.__APP_CONFIG__?.API_URL || "";

/**
 * Botón para devolver el demo a su punto de partida, en vivo delante de un
 * prospecto.
 *
 * 🚨 Dispara un endpoint que BORRA la base. Se dibuja SOLO si el backend
 * contesta /api/demo/estado — y ese endpoint solo existe cuando el despliegue
 * tiene DEMO_MODE=true, variable que no existe en CAAA. En producción esta
 * llamada da 404, el componente se apaga y no queda ni rastro en la pantalla.
 *
 * El candado del frontend es cosmético: los que valen están en el backend
 * (demo/guardas.js). Acá no se decide nada, solo se pregunta.
 */
export default function DemoReset() {
  const [disponible, setDisponible] = useState(false);
  const [frase, setFrase] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [corriendo, setCorriendo] = useState(false);

  const esAdmin = getSession()?.rol === "ADMIN";

  useEffect(() => {
    if (!esAdmin) return;
    let vivo = true;
    axios.get(`${API()}/api/demo/estado`)
      .then((r) => {
        if (!vivo) return;
        setDisponible(!!r.data?.base_desechable);
        setFrase(r.data?.frase || "");
      })
      .catch(() => setDisponible(false));   // 404 en CAAA: no se dibuja nada.
    return () => { vivo = false; };
  }, [esAdmin]);

  if (!esAdmin || !disponible) return null;

  const reiniciar = async () => {
    setCorriendo(true);
    try {
      const r = await axios.post(`${API()}/api/demo/reiniciar`, { confirmacion: texto });
      toast.success(`Demo reiniciado · ${r.data.alumnos} alumnos, ${r.data.vuelos_cerrados} vuelos cerrados`);
      setAbierto(false); setTexto("");
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast.error(e.response?.data?.message || "No se pudo reiniciar");
    } finally {
      setCorriendo(false);
    }
  };

  return (
    <>
      <button type="button" className="adf-btn secondary small" onClick={() => setAbierto(true)}
        title="Devuelve el demo a su punto de partida">
        <i className="bi bi-arrow-counterclockwise" aria-hidden="true"></i> Reiniciar demo
      </button>

      {abierto && (
        <div className="adf-modal-backdrop" onClick={() => setAbierto(false)}>
          <div className="adf-card adf-modal-card" style={{ padding: 0, maxWidth: 520 }}
            onClick={(e) => e.stopPropagation()}>
            <div className="adf-edit-head">
              <span className="adf-edit-head__title">
                <span className="adf-edit-head__chip"><i className="bi bi-exclamation-octagon"></i></span>
                Reiniciar el demo
              </span>
            </div>
            <div style={{ padding: "0 var(--sp-5) var(--sp-5)" }}>
              <p style={{ marginBottom: 12 }}>
                Esto <strong>borra todo lo que se hizo</strong> en el demo —alumnos, vuelos,
                voucheras, movimientos— y lo devuelve al punto de partida. La flota, los cursos
                y la configuración no se tocan.
              </p>
              <div className="adf-form-field">
                <label>Para confirmar, escribí: <code>{frase}</code></label>
                <input value={texto} onChange={(e) => setTexto(e.target.value)}
                  placeholder={frase} autoFocus />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                <button type="button" className="adf-btn danger" disabled={corriendo || texto.trim() !== frase}
                  onClick={reiniciar}>
                  {corriendo ? "Reiniciando…" : "Reiniciar"}
                </button>
                <button type="button" className="adf-btn secondary" onClick={() => setAbierto(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
