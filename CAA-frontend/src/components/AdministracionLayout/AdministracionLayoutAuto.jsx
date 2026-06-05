import AdministracionLayout from "./AdministracionLayout";
import AdminLayout from "../AdminLayout/AdminLayout";

/**
 * Layout para las rutas /administracion/* compartidas por dos roles:
 * - ADMIN (super-usuario): usa el shell unificado de 3 secciones (AdminLayout)
 *   para que todo coexista bajo el mismo sidebar, sin "saltar" de panel.
 * - ADMINISTRACION: conserva su propio layout/sidebar enfocado.
 */
export default function AdministracionLayoutAuto({ children }) {
  let rol = null;
  try {
    rol = JSON.parse(localStorage.getItem("user") || "{}")?.rol ?? null;
  } catch {
    rol = null;
  }
  if (rol === "ADMIN") return <AdminLayout>{children}</AdminLayout>;
  return <AdministracionLayout>{children}</AdministracionLayout>;
}
