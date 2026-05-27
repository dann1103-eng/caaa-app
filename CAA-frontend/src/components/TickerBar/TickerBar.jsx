import { useEffect, useState, useRef, useCallback } from "react";
import { io as socketIO } from "socket.io-client";
import axios from "axios";
import { API_URL, SOCKET_URL } from "../../api/axiosConfig";
import "./TickerBar.css";

// Base duration per character in seconds (scales with message length)
const CHARS_PER_SECOND = 8;
const MIN_DURATION = 15;
const MAX_DURATION = 90;

function calcDuration(text) {
  if (!text) return MIN_DURATION;
  const secs = Math.round(text.length / CHARS_PER_SECOND);
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, secs));
}

export default function TickerBar() {
  const [mensajes, setMensajes] = useState([]);
  const [idx, setIdx] = useState(0);
  const [iteracion, setIteracion] = useState(0);
  const bufferRef = useRef([]);
  const animRef = useRef(null);
  const isInitialLoad = useRef(true);

  const cargarMensajes = useCallback(async () => {
    try {
      const r = await axios.get(`${API_URL}/turno/ticker`);
      const data = r.data ?? [];
      bufferRef.current = data;
      
      // En la carga inicial sí mostramos de inmediato
      if (isInitialLoad.current && data.length > 0) {
        setMensajes(data);
        setIdx(0);
        isInitialLoad.current = false;
      }
    } catch {
      /* silencioso */
    }
  }, []);

  // Carga inicial
  useEffect(() => {
    cargarMensajes();
  }, [cargarMensajes]);

  // Polling cada 60s para remover mensajes que expiran
  useEffect(() => {
    const t = setInterval(cargarMensajes, 60000);
    return () => clearInterval(t);
  }, [cargarMensajes]);

  // Socket — solo actualizamos el buffer, la rotación aplicará los cambios después
  useEffect(() => {
    const socket = socketIO(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnectionDelay: 2000,
      reconnectionAttempts: 5,
    });
    socket.on("nuevo_ticker", () => {
      cargarMensajes();
    });
    return () => socket.disconnect();
  }, [cargarMensajes]);

  // Rotación automática: al terminar la animación, avanzar al siguiente aplicando cambios pendientes
  useEffect(() => {
    // Si no hay mensajes activos pero el buffer tiene algo, cargarlo
    if (mensajes.length === 0) {
      if (bufferRef.current.length > 0) {
        setMensajes(bufferRef.current);
        setIdx(0);
      }
      return;
    }

    const msg = mensajes[idx];
    if (!msg) { // Por si acaso hay un desfase
      setIdx(0);
      return;
    }

    const duration = calcDuration(msg.contenido);

    const timer = setTimeout(() => {
      // Al terminar el mensaje actual, sincronizamos con lo último del servidor
      const nextData = bufferRef.current;

      if (nextData.length === 0) {
        setMensajes([]);
        setIdx(0);
      } else {
        setMensajes(nextData);
        // Avanzar al siguiente en la nueva lista
        setIdx((prev) => (prev + 1) % nextData.length);
        setIteracion(prev => prev + 1);
      }
    }, duration * 1000);

    return () => clearTimeout(timer);
  }, [mensajes, idx, iteracion]);

  if (mensajes.length === 0) return null;

  const msg = mensajes[idx];
  const duration = calcDuration(msg.contenido);

  return (
    <div className="ticker-bar">
      <span className="ticker-bar__label">AVISO</span>
      <div className="ticker-bar__track">
        <span
          key={`${msg.id_mensaje}-${idx}-${iteracion}`}
          className="ticker-bar__text"
          style={{ animationDuration: `${duration}s` }}
          ref={animRef}
        >
          {msg.contenido ? String(msg.contenido).toUpperCase() : ""}
        </span>
      </div>
      {mensajes.length > 1 && (
        <span className="ticker-bar__counter">
          {idx + 1}/{mensajes.length}
        </span>
      )}
    </div>
  );
}
