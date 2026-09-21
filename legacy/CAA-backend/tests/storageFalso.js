// legacy/CAA-backend/tests/storageFalso.js
/**
 * Supabase Storage de mentira, en un puerto local. Contesta lo justo de la API
 * que usa utils/storage.js (HEAD / GET / POST de objetos y la URL firmada), así
 * las pruebas usan el cliente DE VERDAD (@supabase/storage-js) sin red: lo que
 * se prueba es cómo interpretamos sus errores, que es donde estaban los huecos.
 *
 * No es un archivo de pruebas (no termina en .test.js): lo requieren los que sí.
 *
 * `fallas` fuerza respuestas, la primera que calce gana:
 *   { metodo: "HEAD" | "GET" | "POST" | "POST sign", prefijo, status, body? }
 *   status "cortar" corta la conexión (error de red).
 */
const http = require("http");

async function levantarStorageFalso() {
  const objetos = new Map(); // "bucket/ruta" -> Buffer
  const peticiones = []; // "METODO bucket/ruta", en orden
  const fallas = [];

  const server = http.createServer((req, res) => {
    const partes = [];
    req.on("data", (c) => partes.push(c));
    req.on("end", () => {
      const camino = decodeURIComponent(req.url.split("?")[0]);
      const firmar = camino.startsWith("/storage/v1/object/sign/");
      const clave = camino.replace(/^\/storage\/v1\/object\/(sign\/)?/, "");
      const metodo = `${req.method}${firmar ? " sign" : ""}`;
      peticiones.push(`${metodo} ${clave}`);

      const json = (status, body) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(req.method === "HEAD" ? undefined : JSON.stringify(body));
      };

      const falla = fallas.find((f) => f.metodo === metodo && clave.startsWith(f.prefijo));
      if (falla) {
        if (falla.status === "cortar") return req.socket.destroy();
        return json(falla.status, falla.body || {
          statusCode: String(falla.status), error: "falla", message: "falla forzada",
        });
      }

      if (firmar) return json(200, { signedURL: `/object/sign/${clave}?token=falso` });
      if (req.method === "HEAD") return json(objetos.has(clave) ? 200 : 400, {});
      if (req.method === "GET") {
        if (!objetos.has(clave)) return json(404, { statusCode: "404", error: "not_found", message: "Object not found" });
        res.writeHead(200, { "content-type": "application/pdf" });
        return res.end(objetos.get(clave));
      }
      if (req.method === "POST") {
        if (objetos.has(clave) && req.headers["x-upsert"] !== "true") {
          return json(400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
        }
        objetos.set(clave, Buffer.concat(partes));
        return json(200, { Key: clave, Id: "falso" });
      }
      return json(405, {});
    });
  });

  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    objetos,
    peticiones,
    fallas,
    cerrar: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }),
  };
}

module.exports = { levantarStorageFalso };
