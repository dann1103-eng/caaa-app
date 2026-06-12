import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import ConfirmDataModal from "../ConfirmDataModal/ConfirmDataModal";

/**
 * Robapantallas de primer login. Si el usuario tiene `must_complete_profile`
 * (cambio de contraseña/correo inicial y/o confirmación de datos generales para
 * alumnos e instructores), renderiza un modal bloqueante encima del home en vez
 * de mostrar la app. Al confirmar, refresca el token y se desmonta.
 */
export default function ForcePasswordChange({ children }) {
  const location = useLocation();
  const [bump, setBump] = useState(0); // fuerza re-render tras confirmar

  const token = localStorage.getItem("token");
  const raw = localStorage.getItem("user");
  if (!token || !raw) return children;

  let user = null;
  try {
    user = JSON.parse(raw);
  } catch {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    return <Navigate to="/login" replace />;
  }

  // En /perfil no mostramos el modal (la persona puede gestionar su perfil ahí).
  if (user?.must_complete_profile && location.pathname !== "/perfil") {
    return <ConfirmDataModal key={bump} user={user} onDone={() => setBump((n) => n + 1)} />;
  }

  return children;
}
