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

  // Navegación del super-usuario ADMIN, agrupada en 3 secciones. Todo coexiste
  // en este mismo shell (Operaciones, Administración, Taller) — sin saltar de layout.
  const secciones = [
    {
      titulo: "Operaciones",
      items: [
        { label: "Dashboard", path: "/admin/dashboard", icon: "bi-grid-fill" },
        {
          label: "Programación",
          path: "/proyeccion?modo=proyeccion&key=caaa_proyeccion_secret_2024",
          icon: "bi-calendar3",
          external: true,
        },
        { label: "Agendar vuelos", path: "/admin/agendar", icon: "bi-calendar-plus" },
        { label: "Cancelaciones", path: "/admin/cancelaciones", icon: "bi-x-circle", badge: pendingCancelCount },
        { label: "Mantenimiento", path: "/admin/mantenimiento", icon: "bi-tools" },
      ],
    },
    {
      titulo: "Administración",
      items: [
        { label: "Dashboard", path: "/administracion/dashboard", icon: "bi-speedometer2" },
        { label: "Usuarios", path: "/administracion/usuarios", icon: "bi-person-gear" },
        { label: "Alumnos", path: "/administracion/alumnos", icon: "bi-people" },
        { label: "Contabilidad", path: "/administracion/contabilidad", icon: "bi-cash-coin" },
        { label: "Cursos", path: "/administracion/cursos", icon: "bi-mortarboard" },
        { label: "Documentación", path: "/administracion/documentacion", icon: "bi-folder-check" },
        { label: "Médicos AAC", path: "/administracion/medicos", icon: "bi-clipboard2-pulse" },
        { label: "Aula Virtual", path: "/administracion/aula-virtual", icon: "bi-mortarboard-fill" },
        { label: "Reportes", path: "/administracion/reportes", icon: "bi-bar-chart" },
      ],
    },
    {
      titulo: "Taller",
      items: [
        { label: "Próximamente", icon: "bi-wrench-adjustable", disabled: true },
      ],
    },
  ];

  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  return (
    <aside className="adm-sidebar">
      <nav className="adm-sidebar__nav">
        {secciones.map((sec) => (
          <div key={sec.titulo} className="adm-sidebar__section">
            <div className="adm-sidebar__menu-title">{sec.titulo}</div>
            {sec.items.map((item) =>
              item.disabled ? (
                <span key={item.label} className="adm-sidebar__link adm-sidebar__link--disabled">
                  <i className={`bi ${item.icon} adm-sidebar__icon`}></i>
                  <span>{item.label}</span>
                </span>
              ) : item.external ? (
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
                  className={`adm-sidebar__link ${isActive(item.path) ? "adm-sidebar__link--active" : ""}`}
                  onClick={onClose}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <i className={`bi ${item.icon} adm-sidebar__icon`}></i>
                      <span>{item.label}</span>
                    </div>
                    {item.badge > 0 && (
                      <span style={{ backgroundColor: 'var(--c-primary-500)', color: 'oklch(99% 0 0)', padding: '2px 8px', borderRadius: 'var(--radius-pill)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                        {item.badge}
                      </span>
                    )}
                  </div>
                </Link>
              )
            )}
          </div>
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
