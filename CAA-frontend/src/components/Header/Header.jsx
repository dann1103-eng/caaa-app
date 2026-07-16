import "./Header.css";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import NotificationBell from "../NotificationBell/NotificationBell";
import PushToggle from "../PushToggle/PushToggle";

export default function Header() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user"));
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  const getDashboardLink = () => {
    if (!user) return "/login";
    const rol = user?.rol?.toUpperCase() || "";
    if (rol === "ADMIN") return "/admin/dashboard";
    if (rol === "PROGRAMACION") return "/programacion/dashboard";
    if (rol === "ALUMNO") return "/alumno/dashboard";
    if (rol === "TURNO") return "/turno";
    if (rol === "INSTRUCTOR") return "/instructor";
    return "/login";
  };

  return (
    <header className="header">
      <div className="header__container">

        <div className="header__logo">
          <img src="/iso-caaa-navy.png" alt="CAAA" className="header__logo-img" />
          CAAA
        </div>

        <nav className="header__nav">
          {!user && (
            <Link to="/login" className="header__btn-login">Iniciar sesión</Link>
          )}

          {user && (
            <div className="header__user-box">
              <span className="header__user">
                Hola, <strong>{user.nombre}</strong>
              </span>

              <div className="header__user-actions">
                <NotificationBell />

                <button
                  className="header__hamburger"
                  aria-label="Menú"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((v) => !v)}
                >
                  <i className={`bi ${menuOpen ? "bi-x-lg" : "bi-list"}`} />
                </button>

                {menuOpen && <div className="header__menu-backdrop" onClick={closeMenu} />}

                <div className={`header__menu ${menuOpen ? "header__menu--open" : ""}`}>
                  <Link to={getDashboardLink()} className="header__action-link" onClick={closeMenu}>
                    <i className="bi bi-speedometer2 header__action-icon" />
                    <span>Dashboard</span>
                  </Link>

                  {(["ADMIN", "PROGRAMACION", "TURNO"].includes(user.rol) || user.puede_programar) && (
                    <>
                      <a href="/proyeccion?modo=proyeccion&key=caaa_proyeccion_secret_2024" target="_blank" rel="noopener noreferrer" className="header__action-link" onClick={closeMenu}>
                        <i className="bi bi-easel header__action-icon" />
                        <span>Proyección</span>
                      </a>
                      <a href="/proyeccion/tracking?modo=proyeccion&key=caaa_proyeccion_secret_2024" target="_blank" rel="noopener noreferrer" className="header__action-link" onClick={closeMenu}>
                        <i className="bi bi-broadcast header__action-icon" />
                        <span>Flight Tracking</span>
                      </a>
                    </>
                  )}

                  {user.rol === "INSTRUCTOR" && user.puede_programar && (
                    <Link to="/programacion/dashboard" className="header__action-link" onClick={closeMenu}>
                      <i className="bi bi-calendar-week header__action-icon" />
                      <span>Programación</span>
                    </Link>
                  )}

                  {user.rol === "INSTRUCTOR" && user.es_instructor_teoria !== false && (
                    <Link to="/instructor/aula-virtual" className="header__action-link" onClick={closeMenu}>
                      <i className="bi bi-mortarboard header__action-icon" />
                      <span>Aula Virtual</span>
                    </Link>
                  )}

                  {user.rol !== "ALUMNO" && (
                    <PushToggle className="header__action-link" onDone={closeMenu} />
                  )}

                  <Link to="/perfil" className="header__action-link" onClick={closeMenu}>
                    <i className="bi bi-person header__action-icon" />
                    <span>Perfil</span>
                  </Link>

                  <button onClick={handleLogout} className="header__btn-logout-new">
                    <i className="bi bi-box-arrow-right header__action-icon" />
                    <span>Salir</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </nav>

      </div>
    </header>
  );
}
