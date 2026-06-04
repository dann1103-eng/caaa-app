import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "./AdministracionSidebar.css";

export default function AdministracionSidebar({ isOpen, onClose }) {
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
    { label: "Dashboard",      path: "/administracion/dashboard",     icon: "bi-speedometer2" },
    { label: "Usuarios",       path: "/administracion/usuarios",      icon: "bi-person-gear" },
    { label: "Alumnos",        path: "/administracion/alumnos",       icon: "bi-people" },
    { label: "Contabilidad",   path: "/administracion/contabilidad",  icon: "bi-cash-coin" },
    { label: "Cursos",         path: "/administracion/cursos",        icon: "bi-mortarboard" },
    { label: "Documentación",  path: "/administracion/documentacion", icon: "bi-folder-check" },
    { label: "Médicos AAC",    path: "/administracion/medicos",       icon: "bi-clipboard2-pulse" },
    { label: "Aula Virtual",   path: "/administracion/aula-virtual",  icon: "bi-mortarboard-fill" },
    { label: "Reportes",       path: "/administracion/reportes",      icon: "bi-bar-chart" },
  ];

  return (
    <aside className={`adf-sidebar ${isOpen ? "adf-sidebar--open" : ""}`}>
      <div className="adf-sidebar__menu-title">Contabilidad</div>
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
