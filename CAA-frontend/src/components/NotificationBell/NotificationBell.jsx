import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getNotificaciones, marcarLeida, marcarTodasLeidas } from "../../services/notificacionApi";

export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [noLeidas, setNoLeidas] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  const cargar = async () => {
    try {
      const r = await getNotificaciones();
      if (r?.ok) { setItems(r.data || []); setNoLeidas(r.no_leidas || 0); }
    } catch { /* silencioso */ }
  };

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 60000); // refrescar cada minuto
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, []);

  const abrir = async (n) => {
    if (!n.leida) {
      try { await marcarLeida(n.id); } catch { /* noop */ }
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, leida: true } : x));
      setNoLeidas(c => Math.max(0, c - 1));
    }
    if (n.enlace) { setOpen(false); navigate(n.enlace); }
  };

  const todas = async () => {
    try { await marcarTodasLeidas(); } catch { /* noop */ }
    setItems(prev => prev.map(x => ({ ...x, leida: true })));
    setNoLeidas(0);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }} title="Notificaciones"
        style={{ background: "none", border: "none", cursor: "pointer", position: "relative", fontSize: "1.2rem", padding: "4px 8px" }}>
        <i className="bi bi-bell"></i>
        {noLeidas > 0 && (
          <span style={{ position: "absolute", top: -2, right: 0, background: "#dc2626", color: "#fff", borderRadius: 999, fontSize: "0.65rem", fontWeight: 700, padding: "1px 5px", lineHeight: 1.4 }}>
            {noLeidas > 9 ? "9+" : noLeidas}
          </span>
        )}
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "110%", width: 320, maxHeight: 400, overflowY: "auto", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.15)", zIndex: 2000 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #f1f5f9" }}>
            <strong style={{ fontSize: "0.9rem", color: "#1e293b" }}>Notificaciones</strong>
            {noLeidas > 0 && <button onClick={todas} style={{ background: "none", border: "none", color: "#1B365D", cursor: "pointer", fontSize: "0.78rem" }}>Marcar todas</button>}
          </div>
          {items.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: "0.85rem" }}>Sin notificaciones</div>
          ) : items.map(n => (
            <div key={n.id} onClick={() => abrir(n)}
              style={{ padding: "10px 14px", borderBottom: "1px solid #f8fafc", cursor: n.enlace ? "pointer" : "default", background: n.leida ? "#fff" : "#eff6ff" }}>
              <div style={{ fontSize: "0.85rem", color: "#1e293b" }}>{n.mensaje}</div>
              <div style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: 2 }}>{new Date(n.creada_en).toLocaleString("es-SV")}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
