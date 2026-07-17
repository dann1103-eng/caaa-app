import { Navigate } from "react-router-dom";
import { getSession } from "../../utils/auth";

export default function ProtectedTurno({ children }) {
  const user = getSession();

  if (!user) return <Navigate to="/login" replace />;
  // Un INSTRUCTOR entra si tiene el toggle puede_operaciones (ej. jefe/sub-jefe
  // de instrucción); el backend re-valida contra la BD.
  const esInstructorOperaciones = user.rol === "INSTRUCTOR" && user.puede_operaciones;
  if (user.rol !== "TURNO" && !esInstructorOperaciones) return <Navigate to="/" replace />;

  return children;
}
