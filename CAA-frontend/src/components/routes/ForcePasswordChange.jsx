import { Navigate, useLocation } from "react-router-dom";

export default function ForcePasswordChange({ children }) {
  const location = useLocation();

  const token = localStorage.getItem("token");
  const raw = localStorage.getItem("user");
  if (!token || !raw) return children;

  let user = null;
  try {
    user = JSON.parse(raw);
  } catch {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    return <Navigate to="/login" replace />;
  }

  const mustCompleteProfile = user?.must_complete_profile;

  if (mustCompleteProfile && location.pathname !== "/perfil") {
    return <Navigate to="/perfil" replace />;
  }

  return children;
}