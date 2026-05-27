import { Navigate } from "react-router-dom";
import { getSession } from "../../utils/auth";

export default function ProtectedAdministracion({ children }) {
  const user = getSession();
  if (!user) return <Navigate to="/login" replace />;
  // ADMINISTRACION accede; ADMIN tiene lectura completa también.
  if (user.rol !== "ADMINISTRACION" && user.rol !== "ADMIN") {
    return <Navigate to="/" replace />;
  }
  return children;
}
