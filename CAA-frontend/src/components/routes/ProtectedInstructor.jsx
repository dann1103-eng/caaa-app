import { Navigate, useLocation } from "react-router-dom";
import { getSession } from "../../utils/auth";

export default function ProtectedInstructor({ children }) {
  const user = getSession();
  const location = useLocation();

  if (!user) return <Navigate to="/login" replace />;
  if (user.rol !== "INSTRUCTOR") return <Navigate to="/" replace />;

  const path = location.pathname;
  // Instructor solo-teoría: no entra a solicitudes de vuelo (no aplica).
  // Sí entra a /instructor: ahí gestiona "Mis alumnos asignados" y asigna
  // el instructor de vuelo real de cada uno (rol de cabecera).
  if (user.es_instructor_vuelo === false && path === "/instructor/solicitudes") {
    return <Navigate to="/instructor/aula-virtual" replace />;
  }
  // Instructor solo-vuelo: no entra al aula → a su panel.
  if (user.es_instructor_teoria === false && path === "/instructor/aula-virtual") {
    return <Navigate to="/instructor" replace />;
  }

  return children;
}
