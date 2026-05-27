import { Navigate } from "react-router-dom";
import { getSession } from "../../utils/auth";

export default function ProtectedAlumno({ children }) {
  const user = getSession();

  if (!user) return <Navigate to="/login" replace />;
  if (user.rol !== "ALUMNO") return <Navigate to="/" replace />;

  return children;
}