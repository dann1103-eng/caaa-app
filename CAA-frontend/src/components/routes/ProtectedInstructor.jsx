import { Navigate, useLocation } from "react-router-dom";
import { getSession } from "../../utils/auth";

export default function ProtectedInstructor({ children }) {
  const user = getSession();
  const location = useLocation();

  if (!user) return <Navigate to="/login" replace />;
  if (user.rol !== "INSTRUCTOR") return <Navigate to="/" replace />;

  const path = location.pathname;
  // Instructor solo-teoría: no entra a las pantallas de vuelo → al aula.
  if (user.es_instructor_vuelo === false && (path === "/instructor" || path === "/instructor/solicitudes")) {
    return <Navigate to="/instructor/aula-virtual" replace />;
  }
  // Instructor solo-vuelo: no entra al aula → a su panel.
  if (user.es_instructor_teoria === false && path === "/instructor/aula-virtual") {
    return <Navigate to="/instructor" replace />;
  }

  return children;
}
