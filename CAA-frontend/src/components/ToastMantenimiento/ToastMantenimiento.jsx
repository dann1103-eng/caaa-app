import { useEffect, useState, useCallback } from "react";
import { io as socketIO } from "socket.io-client";
import { SOCKET_URL } from "../../api/axiosConfig";
import "./ToastMantenimiento.css";
const TOAST_DURATION = 8000;
let nextId = 1;

export default function ToastMantenimiento() {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((tipo, payload) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, tipo, payload }]);
    setTimeout(() => removeToast(id), TOAST_DURATION);
  }, [removeToast]);

  useEffect(() => {
    const socket = socketIO(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    socket.on("alerta_mantenimiento", (data) => addToast("alerta", data));
    socket.on("proximidad_mantenimiento", (data) => addToast("proximidad", data));

    return () => socket.disconnect();
  }, [addToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-mnt__container">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast-mnt__item ${t.tipo === "alerta" ? "toast-mnt__item--rojo" : "toast-mnt__item--amarillo"}`}
        >
          <span className="toast-mnt__icono">
            {t.tipo === "alerta" ? "✈" : "⚠"}
          </span>
          <span className="toast-mnt__msg">{t.payload.mensaje}</span>
          <button
            className="toast-mnt__close"
            onClick={() => removeToast(t.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
