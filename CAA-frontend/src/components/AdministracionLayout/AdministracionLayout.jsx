import React from "react";
import AdministracionSidebar from "../AdministracionSidebar/AdministracionSidebar";
import NotificationBell from "../NotificationBell/NotificationBell";
import "./AdministracionLayout.css";

export default function AdministracionLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="adf-layout">
      <header className="adf-topbar">
        <div className="adf-topbar__left">
          <button className="adf-topbar__menu-btn" onClick={toggleSidebar}>
            <i className={`bi ${sidebarOpen ? 'bi-x' : 'bi-list'}`}></i>
          </button>
          <span className="adf-topbar__logo">CAAA</span>
          <span className="adf-topbar__divider">|</span>
          <span className="adf-topbar__title">
            <i className="bi bi-cash-coin me-2"></i>
            Administración &amp; Contabilidad
          </span>
        </div>
        <div className="adf-topbar__right">
          <NotificationBell />
          <span className="adf-topbar__year">2026</span>
          <span className="adf-topbar__role">{user.rol || 'ADMINISTRACION'}</span>
          <div className="adf-topbar__avatar">
            {(user.username || 'AF').slice(0, 2).toUpperCase()}
          </div>
        </div>
      </header>

      <div className={`adf-layout__body ${sidebarOpen ? "sidebar-open" : ""}`}>
        <AdministracionSidebar isOpen={sidebarOpen} onClose={closeSidebar} />
        {sidebarOpen && <div className="adf-layout__overlay" onClick={closeSidebar} />}
        <main className="adf-layout__content">
          <div className="adf-layout__inner">{children}</div>
        </main>
      </div>
    </div>
  );
}
