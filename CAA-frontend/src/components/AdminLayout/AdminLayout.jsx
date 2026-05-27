import React from "react";
import AdminSidebar from "../AdminSidebar/AdminSidebar";
import "./AdminLayout.css";

export default function AdminLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="adm-layout">
      {/* Topbar Global */}
      <header className="adm-topbar">
        <div className="adm-topbar__left">
          <button className="adm-topbar__menu-btn" onClick={toggleSidebar}>
            <i className={`bi ${sidebarOpen ? 'bi-x' : 'bi-list'}`}></i>
          </button>
          <span className="adm-topbar__logo">CAAA</span>
          <span className="adm-topbar__divider">|</span>
          <span className="adm-topbar__title">Administración</span>
        </div>
        <div className="adm-topbar__right">
          <span className="adm-topbar__role">{user.rol || 'ADMIN'}</span>
          <div className="adm-topbar__avatar">AD</div>
        </div>
      </header>

      <div className={`adm-layout__body ${sidebarOpen ? "sidebar-open" : ""}`}>
        <AdminSidebar isOpen={sidebarOpen} onClose={closeSidebar} />
        {sidebarOpen && <div className="adm-layout__overlay" onClick={closeSidebar} />}
        <main className="adm-layout__content">
          <div className="adm-layout__inner">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
