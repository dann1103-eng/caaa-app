import { Navigate } from "react-router-dom";
import { getSession } from "../../utils/auth";

export default function ProtectedTaller({ children }) {
  const user = getSession();
  if (!user) return <Navigate to="/login" replace />;
  // TALLER (jefe de taller) y TECNICO (mecánico de piso) acceden; ADMIN entra
  // como super-usuario, igual que en Administración.
  if (!["TALLER", "TECNICO", "ADMIN"].includes(user.rol)) {
    return <Navigate to="/" replace />;
  }
  return children;
}
