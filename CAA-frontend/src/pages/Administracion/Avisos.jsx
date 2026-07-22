import { useState } from "react";
import { toast } from "sonner";
import { publicarAviso } from "../../services/administracionApi";

// Perfiles elegibles como destinatario de un aviso. "Proyección" es la
// pantalla pública del tablero (no un rol de usuario real) — al elegirla el
// ticker también aparece ahí, no solo en el widget de avisos de cada perfil.
const PERFILES = [
  { rol: "ALUMNO",         label: "Alumnos" },
  { rol: "INSTRUCTOR",     label: "Instructores" },
  { rol: "TURNO",          label: "Turno" },
  { rol: "PROGRAMACION",   label: "Programación" },
  { rol: "TALLER",         label: "Taller" },
  { rol: "ADMINISTRACION", label: "Administración" },
  { rol: "DUENO",          label: "Dueño" },
  { rol: "PROYECCION",     label: "Pantalla pública (Proyección)" },
];

export default function Avisos() {
  const [mensaje, setMensaje] = useState("");
  const [todos, setTodos] = useState(true);
  const [seleccion, setSeleccion] = useState([]);
  const [enviarTicker, setEnviarTicker] = useState(true);
  const [enviarPush, setEnviarPush] = useState(true);
  const [enviando, setEnviando] = useState(false);

  const toggleRol = (rol) => {
    setSeleccion((s) => (s.includes(rol) ? s.filter((r) => r !== rol) : [...s, rol]));
  };

  const puedeEnviar = mensaje.trim() && (enviarTicker || enviarPush) && (todos || seleccion.length > 0) && !enviando;

  const handleEnviar = async () => {
    if (!puedeEnviar) return;
    setEnviando(true);
    try {
      await publicarAviso({
        mensaje: mensaje.trim(),
        destinatarios: todos ? null : seleccion,
        enviarTicker,
        enviarPush,
      });
      toast.success("Aviso publicado");
      setMensaje("");
      setSeleccion([]);
      setTodos(true);
    } catch (e) {
      toast.error(e?.response?.data?.message || "No se pudo publicar el aviso");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div>
      <h1 className="adf-section-title"><i className="bi bi-megaphone"></i>Avisos</h1>
      <p className="adf-section-subtitle">
        Publicá un aviso en el ticker y/o como notificación push, dirigido a todos o solo a los perfiles que elijas.
      </p>

      <div className="adf-card" style={{ maxWidth: 640 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: "0.85rem", color: "var(--c-ink-3)", display: "block", marginBottom: 6 }}>Mensaje</label>
          <textarea
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            rows={3}
            maxLength={280}
            placeholder="Ej.: El taller estará cerrado el viernes por inventario…"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--c-line-2)", fontSize: "0.95rem", resize: "vertical" }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: "0.85rem", color: "var(--c-ink-3)", display: "block", marginBottom: 8 }}>Destinatarios</label>
          <label style={{ fontSize: "0.9rem", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 8, fontWeight: 600 }}>
            <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} />
            Todos (difusión general)
          </label>
          {!todos && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, paddingLeft: 4 }}>
              {PERFILES.map((p) => (
                <label key={p.rol} style={{ fontSize: "0.88rem", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={seleccion.includes(p.rol)} onChange={() => toggleRol(p.rol)} />
                  {p.label}
                </label>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 20, display: "flex", gap: 20 }}>
          <label style={{ fontSize: "0.9rem", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={enviarTicker} onChange={(e) => setEnviarTicker(e.target.checked)} />
            <i className="bi bi-badge-ad"></i> Ticker
          </label>
          <label style={{ fontSize: "0.9rem", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={enviarPush} onChange={(e) => setEnviarPush(e.target.checked)} />
            <i className="bi bi-bell"></i> Notificación push
          </label>
        </div>

        <button className="adf-btn" disabled={!puedeEnviar} onClick={handleEnviar}>
          <i className="bi bi-send"></i>
          {enviando ? "Publicando…" : "Publicar aviso"}
        </button>
      </div>
    </div>
  );
}
