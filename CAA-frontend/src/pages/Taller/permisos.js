/**
 * Quién es quién dentro del Taller, del lado del navegador.
 *
 * ⚠️ Esto NO es seguridad: los candados de verdad están en las rutas del backend
 * (roleMiddleware con JEFE / WRITE). Acá solo se decide qué controles dibujar,
 * para no ofrecerle a un técnico un botón que le va a devolver 403.
 *
 * Vive en un archivo propio porque lo necesitan tres pantallas —Mi taller, la
 * tarjeta de "El taller ahora" y el detalle de la orden— y tenerlo copiado en
 * cada una es cómo terminan discrepando.
 */
export function esJefeTaller() {
  try {
    const rol = JSON.parse(localStorage.getItem("user") || "{}")?.rol;
    // ADMIN entra como super-usuario, igual que en el resto del módulo.
    return ["TALLER", "ADMIN"].includes(rol);
  } catch {
    return false;
  }
}
