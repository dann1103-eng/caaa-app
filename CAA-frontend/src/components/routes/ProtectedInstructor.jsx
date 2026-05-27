import { Navigate } from "react-router-dom";
import { getSession } from "../../utils/auth";

export default function ProtectedInstructor({ children }) {
  const user = getSession();

  if (!user) return <Navigate to="/login" replace />;
  if (user.rol !== "INSTRUCTOR") return <Navigate to="/" replace />;

  return children;
}
