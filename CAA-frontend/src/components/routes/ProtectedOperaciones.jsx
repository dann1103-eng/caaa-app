import { Navigate } from "react-router-dom";
import { getSession } from "../../utils/auth";

/**
 * Pantallas de OPERACIONES que viven bajo /admin/* (Dashboard, Agendar vuelos,
 * Cancelaciones, Auditoría).
 *
 * Existe aparte de ProtectedAdmin porque /admin/* mezcla dos secciones distintas
 * del sidebar: Operaciones y Taller. ADMINISTRACION (admin financiero) opera
 * Operaciones igual que ADMIN, pero NO Taller — así que abrir ProtectedAdmin
 * entero le habría dado también el alta/baja de aeronaves y el editor de peso y
 * balance. Taller conserva ProtectedAdmin.
 *
 * El backend re-valida por su cuenta (adminAccess en adminRoutes.js); esto es
 * solo la navegación.
 */
const ROLES_OPERACIONES = ["ADMIN", "ADMINISTRACION"];

export default function ProtectedOperaciones({ children }) {
  const user = getSession();

  if (!user) return <Navigate to="/login" replace />;
  if (!ROLES_OPERACIONES.includes(user.rol)) return <Navigate to="/" replace />;

  return children;
}
