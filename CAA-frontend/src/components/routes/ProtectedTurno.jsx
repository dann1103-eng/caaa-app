import { Navigate } from "react-router-dom";
import { getSession } from "../../utils/auth";

export default function ProtectedTurno({ children }) {
  const user = getSession();

  if (!user) return <Navigate to="/login" replace />;
  // Un INSTRUCTOR entra si tiene el toggle puede_operaciones (ej. jefe/sub-jefe
  // de instrucción); el backend re-valida contra la BD. ADMIN entra como
  // super-usuario (igual que en Administración/Taller) — p.ej. para publicar
  // avisos del ticker; los gates del backend de /api/turno ya lo permiten.
  // ADMINISTRACION (admin financiero) entra por lo mismo: opera Operaciones
  // completo, igual que ADMIN.
  const esInstructorOperaciones = user.rol === "INSTRUCTOR" && user.puede_operaciones;
  const rolesOperaciones = ["TURNO", "ADMIN", "ADMINISTRACION"];
  if (!rolesOperaciones.includes(user.rol) && !esInstructorOperaciones) return <Navigate to="/" replace />;

  return children;
}
