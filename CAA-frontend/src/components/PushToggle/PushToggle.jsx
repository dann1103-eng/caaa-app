import { useEffect, useState } from "react";
import { toast } from "sonner";
import { pushSoportado, estadoPermisoPush, activarPush, desactivarPush, yaSuscrito } from "../../utils/push";

// Botón para activar/desactivar las notificaciones push del navegador. Se usa
// en el Header para staff (instructores/admin/administración/turno/etc.).
export default function PushToggle({ className = "", onDone }) {
  const [activo, setActivo] = useState(false);
  const [busy, setBusy] = useState(false);
  const soportado = pushSoportado();

  useEffect(() => {
    if (!soportado) return;
    yaSuscrito().then(setActivo).catch(() => {});
  }, [soportado]);

  if (!soportado) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      if (activo) {
        await desactivarPush();
        setActivo(false);
        toast.success("Notificaciones desactivadas en este dispositivo");
      } else {
        if (estadoPermisoPush() === "denied") {
          toast.error("Las notificaciones están bloqueadas en el navegador. Habilitalas desde la configuración del sitio.");
          return;
        }
        await activarPush();
        setActivo(true);
        toast.success("Notificaciones activadas en este dispositivo");
      }
      onDone?.();
    } catch (e) {
      toast.error(e?.message || "No se pudieron activar las notificaciones");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={className}
      onClick={toggle}
      disabled={busy}
      title={activo ? "Notificaciones activas en este dispositivo" : "Activar notificaciones push"}
    >
      <i className={`bi ${activo ? "bi-bell-fill" : "bi-bell-slash"} header__action-icon`} />
      <span>{busy ? "…" : activo ? "Notificaciones ✓" : "Activar notificaciones"}</span>
    </button>
  );
}
