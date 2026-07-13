import "./Login.css";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { login } from "../../services/loginApi";

// Cada causa de fallo de login tiene un status HTTP distinto — mapear cada
// una a su propio mensaje evita el bug de mostrar "Credenciales incorrectas"
// cuando en realidad es un límite de peticiones (429) o una cuenta bloqueada
// temporalmente (403): el usuario reintentaba pensando que escribió mal la
// contraseña, cuando el problema era otro y solo hacía falta esperar.
function mensajeErrorLogin(err) {
  const status = err?.response?.status;
  const data = err?.response?.data;

  if (!err?.response) {
    return "No se pudo conectar con el servidor. Revisá tu conexión a internet e intentá de nuevo.";
  }
  if (status === 429) {
    return data?.message || "Demasiados intentos desde esta red. Esperá unos minutos e intentá de nuevo.";
  }
  if (status === 403) {
    // Cuenta bloqueada por intentos fallidos (ya bloqueada, o se acaba de bloquear ahora).
    return data?.message || "Cuenta bloqueada temporalmente por intentos fallidos. Esperá unos minutos.";
  }
  if (status === 401) {
    const restantes = data?.intentos_restantes;
    if (restantes != null) {
      return `Usuario o contraseña incorrectos. Te quedan ${restantes} intento${restantes === 1 ? "" : "s"} antes de que se bloquee la cuenta.`;
    }
    return data?.message || "Usuario o contraseña incorrectos.";
  }
  if (status === 400) {
    return data?.message || "Completá tu usuario y contraseña.";
  }
  return "Ocurrió un error inesperado. Intentá de nuevo en unos minutos.";
}

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

      // Primer login (cambio de contraseña/correo y/o confirmación de datos):
      // se navega al dashboard y el robapantallas global (ForcePasswordChange)
      // se muestra encima. No se manda a /perfil para que el modal aparezca de
      // inmediato también en móvil.
      if (user.rol === "ALUMNO") navigate("/alumno/dashboard");
      else if (user.rol === "PROGRAMACION") navigate("/programacion/dashboard");
      else if (user.rol === "ADMIN") navigate("/admin/dashboard");
      else if (user.rol === "TURNO") navigate("/turno");
      else if (user.rol === "INSTRUCTOR") navigate(user.es_instructor_vuelo === false ? "/instructor/aula-virtual" : "/instructor");
      else if (user.rol === "ADMINISTRACION") navigate("/administracion/dashboard");
      else if (user.rol === "TALLER") navigate("/taller/dashboard");
    } catch (err) {
      toast.error(mensajeErrorLogin(err));
    }
  };

  const params = new URLSearchParams(window.location.search);
  const reason = params.get("reason");

  return (
    <div className="login">
      {/* ── Panel de marca (SLOT intercambiable: aquí irá luego imagen/animación) ── */}
      <aside className="login__brand">
        <div className="login__brand-top">
          <span className="login__logo-chip">
            <img src="/logo-caaa-mark.png" alt="CAAA" />
          </span>
          <span className="login__wordmark">CAAA</span>
        </div>

        <svg className="login__horizon" viewBox="0 0 240 240" aria-hidden="true">
          <defs>
            <clipPath id="adiClip"><circle cx="120" cy="120" r="92" /></clipPath>
          </defs>
          <circle cx="120" cy="120" r="92" className="adi-ring" />
          <g clipPath="url(#adiClip)">
            <line x1="28" y1="120" x2="212" y2="120" className="adi-horizon" />
            <line x1="76" y1="98"  x2="164" y2="98"  className="adi-pitch" />
            <line x1="92" y1="80"  x2="148" y2="80"  className="adi-pitch" />
            <line x1="76" y1="142" x2="164" y2="142" className="adi-pitch" />
            <line x1="92" y1="160" x2="148" y2="160" className="adi-pitch" />
          </g>
          <line x1="120" y1="14" x2="120" y2="40" className="adi-mark" />
          <line x1="120" y1="200" x2="120" y2="226" className="adi-mark" />
          <line x1="14" y1="120" x2="40" y2="120" className="adi-mark" />
          <line x1="200" y1="120" x2="226" y2="120" className="adi-mark" />
          <path d="M96 120 l16 12 l16 -12" className="adi-bug" />
        </svg>

        <div className="login__brand-foot">
          <span className="login__tagline">Profesionales en aviación</span>
          <span className="login__sysline">Sistema de gestión académica y de operaciones</span>
        </div>
      </aside>

      {/* ── Panel de formulario ── */}
      <main className="login__panel">
        <div className="login__form-wrap">
          <div className="login__panel-brand">
            <img src="/logo-caaa-mark.png" alt="CAAA" className="login__panel-logo" />
            <span className="login__wordmark login__wordmark--sm">CAAA</span>
          </div>

          <h1 className="login__title">Iniciar sesión</h1>
          <p className="login__sub">Ingresa con tus credenciales de la academia.</p>

          {reason === "timeout" && (
            <div className="login__notice login__notice--danger">
              Tu sesión se cerró por inactividad.
            </div>
          )}
          {reason === "conflict" && (
            <div className="login__notice login__notice--warn">
              Sesión cerrada: se inició sesión en otro dispositivo.
            </div>
          )}

          <form onSubmit={handleSubmit} className="login__form">
            <div className="login__field">
              <label className="login__label" htmlFor="login-user">Usuario</label>
              <div className="login__control">
                <i className="bi bi-person login__field-icon" />
                <input
                  id="login-user"
                  className="login__input"
                  type="text"
                  placeholder="Ej. u5"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div className="login__field">
              <label className="login__label" htmlFor="login-pass">Contraseña</label>
              <div className="login__control">
                <i className="bi bi-lock login__field-icon" />
                <input
                  id="login-pass"
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
                  <i className={`bi ${showPassword ? "bi-eye-slash" : "bi-eye"}`} />
                </button>
              </div>
            </div>

            <button type="submit" className="login__submit">
              <i className="bi bi-box-arrow-in-right" />
              Ingresar
            </button>
          </form>

          <footer className="login__foot">
            CAAA © {new Date().getFullYear()} · Centro de Adiestramiento Aéreo Académico
          </footer>
        </div>
      </main>
    </div>
  );
}
