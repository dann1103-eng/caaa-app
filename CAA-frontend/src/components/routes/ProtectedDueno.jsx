import { Navigate } from "react-router-dom";
import { getSession } from "../../utils/auth";

export default function ProtectedDueno({ children }) {
  const user = getSession();
  if (!user) return <Navigate to="/login" replace />;
  // DUENO accede; ADMIN tiene acceso como super-usuario (igual que en Taller/Administración).
  if (user.rol !== "DUENO" && user.rol !== "ADMIN") {
    return <Navigate to="/" replace />;
  }
  return children;
}
