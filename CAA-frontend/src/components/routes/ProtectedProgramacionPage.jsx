import { Navigate } from "react-router-dom";
import { getSession } from "../../utils/auth";

export default function ProtectedProgramacionPage({ children }) {
  const user = getSession();
  const params = new URLSearchParams(window.location.search);
  const key = params.get("key");
  
  // Si tiene la llave de proyección válida, dejamos pasar sin importar el usuario
  const PROYECCION_KEY = "caaa_proyeccion_secret_2024"; 
  if (key === PROYECCION_KEY) return children;

  if (!user) return <Navigate to="/login" replace />;
  
  // ADMINISTRACION (admin financiero) opera Operaciones igual que ADMIN.
  const rol = user?.rol?.toUpperCase() || "";
  if (!["PROGRAMACION", "ADMIN", "ADMINISTRACION"].includes(rol)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
