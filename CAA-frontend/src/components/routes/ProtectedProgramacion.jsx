import { Navigate } from "react-router-dom";
import { getSession } from "../../utils/auth";

export default function ProtectedProgramacion({ children }) {
  const user = getSession();

  if (!user) return <Navigate to="/login" replace />;
  // ADMIN puede agendar vuelos igual que PROGRAMACION; un INSTRUCTOR entra si
  // tiene el toggle puede_programar (el backend re-valida contra la BD).
  const esInstructorProgramador = user.rol === "INSTRUCTOR" && user.puede_programar;
  if (!["PROGRAMACION", "ADMIN"].includes(user.rol) && !esInstructorProgramador) {
    return <Navigate to="/" replace />;
  }

  return children;
}