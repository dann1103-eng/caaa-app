import TallerLayout from "./TallerLayout";
import AdminLayout from "../AdminLayout/AdminLayout";

/**
 * Layout para las rutas /taller/* compartidas por dos roles:
 * - ADMIN (super-usuario): usa el shell unificado de 3 secciones (AdminLayout),
 *   para que Taller coexista con Operaciones y Administración sin "saltar" de panel.
 * - TALLER: conserva su propio layout/sidebar enfocado.
 */
export default function TallerLayoutAuto({ children }) {
  let rol = null;
  try {
    rol = JSON.parse(localStorage.getItem("user") || "{}")?.rol ?? null;
  } catch {
    rol = null;
  }
  if (rol === "ADMIN") return <AdminLayout>{children}</AdminLayout>;
  return <TallerLayout>{children}</TallerLayout>;
}
