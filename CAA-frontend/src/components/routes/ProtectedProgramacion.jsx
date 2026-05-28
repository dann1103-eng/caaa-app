import { Navigate } from "react-router-dom";
import { getSession } from "../../utils/auth";

export default function ProtectedProgramacion({ children }) {
  const user = getSession();

  if (!user) return <Navigate to="/login" replace />;
  // ADMIN puede agendar vuelos igual que PROGRAMACION.
  if (!["PROGRAMACION", "ADMIN"].includes(user.rol)) return <Navigate to="/" replace />;

  return children;
}