import { Navigate } from "react-router-dom";
import { getSession } from "../../utils/auth";

export default function ProtectedTaller({ children }) {
  const user = getSession();
  if (!user) return <Navigate to="/login" replace />;
  // TALLER accede; ADMIN tiene acceso como super-usuario (igual que en Administración).
  if (user.rol !== "TALLER" && user.rol !== "ADMIN") {
    return <Navigate to="/" replace />;
  }
  return children;
}
