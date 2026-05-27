import { Navigate } from "react-router-dom";
import { getSession } from "../../utils/auth";

export default function ProtectedAdmin({ children }) {
  const user = getSession();

  if (!user) return <Navigate to="/login" replace />;
  if (user.rol !== "ADMIN") return <Navigate to="/" replace />;

  return children;
}