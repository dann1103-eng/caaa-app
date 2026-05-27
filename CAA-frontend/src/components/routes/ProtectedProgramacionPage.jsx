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
  
  const rol = user?.rol?.toUpperCase() || "";
  if (rol !== "PROGRAMACION" && rol !== "ADMIN") {
    return <Navigate to="/" replace />;
  }

  return children;
}
