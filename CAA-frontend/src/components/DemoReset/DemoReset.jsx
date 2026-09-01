import { useEffect, useState } from "react";
import { toast } from "sonner";
import axios from "axios";
import { getSession } from "../../utils/auth";

const API = () => window.__APP_CONFIG__?.API_URL || "";

/**
 * Botón para devolver la demostración a su punto de partida, en vivo delante de
 * un prospecto.
 *
 * 🚨 Dispara un endpoint que BORRA datos — pero solo los del esquema `demo`.
 * Corre en el MISMO despliegue que CAAA, así que se dibuja únicamente cuando el
 * backend confirma que ESTA SESIÓN trabaja sobre demo. Un admin real de CAAA no
 * lo ve, y si lo llamara igual recibiría 403: su token dice `public`.
 *
 * El candado del frontend es cosmético: los que valen están en el backend
 * (demo/guardas.js). Acá no se decide nada, solo se pregunta.
 */
export default function DemoReset({ variante }) {
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
        setDisponible(!!r.data?.en_demo);
        setFrase(r.data?.frase || "");
      })
      .catch(() => setDisponible(false));   // Ante la duda, no se dibuja.
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
      {/* En el sidebar toma la forma de un ítem de navegación, para no meter un
          botón de otra pantalla en medio de la barra. */}
      <button type="button"
        className={variante === "sidebar" ? "adm-sidebar__demo" : "adf-btn secondary small"}
        onClick={() => setAbierto(true)}
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
                Esto <strong>borra todo lo que se hizo en la demostración</strong> —alumnos,
                vuelos, voucheras, movimientos— y lo devuelve al punto de partida. La flota, los
                cursos y la configuración no se tocan.
              </p>
              <p style={{ marginBottom: 12, color: "var(--c-ink-2)", fontSize: "0.88rem" }}>
                Los datos reales de la escuela viven en otro esquema de la base y esta acción no
                puede alcanzarlos.
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
