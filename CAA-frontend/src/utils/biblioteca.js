// La biblioteca de la escuela: una carpeta con documentos (hoy, un Google Drive)
// a la que se llega desde un botón del sistema.
//
// El enlace es de CADA escuela, así que vive en marca.json (`biblioteca_url`) y
// no acá. La cuenta de demostraciones usa otra marca, que no lo trae: un
// prospecto no tiene que terminar en el Drive de la escuela.
//
// La ven todos menos el taller (el jefe y los mecánicos): es material de
// estudio y de operación de vuelo, y ellos tienen sus manuales en su módulo.
const ROLES_SIN_BIBLIOTECA = ["TALLER", "TECNICO"];

/**
 * El enlace a la biblioteca para este usuario, o null si no le corresponde
 * verla o la marca no tiene una.
 *
 * `url` se pasa desde afuera (`MARCA.biblioteca_url`, leído en cada render y no
 * guardado en una constante: la marca cambia con la sesión). Solo se acepta un
 * enlace web: lo que venga mal escrito en marca.json no llega a un `href`.
 */
export function bibliotecaPara(user, url) {
  const rol = String(user?.rol || "").toUpperCase();
  if (!rol || ROLES_SIN_BIBLIOTECA.includes(rol)) return null;
  const enlace = String(url || "").trim();
  return /^https?:\/\//i.test(enlace) ? enlace : null;
}
