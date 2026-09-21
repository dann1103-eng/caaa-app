/**
 * Sube el PDF directo a Supabase Storage con la URL firmada que dio el backend.
 *
 * XMLHttpRequest y no axios por dos motivos: se ve el progreso (son hasta 70 MB)
 * y NO viaja el token de la app a Supabase (axios se lo agrega a todo).
 */
export function subirAStorage(signedUrl, archivo, onProgreso) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", signedUrl);
    x.setRequestHeader("content-type", "application/pdf");
    x.setRequestHeader("x-upsert", "false");
    x.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgreso?.(e.loaded / e.total);
    };
    x.onload = () => {
      if (x.status >= 200 && x.status < 300) return resolve();
      const texto = x.responseText || "";
      if (x.status === 413 || /maximum allowed size|too large|exceeded/i.test(texto)) {
        const mb = Math.round(archivo.size / 1048576);
        return reject(new Error(
          `El archivo pesa ${mb} MB y pasa el tope por archivo del almacenamiento (50 MB en el plan gratuito de Supabase). Partilo en dos tomos y subí cada uno.`
        ));
      }
      reject(new Error(`No se pudo subir el archivo (${x.status}).`));
    };
    x.onerror = () => reject(new Error("Se cortó la conexión mientras se subía el archivo."));
    x.send(archivo);
  });
}
