import React from "react";
import TallerSidebar from "../TallerSidebar/TallerSidebar";
import NotificationBell from "../NotificationBell/NotificationBell";
import "../AdministracionLayout/AdministracionLayout.css";

/**
 * Layout del módulo Taller para el rol TALLER. Reutiliza el shell `adf-*` del
 * módulo de Administración (mismo look "Core Admin"), con su propio sidebar.
 */
export default function TallerLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="adf-layout">
      <header className="adf-topbar">
        <div className="adf-topbar__left">
          <button className="adf-topbar__menu-btn" onClick={toggleSidebar}>
            <i className={`bi ${sidebarOpen ? "bi-x" : "bi-list"}`}></i>
          </button>
          <img src="/iso-caaa-white.png" alt="CAAA" className="adf-topbar__logo-img" style={{ height: 28, width: "auto", display: "block" }} />
          <span className="adf-topbar__logo">CAAA</span>
          <span className="adf-topbar__divider">|</span>
          <span className="adf-topbar__title">
            <i className="bi bi-wrench-adjustable me-2"></i>
            Taller &amp; Mantenimiento
          </span>
        </div>
        <div className="adf-topbar__right">
          <NotificationBell />
          <span className="adf-topbar__year">2026</span>
          <span className="adf-topbar__role">{user.rol || "TALLER"}</span>
          <div className="adf-topbar__avatar">
            {(user.username || "TA").slice(0, 2).toUpperCase()}
          </div>
        </div>
      </header>

      <div className={`adf-layout__body ${sidebarOpen ? "sidebar-open" : ""}`}>
        <TallerSidebar isOpen={sidebarOpen} onClose={closeSidebar} />
        {sidebarOpen && <div className="adf-layout__overlay" onClick={closeSidebar} />}
        <main className="adf-layout__content">
          <div className="adf-layout__inner">{children}</div>
        </main>
      </div>
    </div>
  );
}
