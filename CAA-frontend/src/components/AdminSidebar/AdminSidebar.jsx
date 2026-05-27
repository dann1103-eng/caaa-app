import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getSolicitudesCancelacion } from "../../services/adminApi";
import { io as socketIO } from "socket.io-client";
import { SOCKET_URL } from "../../api/axiosConfig";
import "./AdminSidebar.css";

export default function AdminSidebar({ isOpen, onClose }) {
  const location = useLocation();
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user"));

  const [pendingCancelCount, setPendingCancelCount] = useState(0);

  useEffect(() => {
    const fetchPendingCount = async () => {
      try {
        const data = await getSolicitudesCancelacion();
        const pending = Array.isArray(data) ? data.filter(s => s.estado === 'PENDIENTE').length : 0;
        setPendingCancelCount(pending);
      } catch (e) {
        // Silently fail
      }
    };

    fetchPendingCount();

    const socket = socketIO(SOCKET_URL, { transports: ["websocket", "polling"] });

    socket.on("nueva_solicitud_cancelacion", fetchPendingCount);
    socket.on("solicitud_cancelacion_resuelta", fetchPendingCount);

    return () => socket.disconnect();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
    if (onClose) onClose();
  };

  const menuItems = [
    { label: "Dashboard", path: "/admin/dashboard", icon: "bi-grid-fill" },
    { 
      label: "Programación", 
      path: "/proyeccion?modo=proyeccion&key=caaa_proyeccion_secret_2024", 
      icon: "bi-calendar3",
      external: true 
    },
    { label: "Mantenimiento", path: "/admin/mantenimiento", icon: "bi-tools" },
    { label: "Perfiles", path: "/admin/perfiles", icon: "bi-person-badge" },
    { label: "Alumnos", path: "/admin/alumnos", icon: "bi-people" },
    { label: "Cancelaciones", path: "/admin/cancelaciones", icon: "bi-x-circle", badge: pendingCancelCount },
  ];

  return (
    <aside className="adm-sidebar">
      <div className="adm-sidebar__menu-title">MENÚ PRINCIPAL</div>
      <nav className="adm-sidebar__nav">
        {menuItems.map((item) => (
          item.external ? (
            <a
              key={item.path}
              href={item.path}
              target="_blank"
              rel="noopener noreferrer"
              className="adm-sidebar__link"
              onClick={onClose}
            >
              <i className={`bi ${item.icon} adm-sidebar__icon`}></i>
              {item.label}
            </a>
          ) : (
            <Link
              key={item.path}
              to={item.path}
              className={`adm-sidebar__link ${
                location.pathname === item.path ? "adm-sidebar__link--active" : ""
              }`}
              onClick={onClose}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <i className={`bi ${item.icon} adm-sidebar__icon`}></i>
                  <span>{item.label}</span>
                </div>
                {item.badge > 0 && (
                  <span style={{ backgroundColor: '#ef4444', color: 'white', padding: '2px 8px', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 700 }}>
                    {item.badge}
                  </span>
                )}
              </div>
            </Link>
          )
        ))}
      </nav>

      <div className="adm-sidebar__bottom">
        <button className="adm-sidebar__logout" onClick={handleLogout}>
          <i className="bi bi-box-arrow-left"></i>
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
