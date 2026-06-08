import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "../AdministracionSidebar/AdministracionSidebar.css";

/**
 * Sidebar del módulo Taller para el rol TALLER (mecánico). Reutiliza las clases
 * `adf-sidebar` del módulo de Administración. El ADMIN (super-usuario) no usa
 * este sidebar: navega el módulo desde el shell unificado (AdminSidebar).
 */
export default function TallerSidebar({ isOpen, onClose }) {
  const location = useLocation();
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
    if (onClose) onClose();
  };

  const menuItems = [
    { label: "Dashboard",        path: "/taller/dashboard",        icon: "bi-speedometer2" },
    { label: "Aeronavegabilidad", path: "/taller/aeronavegabilidad", icon: "bi-clipboard2-check" },
    { label: "Inventario",       path: "/taller/inventario",       icon: "bi-box-seam" },
  ];

  return (
    <aside className={`adf-sidebar ${isOpen ? "adf-sidebar--open" : ""}`}>
      <div className="adf-sidebar__menu-title">Taller</div>
      <nav className="adf-sidebar__nav">
        {menuItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`adf-sidebar__link ${
              location.pathname.startsWith(item.path) ? "adf-sidebar__link--active" : ""
            }`}
            onClick={onClose}
          >
            <i className={`bi ${item.icon} adf-sidebar__icon`}></i>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className="adf-sidebar__bottom">
        {user.rol === "ADMIN" && (
          <Link to="/admin/dashboard" className="adf-sidebar__crosslink" onClick={onClose}>
            <i className="bi bi-arrow-left-circle"></i>
            Panel del sistema
          </Link>
        )}
        <button className="adf-sidebar__logout" onClick={handleLogout}>
          <i className="bi bi-box-arrow-left"></i>
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
