import "./Login.css";
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { login } from "../../services/loginApi";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const data = await login(username, password);

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      const user = data.user;

      if (user.must_change_password || user.must_set_email) {
        navigate("/perfil");
        return;
      }

      if (user.rol === "ALUMNO") navigate("/alumno/dashboard");
      else if (user.rol === "PROGRAMACION") navigate("/programacion/dashboard");
      else if (user.rol === "ADMIN") navigate("/admin/dashboard");
      else if (user.rol === "TURNO") navigate("/turno");
      else if (user.rol === "INSTRUCTOR") navigate("/instructor");
      else if (user.rol === "ADMINISTRACION") navigate("/administracion/dashboard");
    } catch {
      toast.error("Credenciales incorrectas");
    }
  };

  const params = new URLSearchParams(window.location.search);
  const reason = params.get("reason");

  return (
    <div className="login">
      <div className="login__card">
        {/* Header Section */}
        <header className="login__header">
          <div className="login__icon-container">
            <i className="bi bi-airplane-fill login__header-icon"></i>
          </div>
          <h1 className="login__brand">CAAA</h1>
          <p className="login__subtitle">Centro de Adiestramiento Aéreo Académico SA de CV</p>
        </header>

        {/* Body Section */}
        <main className="login__body">
          <h2 className="login__form-title">Iniciar Sesión</h2>

          {reason === "timeout" && (
            <div className="alert alert-danger text-center mb-4" style={{ fontSize: '0.85rem' }}>
              Su sesión fue cerrada por inactividad.
            </div>
          )}

          {reason === "conflict" && (
            <div className="alert alert-warning text-center mb-4" style={{ fontSize: '0.85rem' }}>
              Sesión cerrada: se ha iniciado sesión en otro dispositivo.
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="login__field">
              <label className="login__label">Usuario</label>
              <div className="login__input-container">
                <i className="bi bi-person login__field-icon"></i>
                <input
                  className="login__input"
                  type="text"
                  placeholder="u5"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div className="login__field">
              <label className="login__label">Contraseña</label>
              <div className="login__input-container">
                <i className="bi bi-lock login__field-icon"></i>
                <input
                  className="login__input"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="login__eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  <i className={`bi ${showPassword ? "bi-eye-slash" : "bi-eye"}`}></i>
                </button>
              </div>
            </div>

            <button type="submit" className="login__submit">
              <i className="bi bi-box-arrow-in-right"></i>
              Ingresar
            </button>


          </form>
        </main>
      </div>

      <footer className="login__page-footer">
        CAAA © {new Date().getFullYear()} · Sistema de Gestión de Vuelos
      </footer>
    </div>
  );
}