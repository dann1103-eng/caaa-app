import AdministracionLayout from "./AdministracionLayout";
import AdminLayout from "../AdminLayout/AdminLayout";

/**
 * Layout para las rutas /administracion/*.
 *
 * ADMIN y ADMINISTRACION usan el mismo shell unificado (AdminLayout): ambos
 * operan Operaciones + Administración, así que necesitan el sidebar por
 * secciones para moverse entre las dos sin "saltar" de panel. AdminSidebar le
 * oculta la sección Taller a quien no sea ADMIN.
 *
 * AdministracionLayout (el shell enfocado de una sola lista) queda como respaldo
 * para cualquier otro rol que llegue acá; hoy ProtectedAdministracion solo deja
 * pasar a esos dos.
 */
export default function AdministracionLayoutAuto({ children }) {
  let rol = null;
  try {
    rol = JSON.parse(localStorage.getItem("user") || "{}")?.rol ?? null;
  } catch {
    rol = null;
  }
  if (rol === "ADMIN" || rol === "ADMINISTRACION") return <AdminLayout>{children}</AdminLayout>;
  return <AdministracionLayout>{children}</AdministracionLayout>;
}
