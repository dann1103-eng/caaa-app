# Manuales del taller — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el taller vea e imprima los manuales de los aviones desde la plataforma, que el jefe arme qué páginas acompañan cada inspección (25/50/100/anual), y que cualquier orden de trabajo pueda sumar páginas propias.

**Architecture:** Los PDF viven una sola vez en un bucket privado de Supabase Storage. El navegador los lee con pdf.js pidiendo **solo los rangos de bytes que necesita** (transporte propio, porque Supabase no expone `Accept-Ranges` por CORS). Para imprimir, el backend corta las páginas con `pdf-lib` (quitando `/Annots`, que arrastraban el manual entero) y guarda el resultado con un nombre derivado de su contenido para reutilizarlo. Los rangos viven en dos tablas: una para los paquetes (configuración) y otra para las órdenes (operación).

**Tech Stack:** Node/Express + `pg` + `pdf-lib` 1.17 + `@supabase/supabase-js` (Storage) · React 19 + Vite + `pdfjs-dist` 4.10.38 · PostgreSQL (Supabase) · Python 3.11 + PyMuPDF + requests (solo la carga inicial) · `node:test` (sin dependencias nuevas de test).

**Spec:** `docs/superpowers/specs/2026-09-20-manuales-taller-design.md` — leerla antes de empezar.

---

## Contexto que el ejecutor necesita (leer una vez)

- **Worktree:** `C:\Users\Daniel\Desktop\CAAA modulo op+admin\.claude\worktrees\maintenance-manuals-config-eb31a7` (rama `claude/maintenance-manuals-config-eb31a7`). Todos los caminos de abajo son relativos a esa carpeta.
- **Backend local:** `legacy/CAA-backend/` ya tiene `node_modules` y un `.env` (gitignored) con las credenciales de la BASE. **No** tiene las de Storage: esas viven solo en Railway. Todo lo que toque Storage se corre con `railway run …` desde `legacy/CAA-backend` (el worktree ya está enlazado con `railway link`). `railway run` inyecta las variables de producción **sin imprimirlas**. Nunca correr `railway variables`.
- **La base es producción** (Supabase). Toda prueba limpia lo que crea. El avión de pruebas es **`ZZ-PRUEBA`** (externo, fuera de los selectores de vuelo).
- **Usuarios de prueba** (password `demo123`): `u_taller` = jefe (rol TALLER), `u_mecanico` = mecánico (rol TECNICO, licencia TMA 001, puede firmar). Loguearse con un script rota su sesión (sesión única): es normal.
- **Scripts de verificación:** en `legacy/CAA-backend/` todo `_*.js` está en `.gitignore`. Ahí van los E2E.
- **Errores en controllers:** envolver en `catchAsync`; para errores esperados lanzar `new AppError(mensaje, status)` (`utils/appError.js`) — el middleware global responde `{message}` con ese status. Un error sin `isOperational` sale como 500.
- **Zona horaria:** columnas `timestamp` sin zona. Todo valor "ahora" se escribe como `(NOW() AT TIME ZONE 'America/El_Salvador')` (CLAUDE.md §35.A).
- **Commits:** mensaje en archivo y `git commit -F <archivo>`; terminar con `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Cambio deliberado respecto de la spec §10:** el `sha256` y las páginas de un manual subido los calcula el **servidor** (baja el archivo una vez desde Storage y lo abre con pdf-lib, de a uno por vez), no el navegador. Así no se confía en lo que diga el cliente y de paso se detecta un PDF cifrado o roto antes de registrarlo. La subida en sí sigue yendo directo del navegador a Storage. La spec ya lo refleja.
- **Spike ya hecho (2026-09-21):** una URL firmada de Supabase contesta `Range` con **206** y `access-control-allow-origin: *`, el preflight permite `range`, pero **no expone `Accept-Ranges`** → pdf.js por sí solo bajaría el archivo entero. Por eso `PDFDataRangeTransport` (Task 10). Una subida con `upsert:false` sobre un objeto existente da **409 "The resource already exists"**. `createSignedUploadUrl` funciona.

## Mapa de archivos

**Backend (`legacy/CAA-backend/`)**
| Archivo | Qué hace |
|---|---|
| `package.json` | + `pdf-lib`, + script `test` |
| `utils/storage.js` | + `upsert` opcional en `subirArchivo`, + `descargarArchivo`, `existeArchivo`, `urlSubidaFirmada`, `BUCKETS.MANUALES` |
| `utils/aeronaveUtils.js` | exportar `derivarTipoRevision` (ya existe, no se exportaba) |
| `utils/pdfExtractos.js` (nuevo) | puro: validar rangos, clave de caché, analizar un PDF, armar el PDF, cola de uno en uno |
| `utils/manualesReglas.js` (nuevo) | puro: tipos de paquete, qué inspección es una orden, quién es "mecánico de la orden" |
| `services/manualesService.js` (nuevo) | base + Storage: extractos de una orden, congelar al firmar, PDF con caché |
| `controllers/taller/manualController.js` (nuevo) | biblioteca: listar, detalle, URL, subir, revisión, editar, borrar, imprimir rango |
| `controllers/taller/paqueteManualController.js` (nuevo) | tabla de paquetes, detalle, guardar |
| `controllers/taller/ordenManualController.js` (nuevo) | páginas de una orden: listar, agregar, traer paquete, quitar, PDF |
| `controllers/taller/ordenTrabajoController.js` | `firmarOrden` congela el paquete |
| `routes/tallerRoutes.js` | rutas nuevas |
| `demo/catalogo.js`, `demo/reset.js` | tablas nuevas en `CATALOGO` y `CONSERVAR` |
| `tests/*.test.js` (nuevo) | pruebas puras con `node:test` |

**Frontend (`CAA-frontend/`)**
| Archivo | Qué hace |
|---|---|
| `package.json` | + `pdfjs-dist@4.10.38` |
| `src/services/manualesApi.js` (nuevo) | cliente HTTP + abrir PDF firmado sin que lo bloquee el navegador |
| `src/pages/Taller/manuales/pdfjs.js` (nuevo) | carga perezosa de pdf.js + apertura por rangos |
| `src/pages/Taller/manuales/formatoManual.js` (nuevo) | etiquetas y formateo |
| `src/pages/Taller/manuales/subirManual.js` (nuevo) | subida directa a Storage con progreso |
| `src/pages/Taller/manuales/VisorManual.jsx` (nuevo) | el visor único |
| `src/pages/Taller/manuales/VisorManualModal.jsx` (nuevo) | el visor en un modal |
| `src/pages/Taller/manuales/manuales.css` (nuevo) | estilos del módulo |
| `src/pages/Taller/manuales/Biblioteca.jsx` (nuevo) | lista de manuales |
| `src/pages/Taller/manuales/ManualFormModal.jsx` (nuevo) | subir / revisión / editar |
| `src/pages/Taller/manuales/Paquetes.jsx` (nuevo) | tabla aviones × inspecciones |
| `src/pages/Taller/manuales/PaqueteEditor.jsx` (nuevo) | editor de un paquete |
| `src/pages/Taller/Manuales.jsx` (nuevo) | página con pestañas |
| `src/pages/Taller/ordenes/ManualesOrdenModal.jsx` (nuevo) | "Manuales de este trabajo" |
| `src/pages/Taller/MiTaller.jsx`, `ordenes/OrdenDetalleModal.jsx` | botón que abre el modal |
| `src/App.jsx`, `components/TallerSidebar/TallerSidebar.jsx`, `components/AdminSidebar/AdminSidebar.jsx` | ruta y menú |

**Base y carga**
| Archivo | Qué hace |
|---|---|
| `supabase/migrations/20260921000001_manuales_taller.sql` (nuevo) | 5 tablas + bucket |
| `supabase/dump/manuales_taller/comun.py` (nuevo) | lectura del ZIP compartida |
| `supabase/dump/manuales_taller/preparar.py` (nuevo) | inventario del ZIP |
| `supabase/dump/manuales_taller/verificar_rangos.py` (nuevo) | lee las páginas de los rangos sugeridos |
| `supabase/dump/manuales_taller/catalogo.json` (nuevo, curado) | títulos, tipos, aviones, paquetes sugeridos |
| `supabase/dump/manuales_taller/subir.py` (nuevo) | sube a Storage |
| `supabase/dump/manuales_taller/cargar.js` (nuevo) | registra en la base |

---

## Task 1: Migración — tablas y bucket

**Files:**
- Create: `supabase/migrations/20260921000001_manuales_taller.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- Manuales del taller: biblioteca, paquetes por inspección y páginas por orden.
-- Spec: docs/superpowers/specs/2026-09-20-manuales-taller-design.md
--
-- ADITIVA y re-ejecutable. Sin índices extra: son tablas de cientos de filas.
-- Todo "creado_en" lleva la zona FIJADA en el DEFAULT (CLAUDE.md §35.A).

BEGIN;

CREATE TABLE IF NOT EXISTS public.taller_manual (
  id_manual             SERIAL PRIMARY KEY,
  titulo                VARCHAR(200) NOT NULL,
  categoria             VARCHAR(20)  NOT NULL CHECK (categoria IN
                          ('MANTENIMIENTO','PARTES','OVERHAUL','OPERACION','BOLETINES','NORMATIVA','CATALOGO')),
  fabricante            VARCHAR(80),
  numero_parte          VARCHAR(40),
  revision              VARCHAR(80),
  paginas               INTEGER NOT NULL CHECK (paginas > 0),
  tamano_bytes          BIGINT  NOT NULL,
  sha256                CHAR(64) NOT NULL UNIQUE,
  archivo_path          TEXT NOT NULL,
  es_general            BOOLEAN NOT NULL DEFAULT false,
  estado                VARCHAR(12) NOT NULL DEFAULT 'VIGENTE'
                          CHECK (estado IN ('VIGENTE','REEMPLAZADO','ARCHIVADO')),
  id_reemplazado_por    INTEGER NULL REFERENCES public.taller_manual(id_manual),
  necesita_confirmacion BOOLEAN NOT NULL DEFAULT false,
  nota_confirmacion     TEXT,
  origen                VARCHAR(40),
  subido_por            INTEGER NULL REFERENCES public.usuario(id_usuario),
  creado_en             TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/El_Salvador')
);

CREATE TABLE IF NOT EXISTS public.taller_manual_aeronave (
  id_manual   INTEGER NOT NULL REFERENCES public.taller_manual(id_manual) ON DELETE CASCADE,
  id_aeronave INTEGER NOT NULL REFERENCES public.aeronave(id_aeronave),
  PRIMARY KEY (id_manual, id_aeronave)
);

CREATE TABLE IF NOT EXISTS public.taller_paquete_manual (
  id_paquete         SERIAL PRIMARY KEY,
  id_aeronave        INTEGER NOT NULL REFERENCES public.aeronave(id_aeronave),
  tipo_mantenimiento VARCHAR(10) NOT NULL CHECK (tipo_mantenimiento IN ('25HR','50HR','100HR','ANUAL')),
  estado             VARCHAR(12) NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR','CONFIRMADO')),
  confirmado_por     INTEGER NULL REFERENCES public.usuario(id_usuario),
  confirmado_en      TIMESTAMP,
  actualizado_por    INTEGER NULL REFERENCES public.usuario(id_usuario),
  actualizado_en     TIMESTAMP,
  UNIQUE (id_aeronave, tipo_mantenimiento)
);

-- Dos tablas con la misma forma, y no una con "paquete O orden": los renglones
-- de un paquete son configuración (sobreviven al reinicio del demo) y los de una
-- orden son operación (se vacían). Una sola tabla con un CHECK de "uno u otro"
-- abortaba el reinicio del demo (spec §12).
CREATE TABLE IF NOT EXISTS public.taller_paquete_extracto (
  id_extracto  SERIAL PRIMARY KEY,
  id_paquete   INTEGER NOT NULL REFERENCES public.taller_paquete_manual(id_paquete) ON DELETE CASCADE,
  id_manual    INTEGER NOT NULL REFERENCES public.taller_manual(id_manual),
  pagina_desde INTEGER NOT NULL CHECK (pagina_desde >= 1),
  pagina_hasta INTEGER NOT NULL,
  titulo       VARCHAR(200),
  orden        SMALLINT NOT NULL DEFAULT 0,
  origen       VARCHAR(10) NOT NULL CHECK (origen IN ('MANUAL','SUGERIDO')),
  agregado_por INTEGER NULL REFERENCES public.usuario(id_usuario),
  creado_en    TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/El_Salvador'),
  CHECK (pagina_hasta >= pagina_desde)
);

CREATE TABLE IF NOT EXISTS public.taller_orden_extracto (
  id_extracto  SERIAL PRIMARY KEY,
  id_orden     INTEGER NOT NULL REFERENCES public.orden_trabajo(id_orden),
  id_manual    INTEGER NOT NULL REFERENCES public.taller_manual(id_manual),
  pagina_desde INTEGER NOT NULL CHECK (pagina_desde >= 1),
  pagina_hasta INTEGER NOT NULL,
  titulo       VARCHAR(200),
  orden        SMALLINT NOT NULL DEFAULT 0,
  origen       VARCHAR(10) NOT NULL CHECK (origen IN ('MANUAL','PAQUETE')),
  agregado_por INTEGER NULL REFERENCES public.usuario(id_usuario),
  creado_en    TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/El_Salvador'),
  CHECK (pagina_hasta >= pagina_desde)
);

-- Bucket privado, sin tope propio (manda el global del plan de Supabase).
INSERT INTO storage.buckets (id, name, public)
VALUES ('manuales-taller', 'manuales-taller', false)
ON CONFLICT (id) DO NOTHING;

COMMIT;
```

- [ ] **Step 2: Aplicarla en Supabase**

Run (desde `legacy/CAA-backend`): `node run-sql.js "../../supabase/migrations/20260921000001_manuales_taller.sql"`
Expected: termina sin error. Si el clasificador de auto-mode lo bloquea, pedir autorización a Daniel (es aditiva y ya aprobada en la spec).

- [ ] **Step 3: Verificar**

Run: `node query.js "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name LIKE 'taller_%manual%' OR table_name LIKE 'taller_%extracto') ORDER BY 1"` y `node query.js "SELECT id, public FROM storage.buckets WHERE id='manuales-taller'"`
Expected: `taller_manual`, `taller_manual_aeronave`, `taller_orden_extracto`, `taller_paquete_extracto`, `taller_paquete_manual`; bucket `manuales-taller` con `public: false`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260921000001_manuales_taller.sql
git commit -F <msg>   # "feat(taller): tablas y bucket de manuales"
```

---

## Task 2: Dependencias y utilidades de Storage

**Files:**
- Modify: `legacy/CAA-backend/package.json`
- Modify: `legacy/CAA-backend/utils/storage.js`
- Modify: `legacy/CAA-backend/utils/aeronaveUtils.js:237-240`

- [ ] **Step 1: Instalar pdf-lib y agregar el script de test**

Run (desde `legacy/CAA-backend`): `npm install pdf-lib@^1.17.1 --save`
Luego en `package.json`, dentro de `"scripts"`, agregar:

```json
    "test": "node --test tests/*.test.js"
```

- [ ] **Step 2: Extender `utils/storage.js`**

Reemplazar la función `subirArchivo` y el objeto `BUCKETS`, y agregar tres funciones antes del `module.exports`:

```js
/**
 * Sube un buffer a un bucket. Devuelve la ruta del objeto (lo que se guarda en
 * la columna archivo_path).
 *
 * `upsert` sigue en true por defecto para no cambiarle nada a quien ya la usa.
 * Los manuales la llaman con `upsert: false`: la app NUNCA pisa un manual
 * (spec 2026-09-20 §5). Un "ya existe" sale con `statusCode = 409`.
 */
async function subirArchivo(bucket, ruta, buffer, contentType, { upsert = true } = {}) {
  const { error } = await getClient()
    .storage.from(bucket)
    .upload(ruta, buffer, { contentType: contentType || "application/octet-stream", upsert });
  if (error) {
    const e = new Error(`Error subiendo a storage: ${error.message}`);
    e.statusCode = Number(error.statusCode || error.status) || null;
    throw e;
  }
  return ruta;
}

/** Baja un objeto entero a memoria (Buffer). */
async function descargarArchivo(bucket, ruta) {
  const { data, error } = await getClient().storage.from(bucket).download(ruta);
  if (error) throw new Error(`Error bajando de storage: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

/** ¿Existe el objeto? Cualquier error cuenta como "no". */
async function existeArchivo(bucket, ruta) {
  const { data, error } = await getClient().storage.from(bucket).exists(ruta);
  return !error && !!data;
}

/**
 * Permiso temporal (2 h) para que el NAVEGADOR suba directo a Storage, sin pasar
 * el archivo por el backend. Sin upsert: no puede pisar nada.
 */
async function urlSubidaFirmada(bucket, ruta) {
  const { data, error } = await getClient().storage.from(bucket).createSignedUploadUrl(ruta, { upsert: false });
  if (error) throw new Error(`Error preparando la subida: ${error.message}`);
  return data; // { signedUrl, token, path }
}

const BUCKETS = {
  DOCUMENTOS: "documentos-alumno",
  ARCHIVOS: "caaa-archivos",
  MANUALES: "manuales-taller",
};

module.exports = {
  getClient, storageDisponible, subirArchivo, urlFirmada, borrarArchivo,
  descargarArchivo, existeArchivo, urlSubidaFirmada, BUCKETS,
};
```

- [ ] **Step 3: Exportar `derivarTipoRevision`**

En `utils/aeronaveUtils.js`, reemplazar el `module.exports` final por:

```js
module.exports = {
  actualizarHorasAeronave,
  syncProximaRevisionAeronave,
  // Lo usan los manuales del taller para saber qué inspección es una orden
  // (spec 2026-09-20 §7). Se exporta en vez de copiar el mapa.
  derivarTipoRevision,
};
```

- [ ] **Step 4: Verificar que el backend sigue cargando**

Run: `node -e "require('./utils/storage'); require('./utils/aeronaveUtils'); console.log(typeof require('./utils/aeronaveUtils').derivarTipoRevision)"`
Expected: `function`

- [ ] **Step 5: Commit**

```bash
git add legacy/CAA-backend/package.json legacy/CAA-backend/package-lock.json legacy/CAA-backend/utils/storage.js legacy/CAA-backend/utils/aeronaveUtils.js
git commit -F <msg>   # "feat(taller): pdf-lib y utilidades de Storage para manuales"
```

---

## Task 3: `utils/pdfExtractos.js` (TDD)

**Files:**
- Create: `legacy/CAA-backend/tests/pdfExtractos.test.js`
- Create: `legacy/CAA-backend/utils/pdfExtractos.js`

- [ ] **Step 1: Escribir las pruebas**

```js
// legacy/CAA-backend/tests/pdfExtractos.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { PDFDocument, PDFName } = require("pdf-lib");
const {
  validarRango, claveExtractos, armarPdf, analizarPdf, paginasDe,
} = require("../utils/pdfExtractos");

/**
 * Manual de juguete: N páginas cuyo ANCHO dice qué página es (base+1, base+2…),
 * así se comprueba qué páginas salieron y en qué orden. La 1 lleva un link a la
 * última, y la última carga 300 KB que no se comprimen: si el link se copiara,
 * el PDF resultante pesaría eso (es el defecto medido en el service manual del
 * Cherokee: 20 páginas pesaban 14.8 MB).
 */
async function manualDePrueba(n, base = 200) {
  const doc = await PDFDocument.create();
  const paginas = [];
  for (let i = 1; i <= n; i++) paginas.push(doc.addPage([base + i, 300]));
  const ultima = paginas[n - 1];
  const pesado = doc.context.register(doc.context.stream(crypto.randomBytes(300000)));
  ultima.node.setXObject(PDFName.of("Pesado"), pesado);
  const link = doc.context.register(doc.context.obj({
    Type: "Annot", Subtype: "Link", Rect: [0, 0, 10, 10], Border: [0, 0, 0], Dest: [ultima.ref, "Fit"],
  }));
  paginas[0].node.set(PDFName.of("Annots"), doc.context.obj([link]));
  return doc.save();
}
const anchos = async (bytes) =>
  (await PDFDocument.load(bytes)).getPages().map((p) => Math.round(p.getWidth()));

test("validarRango acepta un rango dentro del manual", () => {
  assert.equal(validarRango(3, 5, 10), null);
  assert.equal(validarRango("3", "3", 10), null);
});
test("validarRango rechaza desde > hasta", () => {
  assert.match(validarRango(5, 3, 10), /no puede ser menor/);
});
test("validarRango rechaza pasar del total", () => {
  assert.match(validarRango(1, 11, 10), /tiene 10 páginas/);
});
test("validarRango rechaza página 0, vacíos y no-enteros", () => {
  assert.match(validarRango(0, 2, 10), /1 o más/);
  assert.match(validarRango("x", 2, 10), /enteros/);
  assert.match(validarRango(1.5, 2, 10), /enteros/);
  assert.match(validarRango("", 2, 10), /enteros/);
  assert.match(validarRango(null, 2, 10), /enteros/);
});
test("claveExtractos depende del contenido y del orden", () => {
  const a = { sha256: "a".repeat(64), pagina_desde: 1, pagina_hasta: 2 };
  const b = { sha256: "b".repeat(64), pagina_desde: 5, pagina_hasta: 5 };
  assert.equal(claveExtractos([a, b]), claveExtractos([{ ...a, titulo: "x" }, { ...b }]));
  assert.notEqual(claveExtractos([a, b]), claveExtractos([b, a]));
  assert.match(claveExtractos([a]), /^[0-9a-f]{64}$/);
});
test("paginasDe suma los rangos", () => {
  assert.equal(paginasDe([{ pagina_desde: 3, pagina_hasta: 4 }, { pagina_desde: 1, pagina_hasta: 1 }]), 3);
});
test("armarPdf saca exactamente las páginas pedidas, en el orden pedido", async () => {
  const fuentes = new Map([["m", await manualDePrueba(10)]]);
  const out = await armarPdf([
    { sha256: "m", pagina_desde: 3, pagina_hasta: 4 },
    { sha256: "m", pagina_desde: 1, pagina_hasta: 1 },
  ], fuentes);
  assert.deepEqual(await anchos(out), [203, 204, 201]);
});
test("armarPdf junta páginas de dos manuales", async () => {
  const fuentes = new Map([["a", await manualDePrueba(5, 200)], ["b", await manualDePrueba(5, 400)]]);
  const out = await armarPdf([
    { sha256: "b", pagina_desde: 2, pagina_hasta: 2 },
    { sha256: "a", pagina_desde: 5, pagina_hasta: 5 },
  ], fuentes);
  assert.deepEqual(await anchos(out), [402, 205]);
});
test("armarPdf no arrastra la página a la que apunta un link", async () => {
  const fuentes = new Map([["m", await manualDePrueba(10)]]);
  const out = await armarPdf([{ sha256: "m", pagina_desde: 1, pagina_hasta: 1 }], fuentes);
  assert.ok(out.length < 50000, `pesa ${out.length} bytes: se colaron los 300 KB de la página del link`);
});
test("armarPdf avisa si falta el archivo de un manual", async () => {
  await assert.rejects(
    armarPdf([{ sha256: "zz", pagina_desde: 1, pagina_hasta: 1 }], new Map()),
    /Falta el archivo/
  );
});
test("analizarPdf da la huella y las páginas", async () => {
  const bytes = await manualDePrueba(7);
  const r = await analizarPdf(Buffer.from(bytes));
  assert.equal(r.paginas, 7);
  assert.equal(r.sha256, crypto.createHash("sha256").update(Buffer.from(bytes)).digest("hex"));
});
test("analizarPdf rechaza lo que no es un PDF", async () => {
  const r = await analizarPdf(Buffer.from("esto no es un pdf"));
  assert.match(r.error, /no es un PDF/);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run (desde `legacy/CAA-backend`): `npm test`
Expected: FAIL — `Cannot find module '../utils/pdfExtractos'`.

- [ ] **Step 3: Implementar**

```js
// legacy/CAA-backend/utils/pdfExtractos.js
/**
 * Armado de PDFs con páginas sueltas de los manuales del taller.
 *
 * Puro: recibe los bytes de cada manual y la lista de extractos, y devuelve los
 * bytes del PDF resultante. No sabe nada de la base ni de Storage, así se prueba
 * sin red (tests/pdfExtractos.test.js).
 *
 * Spec: docs/superpowers/specs/2026-09-20-manuales-taller-design.md §6
 */
const crypto = require("crypto");
const { PDFDocument, PDFName } = require("pdf-lib");

/**
 * 🚨 Llaves que se le quitan a cada página ANTES de copiarla.
 *
 * Los manuales traen links internos (/Annots con /Dest a otras páginas) y
 * pdf-lib los sigue al copiar: arrastra la página destino, sus imágenes y de ahí
 * el manual entero. Medido: 20 páginas del service manual del Cherokee pesaban
 * 14.8 MB; sin las anotaciones, 0.84 MB. En un PDF para imprimir los links no
 * sirven de nada.
 */
const LLAVES_QUE_ARRASTRAN = ["Annots", "Thumb", "B", "StructParents", "PieceInfo"];

/** Tope por PDF: protege la memoria del servidor (~350 MB medidos por manual grande). */
const MAX_PAGINAS = 600;

const entero = (v) => {
  if (v === null || v === undefined || v === "") return NaN;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
};

/** Mensaje de error si el rango no sirve para un manual de `paginas` páginas; null si está bien. */
function validarRango(desde, hasta, paginas) {
  const d = entero(desde);
  const h = entero(hasta);
  if (Number.isNaN(d) || Number.isNaN(h)) return "Las páginas tienen que ser números enteros";
  if (d < 1) return "La página inicial tiene que ser 1 o más";
  if (h < d) return `La página final (${h}) no puede ser menor que la inicial (${d})`;
  if (h > paginas) return `El manual tiene ${paginas} páginas: no existe la ${h}`;
  return null;
}

const paginasDe = (extractos) =>
  extractos.reduce((s, e) => s + (Number(e.pagina_hasta) - Number(e.pagina_desde) + 1), 0);

/**
 * Nombre del PDF armado: depende SOLO de lo pedido. Mismo manual (por su
 * sha256), mismas páginas, mismo orden → mismo archivo. Por eso se reutiliza
 * entre personas, entre órdenes y entre producción y el demo.
 */
function claveExtractos(extractos) {
  const firma = extractos.map((e) => [e.sha256, Number(e.pagina_desde), Number(e.pagina_hasta)]);
  return crypto.createHash("sha256").update(JSON.stringify(firma)).digest("hex");
}

/**
 * Huella y páginas de un PDF recién subido. Lo lee el SERVIDOR, no se confía en
 * lo que diga el navegador. Devuelve {sha256, paginas} o {error}.
 */
async function analizarPdf(bytes) {
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  let doc;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  } catch {
    return { error: "El archivo no es un PDF que se pueda leer." };
  }
  if (doc.isEncrypted) {
    return { error: "El PDF está protegido o cifrado. Guardalo de nuevo sin protección y volvé a subirlo." };
  }
  return { sha256, paginas: doc.getPageCount() };
}

/**
 * @param {Array<{sha256:string, pagina_desde:number, pagina_hasta:number}>} extractos en el orden a imprimir
 * @param {Map<string, Uint8Array|Buffer>} fuentes bytes de cada manual, por sha256
 * @returns {Promise<Uint8Array>}
 */
async function armarPdf(extractos, fuentes) {
  if (!extractos.length) throw new Error("No hay páginas para armar");
  const salida = await PDFDocument.create();
  const abiertos = new Map();
  for (const e of extractos) {
    let src = abiertos.get(e.sha256);
    if (!src) {
      const bytes = fuentes.get(e.sha256);
      if (!bytes) throw new Error(`Falta el archivo del manual ${String(e.sha256).slice(0, 12)}`);
      src = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
      if (src.isEncrypted) throw new Error("Un manual está cifrado: hay que volver a subirlo sin protección");
      abiertos.set(e.sha256, src);
    }
    const indices = [];
    for (let p = Number(e.pagina_desde); p <= Number(e.pagina_hasta); p++) indices.push(p - 1);
    for (const i of indices) {
      const nodo = src.getPage(i).node;
      for (const k of LLAVES_QUE_ARRASTRAN) nodo.delete(PDFName.of(k));
    }
    const copias = await salida.copyPages(src, indices);
    copias.forEach((pg) => salida.addPage(pg));
  }
  return salida.save({ useObjectStreams: true });
}

/**
 * Cola de uno en uno para lo que carga un manual entero en memoria (armar un
 * PDF, analizar una subida): dos a la vez de manuales grandes podrían tumbar el
 * proceso en Railway.
 */
let cola = Promise.resolve();
function enCola(fn) {
  const turno = cola.then(() => fn(), () => fn());
  cola = turno.catch(() => {});
  return turno;
}

module.exports = {
  validarRango, claveExtractos, analizarPdf, armarPdf, enCola, paginasDe,
  MAX_PAGINAS, LLAVES_QUE_ARRASTRAN,
};
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npm test`
Expected: PASS, 12 pruebas.

- [ ] **Step 5: Comprobar que la prueba del link de verdad detecta el defecto**

Comentar temporalmente la línea `for (const k of LLAVES_QUE_ARRASTRAN) nodo.delete(PDFName.of(k));`, correr `npm test`, confirmar que falla `armarPdf no arrastra la página a la que apunta un link` con `pesa ~300000 bytes`, y **restaurar la línea**. Correr `npm test` otra vez: PASS.

- [ ] **Step 6: Commit**

```bash
git add legacy/CAA-backend/utils/pdfExtractos.js legacy/CAA-backend/tests/pdfExtractos.test.js
git commit -F <msg>   # "feat(taller): armado de PDF con páginas de manuales"
```

---

## Task 4: `utils/manualesReglas.js` (TDD)

**Files:**
- Create: `legacy/CAA-backend/tests/manualesReglas.test.js`
- Create: `legacy/CAA-backend/utils/manualesReglas.js`

- [ ] **Step 1: Escribir las pruebas**

```js
// legacy/CAA-backend/tests/manualesReglas.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  aTipoPaquete, resolverInspeccion, esMecanicoDeOrden, esJefe, TIPOS_PAQUETE,
} = require("../utils/manualesReglas");

test("los cuatro tipos de paquete", () => {
  assert.deepEqual(TIPOS_PAQUETE, ["25HR", "50HR", "100HR", "ANUAL"]);
});
test("un código ya hecho se usa tal cual (y sin distinguir mayúsculas)", () => {
  assert.equal(aTipoPaquete("100HR"), "100HR");
  assert.equal(aTipoPaquete("anual"), "ANUAL");
});
test("el nombre libre se traduce con el mapa que ya existe", () => {
  assert.equal(aTipoPaquete("Inspección 25 horas"), "25HR");
  assert.equal(aTipoPaquete("Inspección 50 horas"), "50HR");
  assert.equal(aTipoPaquete("Anual"), "ANUAL");
});
test("lo que no es una inspección de paquete no cuenta", () => {
  assert.equal(aTipoPaquete("CORRECTIVO"), null);
  assert.equal(aTipoPaquete("Overhaul"), null);
  assert.equal(aTipoPaquete("AD 2011-10-09"), null);
  assert.equal(aTipoPaquete("100 hrs"), null);
  assert.equal(aTipoPaquete(""), null);
  assert.equal(aTipoPaquete(null), null);
});
test("resolverInspeccion: el mantenimiento manda", () => {
  assert.equal(resolverInspeccion({ tipo_mantenimiento: "50HR", nombre_tarea: "Anual" }), "50HR");
});
test("resolverInspeccion: un correctivo sigue buscando en la tarea", () => {
  assert.equal(resolverInspeccion({ tipo_mantenimiento: "CORRECTIVO", nombre_tarea: "Inspección 100 horas" }), "100HR");
});
test("resolverInspeccion: el reporte es el último recurso", () => {
  assert.equal(resolverInspeccion({ tipo_inspeccion_reporte: "25HR" }), "25HR");
});
test("resolverInspeccion: sin nada, no hay inspección", () => {
  assert.equal(resolverInspeccion({}), null);
});
test("esMecanicoDeOrden: quien la abrió, a quien se la asignaron y quien la trabaja de segundo", () => {
  const o = { creado_por: 10, id_mecanico_asignado: 11, id_aprendiz: 12 };
  assert.equal(esMecanicoDeOrden(o, 10), true);
  assert.equal(esMecanicoDeOrden(o, "11"), true);
  assert.equal(esMecanicoDeOrden(o, 12), true);
  assert.equal(esMecanicoDeOrden(o, 99), false);
  assert.equal(esMecanicoDeOrden({ creado_por: null, id_mecanico_asignado: null, id_aprendiz: null }, 0), false);
});
test("esJefe: TALLER y ADMIN", () => {
  assert.equal(esJefe("TALLER"), true);
  assert.equal(esJefe("ADMIN"), true);
  assert.equal(esJefe("TECNICO"), false);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npm test`
Expected: FAIL — `Cannot find module '../utils/manualesReglas'`.

- [ ] **Step 3: Implementar**

```js
// legacy/CAA-backend/utils/manualesReglas.js
/**
 * Reglas puras de los manuales del taller (sin base ni Storage), para poder
 * probarlas solas (tests/manualesReglas.test.js).
 *
 * Spec: docs/superpowers/specs/2026-09-20-manuales-taller-design.md
 */
const { derivarTipoRevision } = require("./aeronaveUtils");

const TIPOS_PAQUETE = ["25HR", "50HR", "100HR", "ANUAL"];
const ETIQUETA_TIPO = { "25HR": "25 h", "50HR": "50 h", "100HR": "100 h", ANUAL: "anual" };
const CATEGORIAS = ["MANTENIMIENTO", "PARTES", "OVERHAUL", "OPERACION", "BOLETINES", "NORMATIVA", "CATALOGO"];
const JEFE = ["TALLER", "ADMIN"];

/**
 * Código de paquete a partir de un código o de un nombre libre; null si no es
 * ninguno de los cuatro. El nombre se traduce con derivarTipoRevision: el mismo
 * mapa que usa el resto del Taller, no una copia.
 */
function aTipoPaquete(texto) {
  if (texto === null || texto === undefined) return null;
  const t = String(texto).trim();
  if (!t) return null;
  if (TIPOS_PAQUETE.includes(t.toUpperCase())) return t.toUpperCase();
  const codigo = derivarTipoRevision(t);
  return TIPOS_PAQUETE.includes(codigo) ? codigo : null;
}

/**
 * Qué inspección es una orden (spec §7): lo primero que traduzca entre el
 * mantenimiento enlazado, la tarea programada del cumplimiento y el reporte.
 */
function resolverInspeccion({ tipo_mantenimiento, nombre_tarea, tipo_inspeccion_reporte } = {}) {
  return aTipoPaquete(tipo_mantenimiento)
    || aTipoPaquete(nombre_tarea)
    || aTipoPaquete(tipo_inspeccion_reporte);
}

/**
 * "Mecánico de la orden": quien la abrió, a quien se la asignaron, o quien la
 * trabaja de segundo (id_aprendiz: al abrir la orden se pone ahí al aprendiz o a
 * otro mecánico). Mismo criterio de "lo mío" que asignadas=true (§36).
 */
function esMecanicoDeOrden(orden, idUsuario) {
  if (!idUsuario) return false;
  return [orden.creado_por, orden.id_mecanico_asignado, orden.id_aprendiz]
    .some((x) => x !== null && x !== undefined && Number(x) === Number(idUsuario));
}

const esJefe = (rol) => JEFE.includes(rol);

module.exports = {
  TIPOS_PAQUETE, ETIQUETA_TIPO, CATEGORIAS,
  aTipoPaquete, resolverInspeccion, esMecanicoDeOrden, esJefe,
};
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npm test`
Expected: PASS, 22 pruebas en total. El proceso termina solo (si queda colgado, algo abrió una conexión al requerir `aeronaveUtils`: investigar antes de seguir).

- [ ] **Step 5: Commit**

```bash
git add legacy/CAA-backend/utils/manualesReglas.js legacy/CAA-backend/tests/manualesReglas.test.js
git commit -F <msg>   # "feat(taller): reglas de manuales (inspección de la orden, mecánico de la orden)"
```

---

## Task 5: `services/manualesService.js`

**Files:**
- Create: `legacy/CAA-backend/services/manualesService.js`

No lleva test unitario: todo lo que hace es base + Storage y lo cubre el E2E de la Task 9.

- [ ] **Step 1: Implementar**

```js
// legacy/CAA-backend/services/manualesService.js
/**
 * Manuales del taller: lo que cruza la base con Storage.
 *
 * Spec: docs/superpowers/specs/2026-09-20-manuales-taller-design.md
 */
const db = require("../config/db");
const storage = require("../utils/storage");
const AppError = require("../utils/appError");
const { armarPdf, claveExtractos, enCola, paginasDe, MAX_PAGINAS } = require("../utils/pdfExtractos");
const { resolverInspeccion, esMecanicoDeOrden, esJefe } = require("../utils/manualesReglas");

const BUCKET = storage.BUCKETS.MANUALES;

/** Un extracto con los datos de su manual. `tabla` es taller_paquete_extracto o taller_orden_extracto. */
const selectExtractos = (tabla) => `
  SELECT e.id_extracto, e.id_manual, e.pagina_desde, e.pagina_hasta, e.titulo, e.orden, e.origen,
         e.agregado_por, e.creado_en,
         -- Formateado en SQL: creado_en es timestamp SIN zona y pg lo leería en
         -- la zona del proceso (UTC en Railway): la hora saldría corrida 6 h (§40).
         to_char(e.creado_en, 'DD/MM/YYYY HH24:MI') AS creado_txt,
         NULLIF(TRIM(COALESCE(u.nombre,'') || ' ' || COALESCE(u.apellido,'')), '') AS agregado_por_nombre,
         mn.titulo AS manual_titulo, mn.revision AS manual_revision, mn.estado AS manual_estado,
         mn.paginas AS manual_paginas, mn.tamano_bytes AS manual_tamano_bytes,
         mn.sha256, mn.archivo_path,
         (e.pagina_hasta - e.pagina_desde + 1)::int AS paginas
    FROM ${tabla} e
    JOIN taller_manual mn ON mn.id_manual = e.id_manual
    LEFT JOIN usuario u ON u.id_usuario = e.agregado_por`;

/** Lo que decide qué páginas lleva una orden y quién se las toca. `q` = db o un client de transacción. */
async function contextoOrden(q, idOrden) {
  const r = await q.query(
    `SELECT o.id_orden, o.id_aeronave, o.estado, o.correlativo,
            o.creado_por, o.id_mecanico_asignado, o.id_aprendiz,
            a.codigo AS aeronave_codigo,
            m.tipo AS tipo_mantenimiento, t.nombre AS nombre_tarea,
            ri.tipo_inspeccion AS tipo_inspeccion_reporte
       FROM orden_trabajo o
       JOIN aeronave a ON a.id_aeronave = o.id_aeronave
       LEFT JOIN mantenimiento_aeronave m ON m.id_mantenimiento = o.id_mantenimiento
       LEFT JOIN taller_cumplimiento c ON c.id_cumplimiento = o.id_cumplimiento
       LEFT JOIN taller_tarea_programada t ON t.id_tarea = c.id_tarea
       LEFT JOIN reporte_inspeccion ri ON ri.id_reporte = o.id_reporte
      WHERE o.id_orden = $1`,
    [idOrden]
  );
  if (!r.rows.length) return null;
  const o = r.rows[0];
  return { ...o, inspeccion: resolverInspeccion(o) };
}

/** El paquete (avión, inspección) con sus extractos, o null. */
async function paqueteDe(q, idAeronave, tipo) {
  const p = await q.query(
    "SELECT * FROM taller_paquete_manual WHERE id_aeronave = $1 AND tipo_mantenimiento = $2",
    [idAeronave, tipo]
  );
  if (!p.rows.length) return null;
  const e = await q.query(
    `${selectExtractos("taller_paquete_extracto")} WHERE e.id_paquete = $1 ORDER BY e.orden, e.id_extracto`,
    [p.rows[0].id_paquete]
  );
  return { ...p.rows[0], extractos: e.rows };
}

/**
 * Lo que se muestra e imprime de una orden (spec §7).
 * - ABIERTA: el paquete CONFIRMADO en vivo + lo agregado a mano. Las copias
 *   'PAQUETE' de una firma anterior (antes de una devolución) no se muestran:
 *   la próxima firma las reemplaza.
 * - Cualquier otro estado: solo lo guardado en la orden.
 */
async function manualesDeOrden(idOrden, usuario) {
  const o = await contextoOrden(db, idOrden);
  if (!o) return null;
  const propias = (await db.query(
    `${selectExtractos("taller_orden_extracto")} WHERE e.id_orden = $1 ORDER BY e.orden, e.id_extracto`,
    [idOrden]
  )).rows;
  const abierta = o.estado === "ABIERTA";
  const paquete = o.inspeccion ? await paqueteDe(db, o.id_aeronave, o.inspeccion) : null;

  const delPaquete = abierta
    ? (paquete?.estado === "CONFIRMADO" ? paquete.extractos : [])
    : propias.filter((e) => e.origen === "PAQUETE");
  const agregadas = propias.filter((e) => e.origen === "MANUAL");

  return {
    orden: {
      id_orden: o.id_orden, correlativo: o.correlativo, estado: o.estado,
      id_aeronave: o.id_aeronave, aeronave_codigo: o.aeronave_codigo,
    },
    inspeccion: o.inspeccion,
    paquete_estado: paquete?.estado || null,
    congelado: !abierta,
    del_paquete: delPaquete,
    agregadas,
    puede_agregar: abierta && (esJefe(usuario?.rol) || esMecanicoDeOrden(o, usuario?.id_usuario)),
    es_jefe: esJefe(usuario?.rol),
    paginas: paginasDe([...delPaquete, ...agregadas]),
  };
}

/**
 * Copia el paquete confirmado a la orden, dentro de la transacción de
 * firmarOrden. Borrar antes de copiar hace que devolver y volver a firmar no
 * duplique las páginas.
 */
async function congelarPaqueteEnOrden(client, idOrden) {
  await client.query(
    "DELETE FROM taller_orden_extracto WHERE id_orden = $1 AND origen = 'PAQUETE'", [idOrden]
  );
  const o = await contextoOrden(client, idOrden);
  if (!o?.inspeccion) return 0;
  const r = await client.query(
    `INSERT INTO taller_orden_extracto (id_orden, id_manual, pagina_desde, pagina_hasta, titulo, orden, origen)
     SELECT $1, e.id_manual, e.pagina_desde, e.pagina_hasta, e.titulo, e.orden, 'PAQUETE'
       FROM taller_paquete_extracto e
       JOIN taller_paquete_manual p ON p.id_paquete = e.id_paquete
      WHERE p.id_aeronave = $2 AND p.tipo_mantenimiento = $3 AND p.estado = 'CONFIRMADO'`,
    [idOrden, o.id_aeronave, o.inspeccion]
  );
  return r.rowCount;
}

/**
 * URL firmada (1 h) de un PDF con esas páginas. Si ya se armó antes con el mismo
 * contenido se reutiliza sin bajar nada.
 * @param extractos [{sha256, archivo_path, pagina_desde, pagina_hasta}] en orden
 */
async function pdfDeExtractos(extractos) {
  if (!extractos.length) throw new AppError("No hay páginas para imprimir.", 400);
  const paginas = paginasDe(extractos);
  if (paginas > MAX_PAGINAS) {
    throw new AppError(`Son ${paginas} páginas: el máximo por PDF es ${MAX_PAGINAS}. Partilo en dos.`, 400);
  }
  const ruta = `extractos/${claveExtractos(extractos)}.pdf`;
  if (!(await storage.existeArchivo(BUCKET, ruta))) {
    await enCola(async () => {
      if (await storage.existeArchivo(BUCKET, ruta)) return; // lo armó otro mientras esperaba
      const fuentes = new Map();
      for (const e of extractos) {
        if (!fuentes.has(e.sha256)) fuentes.set(e.sha256, await storage.descargarArchivo(BUCKET, e.archivo_path));
      }
      const bytes = await armarPdf(extractos, fuentes);
      try {
        await storage.subirArchivo(BUCKET, ruta, Buffer.from(bytes), "application/pdf", { upsert: false });
      } catch (err) {
        if (err.statusCode !== 409) throw err; // 409 = ya existe: mismo hash, mismo contenido
      }
    });
  }
  return { url: await storage.urlFirmada(BUCKET, ruta, 3600), paginas };
}

/** Manuales por id (Map id_manual → fila). */
async function manualesPorId(ids) {
  if (!ids.length) return new Map();
  const r = await db.query("SELECT * FROM taller_manual WHERE id_manual = ANY($1::int[])", [ids]);
  return new Map(r.rows.map((m) => [m.id_manual, m]));
}

module.exports = {
  BUCKET, selectExtractos, contextoOrden, paqueteDe, manualesDeOrden,
  congelarPaqueteEnOrden, pdfDeExtractos, manualesPorId,
};
```

- [ ] **Step 2: Verificar que carga**

Run (desde `legacy/CAA-backend`): `node -e "require('./services/manualesService'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add legacy/CAA-backend/services/manualesService.js
git commit -F <msg>   # "feat(taller): servicio de manuales (páginas de una orden, PDF con caché)"
```

---

## Task 6: Controller y rutas de la biblioteca

**Files:**
- Create: `legacy/CAA-backend/controllers/taller/manualController.js`
- Modify: `legacy/CAA-backend/routes/tallerRoutes.js`

- [ ] **Step 1: Implementar el controller**

```js
// legacy/CAA-backend/controllers/taller/manualController.js
/**
 * Biblioteca de manuales del taller.
 *
 * La subida NO pasa por el backend: el navegador sube directo a Storage con un
 * permiso temporal (70 MB no cruzan Railway). Después el backend baja el
 * archivo UNA vez para sacar su huella y sus páginas: no se confía en lo que
 * diga el navegador.
 *
 * 🚨 La app nunca borra ni pisa un objeto del bucket (spec §5). Borrar un manual
 * quita la fila; una revisión nueva es otro archivo. Es lo que impide que la
 * cuenta de demostraciones, que comparte el bucket, toque un manual de CAAA.
 *
 * Spec: docs/superpowers/specs/2026-09-20-manuales-taller-design.md
 */
const crypto = require("crypto");
const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const AppError = require("../../utils/appError");
const storage = require("../../utils/storage");
const { CATEGORIAS } = require("../../utils/manualesReglas");
const { validarRango, analizarPdf, enCola } = require("../../utils/pdfExtractos");
const { pdfDeExtractos, manualesPorId, BUCKET } = require("../../services/manualesService");

const txt = (v) => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim());
const RUTA_VALIDA = /^manuales\/[0-9a-f-]{36}\.pdf$/;
const idValido = (v) => Number.isInteger(Number(v)) && Number(v) > 0;

const SELECT_MANUAL = `
  SELECT m.*,
         COALESCE(json_agg(json_build_object('id_aeronave', a.id_aeronave, 'codigo', a.codigo) ORDER BY a.codigo)
                  FILTER (WHERE a.id_aeronave IS NOT NULL), '[]') AS aeronaves,
         (SELECT COUNT(*) FROM taller_paquete_extracto x WHERE x.id_manual = m.id_manual)::int AS usos_paquetes,
         (SELECT COUNT(*) FROM taller_orden_extracto x WHERE x.id_manual = m.id_manual)::int AS usos_ordenes,
         r.titulo AS reemplazado_por_titulo, r.revision AS reemplazado_por_revision
    FROM taller_manual m
    LEFT JOIN taller_manual_aeronave ma ON ma.id_manual = m.id_manual
    LEFT JOIN aeronave a ON a.id_aeronave = ma.id_aeronave
    LEFT JOIN taller_manual r ON r.id_manual = m.id_reemplazado_por`;
const AGRUPAR = " GROUP BY m.id_manual, r.titulo, r.revision";

exports.listar = catchAsync(async (req, res) => {
  const { q, aeronave, incluir_reemplazados } = req.query;
  const cond = [];
  const params = [];
  const p = (v) => `$${params.push(v)}`;
  if (incluir_reemplazados !== "true") cond.push("m.estado = 'VIGENTE'");
  if (aeronave && !idValido(aeronave)) return res.status(400).json({ message: "Avión inválido" });
  if (aeronave) {
    cond.push(`(m.es_general OR EXISTS (SELECT 1 FROM taller_manual_aeronave z
                 WHERE z.id_manual = m.id_manual AND z.id_aeronave = ${p(Number(aeronave))}))`);
  }
  if (q) {
    const ph = p(`%${q}%`);
    cond.push(`(m.titulo ILIKE ${ph} OR m.numero_parte ILIKE ${ph} OR m.fabricante ILIKE ${ph})`);
  }
  const r = await db.query(
    `${SELECT_MANUAL}${cond.length ? ` WHERE ${cond.join(" AND ")}` : ""}${AGRUPAR} ORDER BY m.titulo, m.id_manual`,
    params
  );
  res.json(r.rows);
});

exports.detalle = catchAsync(async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ message: "Manual inválido" });
  const r = await db.query(`${SELECT_MANUAL} WHERE m.id_manual = $1${AGRUPAR}`, [req.params.id]);
  if (!r.rows.length) return res.status(404).json({ message: "Manual no encontrado" });
  // Las revisiones anteriores, de la más reciente a la más vieja.
  const ant = await db.query(
    `WITH RECURSIVE ant AS (
       SELECT id_manual, titulo, revision, estado, 1 AS nivel
         FROM taller_manual WHERE id_reemplazado_por = $1
       UNION ALL
       SELECT m.id_manual, m.titulo, m.revision, m.estado, ant.nivel + 1
         FROM taller_manual m JOIN ant ON m.id_reemplazado_por = ant.id_manual
        WHERE ant.nivel < 50)
     SELECT id_manual, titulo, revision, estado FROM ant ORDER BY nivel`,
    [req.params.id]
  );
  res.json({ ...r.rows[0], revisiones_anteriores: ant.rows });
});

exports.url = catchAsync(async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ message: "Manual inválido" });
  const r = await db.query(
    "SELECT archivo_path, tamano_bytes, paginas FROM taller_manual WHERE id_manual = $1", [req.params.id]
  );
  if (!r.rows.length) return res.status(404).json({ message: "Manual no encontrado" });
  const url = await storage.urlFirmada(BUCKET, r.rows[0].archivo_path, 3600);
  res.json({ url, tamano_bytes: Number(r.rows[0].tamano_bytes), paginas: r.rows[0].paginas });
});

/** Reserva una ruta con UUID (no con id_manual: todavía no hay fila, y el demo repetiría ids). */
exports.reservarSubida = catchAsync(async (req, res) => {
  const ruta = `manuales/${crypto.randomUUID()}.pdf`;
  const s = await storage.urlSubidaFirmada(BUCKET, ruta);
  res.json({ ruta, signedUrl: s.signedUrl });
});

/** Datos del formulario, normalizados. Devuelve {error} o {datos}. */
function leerDatos(body, { exigirRuta }) {
  const d = {
    titulo: txt(body.titulo),
    categoria: txt(body.categoria),
    fabricante: txt(body.fabricante),
    numero_parte: txt(body.numero_parte),
    revision: txt(body.revision),
    es_general: body.es_general === undefined ? undefined : !!body.es_general,
    aeronaves: Array.isArray(body.aeronaves)
      ? [...new Set(body.aeronaves.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
      : undefined,
    ruta: body.ruta,
  };
  if (exigirRuta && !RUTA_VALIDA.test(String(body.ruta || ""))) return { error: "Falta el archivo subido" };
  if (d.titulo && d.titulo.length > 200) return { error: "El título es demasiado largo (máximo 200)" };
  if (d.categoria && !CATEGORIAS.includes(d.categoria)) return { error: "Tipo de manual inválido" };
  for (const k of ["fabricante", "numero_parte", "revision"]) {
    const max = k === "fabricante" ? 80 : k === "numero_parte" ? 40 : 80;
    if (d[k] && d[k].length > max) return { error: `El campo ${k.replace("_", " ")} es demasiado largo` };
  }
  return { datos: d };
}

/** Baja lo recién subido y saca huella y páginas. Serializado: carga el PDF entero en memoria. */
async function analizarSubida(ruta) {
  let bytes;
  try {
    bytes = await storage.descargarArchivo(BUCKET, ruta);
  } catch {
    throw new AppError("El archivo no llegó al almacenamiento. Volvé a subirlo.", 400);
  }
  const a = await enCola(() => analizarPdf(bytes));
  if (a.error) throw new AppError(a.error, 400);
  return { sha256: a.sha256, paginas: a.paginas, tamano_bytes: bytes.length };
}

async function insertarManual(client, d, uid) {
  const dup = await client.query("SELECT titulo FROM taller_manual WHERE sha256 = $1", [d.sha256]);
  if (dup.rows.length) {
    throw new AppError(`Ese archivo ya está en la biblioteca como «${dup.rows[0].titulo}».`, 409);
  }
  const r = await client.query(
    `INSERT INTO taller_manual (titulo, categoria, fabricante, numero_parte, revision, paginas,
                                tamano_bytes, sha256, archivo_path, es_general, origen, subido_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'SUBIDA',$11) RETURNING *`,
    [d.titulo, d.categoria, d.fabricante, d.numero_parte, d.revision, d.paginas,
     d.tamano_bytes, d.sha256, d.ruta, !!d.es_general, uid]
  );
  const m = r.rows[0];
  if (d.aeronaves?.length) {
    await client.query(
      `INSERT INTO taller_manual_aeronave (id_manual, id_aeronave)
       SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING`,
      [m.id_manual, d.aeronaves]
    );
  }
  return m;
}

exports.registrar = catchAsync(async (req, res) => {
  const { error, datos } = leerDatos(req.body, { exigirRuta: true });
  if (error) return res.status(400).json({ message: error });
  if (!datos.titulo) return res.status(400).json({ message: "Escribí el título del manual" });
  if (!datos.categoria) return res.status(400).json({ message: "Elegí el tipo de manual" });

  const a = await analizarSubida(datos.ruta); // antes de abrir la transacción: puede tardar
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const m = await insertarManual(client, { ...datos, ...a }, req.user.id_usuario);
    await client.query("COMMIT");
    res.status(201).json(m);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

exports.subirRevision = catchAsync(async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ message: "Manual inválido" });
  const { error, datos } = leerDatos(req.body, { exigirRuta: true });
  if (error) return res.status(400).json({ message: error });
  if (!datos.revision) {
    return res.status(400).json({ message: "Escribí qué revisión es (ej. «Rev. 12, marzo 2026»)" });
  }

  const a = await analizarSubida(datos.ruta);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const v = await client.query("SELECT * FROM taller_manual WHERE id_manual = $1 FOR UPDATE", [req.params.id]);
    if (!v.rows.length) throw new AppError("Manual no encontrado", 404);
    const viejo = v.rows[0];
    if (viejo.estado !== "VIGENTE") {
      throw new AppError(`Solo se le sube revisión a un manual vigente: este está ${viejo.estado.toLowerCase()}.`, 409);
    }
    // La revisión nueva HEREDA lo que el formulario no mande (spec §8).
    const aviones = datos.aeronaves ?? (await client.query(
      "SELECT id_aeronave FROM taller_manual_aeronave WHERE id_manual = $1", [viejo.id_manual]
    )).rows.map((x) => x.id_aeronave);
    const nuevo = await insertarManual(client, {
      titulo: datos.titulo ?? viejo.titulo,
      categoria: datos.categoria ?? viejo.categoria,
      fabricante: datos.fabricante ?? viejo.fabricante,
      numero_parte: datos.numero_parte ?? viejo.numero_parte,
      revision: datos.revision,
      es_general: datos.es_general ?? viejo.es_general,
      aeronaves: aviones,
      ruta: datos.ruta,
      ...a,
    }, req.user.id_usuario);
    await client.query(
      "UPDATE taller_manual SET estado = 'REEMPLAZADO', id_reemplazado_por = $2 WHERE id_manual = $1",
      [viejo.id_manual, nuevo.id_manual]
    );
    await client.query("COMMIT");
    res.status(201).json(nuevo);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

/**
 * Edita datos, aviones, confirma la asignación o archiva. El SET se arma con las
 * claves que llegan (lección de §31: un SET fijo nulificaba campos).
 */
exports.editar = catchAsync(async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ message: "Manual inválido" });
  const { error, datos } = leerDatos(req.body, { exigirRuta: false });
  if (error) return res.status(400).json({ message: error });

  const sets = [];
  const params = [Number(req.params.id)];
  const p = (v) => `$${params.push(v)}`;
  for (const k of ["titulo", "categoria", "fabricante", "numero_parte", "revision"]) {
    if (!(k in req.body)) continue;
    if (k === "titulo" && !datos.titulo) return res.status(400).json({ message: "El título no puede quedar vacío" });
    if (k === "categoria" && !datos.categoria) return res.status(400).json({ message: "Elegí el tipo de manual" });
    sets.push(`${k} = ${p(datos[k])}`);
  }
  if ("es_general" in req.body) sets.push(`es_general = ${p(datos.es_general)}`);
  if (req.body.confirmar_asignacion === true) sets.push("necesita_confirmacion = false");

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const v = await client.query("SELECT estado FROM taller_manual WHERE id_manual = $1 FOR UPDATE", [params[0]]);
    if (!v.rows.length) throw new AppError("Manual no encontrado", 404);
    if (req.body.archivar === true) {
      if (v.rows[0].estado !== "VIGENTE") throw new AppError(`Ya está ${v.rows[0].estado.toLowerCase()}.`, 409);
      sets.push("estado = 'ARCHIVADO'");
    }
    if (sets.length) {
      await client.query(`UPDATE taller_manual SET ${sets.join(", ")} WHERE id_manual = $1`, params);
    }
    if (datos.aeronaves) {
      await client.query("DELETE FROM taller_manual_aeronave WHERE id_manual = $1", [params[0]]);
      if (datos.aeronaves.length) {
        await client.query(
          "INSERT INTO taller_manual_aeronave (id_manual, id_aeronave) SELECT $1, unnest($2::int[])",
          [params[0], datos.aeronaves]
        );
      }
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  const r = await db.query(`${SELECT_MANUAL} WHERE m.id_manual = $1${AGRUPAR}`, [params[0]]);
  res.json(r.rows[0]);
});

exports.eliminar = catchAsync(async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ message: "Manual inválido" });
  const id = Number(req.params.id);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const v = await client.query("SELECT titulo FROM taller_manual WHERE id_manual = $1 FOR UPDATE", [id]);
    if (!v.rows.length) throw new AppError("Manual no encontrado", 404);
    const u = await client.query(
      `SELECT (SELECT COUNT(*) FROM taller_paquete_extracto WHERE id_manual = $1)::int AS paquetes,
              (SELECT COUNT(*) FROM taller_orden_extracto   WHERE id_manual = $1)::int AS ordenes`,
      [id]
    );
    const { paquetes, ordenes } = u.rows[0];
    if (paquetes || ordenes) {
      throw new AppError(
        `No se puede borrar: lo usan ${paquetes} rango(s) de paquetes y ${ordenes} de órdenes. Archivalo en su lugar.`,
        409
      );
    }
    const s = await client.query(
      "SELECT titulo, revision FROM taller_manual WHERE id_reemplazado_por = $1 LIMIT 1", [id]
    );
    if (s.rows.length) {
      const x = s.rows[0];
      throw new AppError(
        `No se puede borrar: es la revisión que reemplazó a «${x.titulo}${x.revision ? ` · ${x.revision}` : ""}». Archivalo en su lugar.`,
        409
      );
    }
    // Los aviones caen en cascada. El archivo QUEDA en el bucket (spec §5).
    await client.query("DELETE FROM taller_manual WHERE id_manual = $1", [id]);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

/** Imprimir páginas sueltas desde la biblioteca. */
exports.pdfLibre = catchAsync(async (req, res) => {
  const pedidos = Array.isArray(req.body.extractos) ? req.body.extractos : [];
  if (!pedidos.length) return res.status(400).json({ message: "Elegí qué páginas imprimir" });
  if (pedidos.length > 50) return res.status(400).json({ message: "Demasiados rangos para un solo PDF" });
  const manuales = await manualesPorId([...new Set(pedidos.map((e) => Number(e.id_manual)).filter(idValido))]);
  const extractos = [];
  for (const e of pedidos) {
    const m = manuales.get(Number(e.id_manual));
    if (!m) return res.status(404).json({ message: "Uno de los manuales ya no existe" });
    const err = validarRango(e.pagina_desde, e.pagina_hasta, m.paginas);
    if (err) return res.status(400).json({ message: `${m.titulo}: ${err}` });
    extractos.push({
      sha256: m.sha256, archivo_path: m.archivo_path,
      pagina_desde: Number(e.pagina_desde), pagina_hasta: Number(e.pagina_hasta),
    });
  }
  res.json(await pdfDeExtractos(extractos));
});
```

- [ ] **Step 2: Registrar las rutas**

En `routes/tallerRoutes.js`, agregar el `require` junto a los demás controllers:

```js
const manual = require("../controllers/taller/manualController");
```

Y antes de `module.exports = router;`:

```js
// -- Manuales del avion ------------------------------------------------------
//
// Ver e imprimir: todo el taller. Subir, editar y armar paquetes: el jefe.
// OJO con el orden: /manuales/subida y /manuales/pdf van ANTES que /manuales/:id
// (mismo cuidado que /stickers/pdf).
router.get("/manuales", roleMiddleware(READ), manual.listar);
router.post("/manuales/subida", roleMiddleware(JEFE), manual.reservarSubida);
router.post("/manuales/pdf", roleMiddleware(READ), manual.pdfLibre);
router.post("/manuales", roleMiddleware(JEFE), manual.registrar);
router.get("/manuales/:id", roleMiddleware(READ), manual.detalle);
router.get("/manuales/:id/url", roleMiddleware(READ), manual.url);
router.post("/manuales/:id/revision", roleMiddleware(JEFE), manual.subirRevision);
router.patch("/manuales/:id", roleMiddleware(JEFE), manual.editar);
router.delete("/manuales/:id", roleMiddleware(JEFE), manual.eliminar);
```

- [ ] **Step 3: Verificar que el servidor arranca**

Run (desde `legacy/CAA-backend`): `node -e "require('./routes/tallerRoutes'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add legacy/CAA-backend/controllers/taller/manualController.js legacy/CAA-backend/routes/tallerRoutes.js
git commit -F <msg>   # "feat(taller): biblioteca de manuales (subir, revisión, editar, imprimir)"
```

---

## Task 7: Controller y rutas de paquetes

**Files:**
- Create: `legacy/CAA-backend/controllers/taller/paqueteManualController.js`
- Modify: `legacy/CAA-backend/routes/tallerRoutes.js`

- [ ] **Step 1: Implementar**

```js
// legacy/CAA-backend/controllers/taller/paqueteManualController.js
/**
 * Paquetes de manuales: por avión y por inspección (25/50/100/anual), qué
 * páginas le salen al mecánico. El mecánico solo ve los CONFIRMADOS.
 *
 * Spec: docs/superpowers/specs/2026-09-20-manuales-taller-design.md §9.4
 */
const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const { TIPOS_PAQUETE } = require("../../utils/manualesReglas");
const { validarRango } = require("../../utils/pdfExtractos");
const { paqueteDe, manualesPorId } = require("../../services/manualesService");

const ESTADOS = ["BORRADOR", "CONFIRMADO"];
const ORIGENES = ["MANUAL", "SUGERIDO"];
const AHORA = "(NOW() AT TIME ZONE 'America/El_Salvador')";

exports.tabla = catchAsync(async (req, res) => {
  // La flota que pasa por el taller: la propia y la externa (la OMA les da
  // mantenimiento). Fuera el simulador y los aviones dados de baja. Ojo: un
  // externo también tiene activa=false y estado ACTIVO, por eso el es_externa.
  const a = await db.query(
    `SELECT id_aeronave, codigo, modelo, es_externa
       FROM aeronave
      WHERE tipo <> 'SIMULADOR'
        AND NOT (activa = false AND estado = 'ACTIVO' AND es_externa = false)
      ORDER BY es_externa, codigo`
  );
  const c = await db.query(
    `SELECT p.id_aeronave, p.tipo_mantenimiento, p.estado,
            COUNT(e.id_extracto)::int AS extractos,
            COALESCE(SUM(e.pagina_hasta - e.pagina_desde + 1), 0)::int AS paginas,
            COUNT(e.id_extracto) FILTER (WHERE m.estado <> 'VIGENTE')::int AS reemplazados
       FROM taller_paquete_manual p
       LEFT JOIN taller_paquete_extracto e ON e.id_paquete = p.id_paquete
       LEFT JOIN taller_manual m ON m.id_manual = e.id_manual
      GROUP BY p.id_paquete`
  );
  res.json({ tipos: TIPOS_PAQUETE, aeronaves: a.rows, celdas: c.rows });
});

/** (avión, tipo) de la URL, validados. Si no sirven, responde y devuelve null. */
function leerClave(req, res) {
  const idAeronave = Number(req.params.id_aeronave);
  const tipo = String(req.params.tipo || "").toUpperCase();
  if (!Number.isInteger(idAeronave) || idAeronave < 1) {
    res.status(400).json({ message: "Avión inválido" });
    return null;
  }
  if (!TIPOS_PAQUETE.includes(tipo)) {
    res.status(400).json({ message: "Inspección inválida: tiene que ser 25HR, 50HR, 100HR o ANUAL" });
    return null;
  }
  return { idAeronave, tipo };
}

exports.detalle = catchAsync(async (req, res) => {
  const k = leerClave(req, res);
  if (!k) return;
  const p = await paqueteDe(db, k.idAeronave, k.tipo);
  const { extractos = [], ...paquete } = p || {};
  res.json({ id_aeronave: k.idAeronave, tipo: k.tipo, paquete: p ? paquete : null, extractos });
});

/**
 * Reemplaza el set completo de rangos (reordenar = mandar el orden nuevo) y fija
 * el estado, que es OBLIGATORIO: nunca cambia por efecto secundario (spec §9.4).
 */
exports.guardar = catchAsync(async (req, res) => {
  const k = leerClave(req, res);
  if (!k) return;
  const estado = String(req.body.estado || "").toUpperCase();
  if (!ESTADOS.includes(estado)) {
    return res.status(400).json({ message: "Falta el estado del paquete: BORRADOR o CONFIRMADO" });
  }
  const filas = Array.isArray(req.body.extractos) ? req.body.extractos : null;
  if (!filas) return res.status(400).json({ message: "Faltan los rangos del paquete" });
  if (estado === "CONFIRMADO" && !filas.length) {
    return res.status(400).json({ message: "Un paquete confirmado necesita al menos un rango de páginas" });
  }
  if (filas.length > 100) return res.status(400).json({ message: "Demasiados rangos para un paquete" });

  const av = await db.query("SELECT 1 FROM aeronave WHERE id_aeronave = $1", [k.idAeronave]);
  if (!av.rows.length) return res.status(404).json({ message: "Avión no encontrado" });

  const manuales = await manualesPorId([...new Set(filas.map((f) => Number(f.id_manual)).filter((n) => Number.isInteger(n) && n > 0))]);
  const limpias = [];
  for (const [i, f] of filas.entries()) {
    const m = manuales.get(Number(f.id_manual));
    if (!m) return res.status(404).json({ message: `Rango ${i + 1}: el manual ya no existe` });
    const err = validarRango(f.pagina_desde, f.pagina_hasta, m.paginas);
    if (err) return res.status(400).json({ message: `Rango ${i + 1} (${m.titulo}): ${err}` });
    limpias.push({
      id_manual: m.id_manual,
      desde: Number(f.pagina_desde),
      hasta: Number(f.pagina_hasta),
      titulo: f.titulo ? String(f.titulo).trim().slice(0, 200) || null : null,
      origen: ORIGENES.includes(f.origen) ? f.origen : "MANUAL",
    });
  }

  const uid = req.user.id_usuario;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    // confirmado_por/en: se conserva quién lo confirmó la primera vez mientras
    // siga confirmado; se pone ahora si recién se confirma; se borra al volver a borrador.
    const p = await client.query(
      `INSERT INTO taller_paquete_manual
         (id_aeronave, tipo_mantenimiento, estado, actualizado_por, actualizado_en, confirmado_por, confirmado_en)
       VALUES ($1, $2, $3::varchar, $4::int, ${AHORA},
               CASE WHEN $3::varchar = 'CONFIRMADO' THEN $4::int END,
               CASE WHEN $3::varchar = 'CONFIRMADO' THEN ${AHORA} END)
       ON CONFLICT (id_aeronave, tipo_mantenimiento) DO UPDATE SET
         estado          = EXCLUDED.estado,
         actualizado_por = EXCLUDED.actualizado_por,
         actualizado_en  = EXCLUDED.actualizado_en,
         confirmado_por  = CASE WHEN EXCLUDED.estado <> 'CONFIRMADO' THEN NULL
                                WHEN taller_paquete_manual.estado = 'CONFIRMADO' THEN taller_paquete_manual.confirmado_por
                                ELSE EXCLUDED.confirmado_por END,
         confirmado_en   = CASE WHEN EXCLUDED.estado <> 'CONFIRMADO' THEN NULL
                                WHEN taller_paquete_manual.estado = 'CONFIRMADO' THEN taller_paquete_manual.confirmado_en
                                ELSE EXCLUDED.confirmado_en END
       RETURNING id_paquete`,
      [k.idAeronave, k.tipo, estado, uid]
    );
    const idPaquete = p.rows[0].id_paquete;
    await client.query("DELETE FROM taller_paquete_extracto WHERE id_paquete = $1", [idPaquete]);
    for (const [i, f] of limpias.entries()) {
      await client.query(
        `INSERT INTO taller_paquete_extracto
           (id_paquete, id_manual, pagina_desde, pagina_hasta, titulo, orden, origen, agregado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [idPaquete, f.id_manual, f.desde, f.hasta, f.titulo, i, f.origen, f.origen === "SUGERIDO" ? null : uid]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  res.json(await paqueteDe(db, k.idAeronave, k.tipo));
});
```

- [ ] **Step 2: Registrar las rutas**

Agregar el `require`:

```js
const paqueteManual = require("../controllers/taller/paqueteManualController");
```

Y después de las rutas de manuales:

```js
router.get("/paquetes-manuales", roleMiddleware(READ), paqueteManual.tabla);
router.get("/paquetes-manuales/:id_aeronave/:tipo", roleMiddleware(READ), paqueteManual.detalle);
router.put("/paquetes-manuales/:id_aeronave/:tipo", roleMiddleware(JEFE), paqueteManual.guardar);
```

- [ ] **Step 3: Verificar que carga**

Run: `node -e "require('./routes/tallerRoutes'); console.log('ok')"` → `ok`

- [ ] **Step 4: Commit**

```bash
git add legacy/CAA-backend/controllers/taller/paqueteManualController.js legacy/CAA-backend/routes/tallerRoutes.js
git commit -F <msg>   # "feat(taller): paquetes de manuales por avión e inspección"
```

---

## Task 8: Páginas de una orden + congelar al firmar

**Files:**
- Create: `legacy/CAA-backend/controllers/taller/ordenManualController.js`
- Modify: `legacy/CAA-backend/controllers/taller/ordenTrabajoController.js` (`firmarOrden`, ~línea 342)
- Modify: `legacy/CAA-backend/routes/tallerRoutes.js`

- [ ] **Step 1: Implementar el controller**

```js
// legacy/CAA-backend/controllers/taller/ordenManualController.js
/**
 * Las páginas de manual de una orden de trabajo: las del paquete de su
 * inspección más las que se le agregan (spec §7 y §9.5).
 *
 * Agregar o quitar: el jefe, o el mecánico DE ESA orden, y solo mientras está
 * ABIERTA. Se bloquea la fila de la orden (FOR UPDATE, igual que firmarOrden)
 * para que nadie agregue una página en el mismo instante en que se firma.
 */
const db = require("../../config/db");
const catchAsync = require("../../utils/catchAsync");
const { TIPOS_PAQUETE, ETIQUETA_TIPO, esJefe, esMecanicoDeOrden } = require("../../utils/manualesReglas");
const { validarRango } = require("../../utils/pdfExtractos");
const {
  contextoOrden, manualesDeOrden, pdfDeExtractos, paqueteDe,
} = require("../../services/manualesService");

const idValido = (v) => Number.isInteger(Number(v)) && Number(v) > 0;

/**
 * Corre `fn(client, orden)` en una transacción con la orden bloqueada, si el
 * usuario puede cambiarle las páginas. Si no, responde el error y no corre nada.
 */
async function conOrdenEditable(req, res, fn) {
  if (!idValido(req.params.id)) return res.status(400).json({ message: "Orden inválida" });
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT 1 FROM orden_trabajo WHERE id_orden = $1 FOR UPDATE", [req.params.id]);
    const o = await contextoOrden(client, req.params.id);
    let rechazo = null;
    if (!o) rechazo = [404, "Orden de trabajo no encontrada"];
    else if (!esJefe(req.user?.rol) && !esMecanicoDeOrden(o, req.user?.id_usuario)) {
      rechazo = [403, "Solo el jefe de taller o quien trabaja esta orden puede cambiarle las páginas de manual."];
    } else if (o.estado !== "ABIERTA") {
      rechazo = [409, `La orden está ${o.estado.toLowerCase()}: sus páginas de manual quedaron fijas.`];
    }
    if (rechazo) {
      await client.query("ROLLBACK");
      return res.status(rechazo[0]).json({ message: rechazo[1] });
    }
    const salida = await fn(client, o);
    if (salida?.error) {
      await client.query("ROLLBACK");
      return res.status(salida.error[0]).json({ message: salida.error[1] });
    }
    await client.query("COMMIT");
    return res.status(salida.status || 200).json(salida.body);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

exports.listar = catchAsync(async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ message: "Orden inválida" });
  const r = await manualesDeOrden(Number(req.params.id), req.user);
  if (!r) return res.status(404).json({ message: "Orden de trabajo no encontrada" });
  res.json(r);
});

exports.agregar = catchAsync(async (req, res) => {
  const { id_manual, pagina_desde, pagina_hasta } = req.body;
  const titulo = req.body.titulo ? String(req.body.titulo).trim().slice(0, 200) || null : null;
  await conOrdenEditable(req, res, async (client, o) => {
    const m = await client.query(
      "SELECT id_manual, titulo, paginas FROM taller_manual WHERE id_manual = $1", [Number(id_manual) || 0]
    );
    if (!m.rows.length) return { error: [404, "Manual no encontrado"] };
    const err = validarRango(pagina_desde, pagina_hasta, m.rows[0].paginas);
    if (err) return { error: [400, err] };
    const r = await client.query(
      `INSERT INTO taller_orden_extracto
         (id_orden, id_manual, pagina_desde, pagina_hasta, titulo, orden, origen, agregado_por)
       VALUES ($1, $2, $3, $4, $5,
               (SELECT COALESCE(MAX(orden), 0) + 1 FROM taller_orden_extracto WHERE id_orden = $1),
               'MANUAL', $6)
       RETURNING *`,
      [o.id_orden, m.rows[0].id_manual, Number(pagina_desde), Number(pagina_hasta), titulo, req.user.id_usuario]
    );
    return { status: 201, body: r.rows[0] };
  });
});

/** "Traer las páginas de un paquete": para órdenes de inspección abiertas sin enlazar el mantenimiento. */
exports.traerPaquete = catchAsync(async (req, res) => {
  const tipo = String(req.body.tipo || "").toUpperCase();
  if (!TIPOS_PAQUETE.includes(tipo)) {
    return res.status(400).json({ message: "Elegí la inspección: 25HR, 50HR, 100HR o ANUAL" });
  }
  await conOrdenEditable(req, res, async (client, o) => {
    const p = await paqueteDe(client, o.id_aeronave, tipo);
    if (!p || p.estado !== "CONFIRMADO" || !p.extractos.length) {
      return { error: [404, `${o.aeronave_codigo} no tiene un paquete de ${ETIQUETA_TIPO[tipo]} confirmado.`] };
    }
    // Se copian como MANUAL: quedan editables y la congelación de la firma no los toca.
    const r = await client.query(
      `INSERT INTO taller_orden_extracto
         (id_orden, id_manual, pagina_desde, pagina_hasta, titulo, orden, origen, agregado_por)
       SELECT $1, e.id_manual, e.pagina_desde, e.pagina_hasta, e.titulo,
              (SELECT COALESCE(MAX(orden), 0) FROM taller_orden_extracto WHERE id_orden = $1) + e.orden + 1,
              'MANUAL', $3
         FROM taller_paquete_extracto e
        WHERE e.id_paquete = $2`,
      [o.id_orden, p.id_paquete, req.user.id_usuario]
    );
    return { body: { agregadas: r.rowCount } };
  });
});

exports.quitar = catchAsync(async (req, res) => {
  const idExtracto = Number(req.params.id_extracto);
  await conOrdenEditable(req, res, async (client, o) => {
    const r = await client.query(
      `DELETE FROM taller_orden_extracto
        WHERE id_extracto = $1 AND id_orden = $2 AND origen = 'MANUAL'
       RETURNING id_extracto`,
      [idValido(idExtracto) ? idExtracto : 0, o.id_orden]
    );
    if (!r.rowCount) return { error: [404, "Esa página no está entre las agregadas a esta orden"] };
    return { body: { ok: true } };
  });
});

exports.pdf = catchAsync(async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ message: "Orden inválida" });
  const r = await manualesDeOrden(Number(req.params.id), req.user);
  if (!r) return res.status(404).json({ message: "Orden de trabajo no encontrada" });
  const lista = [...r.del_paquete, ...r.agregadas];
  if (!lista.length) return res.status(400).json({ message: "Esta orden todavía no tiene páginas de manual." });
  res.json(await pdfDeExtractos(lista));
});
```

- [ ] **Step 2: Congelar el paquete al firmar**

En `controllers/taller/ordenTrabajoController.js`, agregar arriba, junto a los otros `require`:

```js
const { congelarPaqueteEnOrden } = require("../../services/manualesService");
```

Y en `firmarOrden`, entre el `UPDATE orden_trabajo SET … RETURNING *` y el `await client.query("COMMIT");`:

```js
    // Las páginas del paquete quedan congeladas en la orden: si el jefe cambia
    // el paquete más adelante, la orden conserva las que se usaron (spec
    // 2026-09-20 §7). Devolver y volver a firmar las reemplaza, no las duplica.
    await congelarPaqueteEnOrden(client, id);
```

- [ ] **Step 3: Registrar las rutas**

Agregar el `require`:

```js
const ordenManual = require("../controllers/taller/ordenManualController");
```

Y después de las rutas de paquetes:

```js
// Las páginas de manual de una orden. WRITE deja pasar al mecánico; el
// controller decide si es el de ESA orden.
router.get("/ordenes/:id/manuales", roleMiddleware(READ), ordenManual.listar);
router.post("/ordenes/:id/manuales", roleMiddleware(WRITE), ordenManual.agregar);
router.post("/ordenes/:id/manuales/paquete", roleMiddleware(WRITE), ordenManual.traerPaquete);
router.post("/ordenes/:id/manuales/pdf", roleMiddleware(READ), ordenManual.pdf);
router.delete("/ordenes/:id/manuales/:id_extracto", roleMiddleware(WRITE), ordenManual.quitar);
```

- [ ] **Step 4: Verificar que carga y que las pruebas puras siguen**

Run: `node -e "require('./routes/tallerRoutes'); console.log('ok')"` → `ok`; `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add legacy/CAA-backend/controllers/taller/ordenManualController.js legacy/CAA-backend/controllers/taller/ordenTrabajoController.js legacy/CAA-backend/routes/tallerRoutes.js
git commit -F <msg>   # "feat(taller): páginas de manual por orden, congeladas al firmar"
```

---

## Task 9: E2E del backend contra Supabase real

**Files:**
- Create: `legacy/CAA-backend/_e2e_manuales.js` (gitignored: **no se commitea**)

- [ ] **Step 1: Escribir el E2E**

```js
// legacy/CAA-backend/_e2e_manuales.js — NO se commitea (_*.js está en .gitignore).
/**
 * E2E de los manuales del taller contra Supabase REAL (spec 2026-09-20 §13).
 * Limpia TODO lo que crea, también si falla a mitad.
 *
 *   Terminal 1:  railway run bash -c "PORT=5099 node server.js"
 *                (confirmar en el log que ESE proceso es el que escucha en 5099:
 *                 CLAUDE.md §35.A y §37 — dos veces un backend viejo contestó las pruebas)
 *   Terminal 2:  railway run node _e2e_manuales.js
 */
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { PDFDocument, PDFName } = require("pdf-lib");
const db = require("./config/db");
const storage = require("./utils/storage");

const BASE = process.env.E2E_BASE || "http://localhost:5099/api";
const BUCKET = "manuales-taller";
let ok = 0;
let fallos = 0;
const check = (cond, msg, extra) => {
  if (cond) { ok++; console.log("  ✔", msg); } else { fallos++; console.log("  ✘", msg, extra !== undefined ? JSON.stringify(extra) : ""); }
};

async function api(token, method, ruta, body) {
  const r = await fetch(`${BASE}${ruta}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch { /* sin cuerpo */ }
  return { status: r.status, data };
}
async function login(username, password) {
  const r = await api(null, "POST", "/auth/login", { username, password });
  if (r.status !== 200) throw new Error(`login ${username}: ${r.status} ${JSON.stringify(r.data)}`);
  if (r.data.user?.must_complete_profile) throw new Error(`${username} tiene el candado de primer ingreso (§33)`);
  return r.data.token;
}

/** PDF de prueba: páginas cuyo ancho dice qué página son; la 1 con link a la última, que pesa 300 KB. */
async function pdfDePrueba(n, base) {
  const doc = await PDFDocument.create();
  const pags = [];
  for (let i = 1; i <= n; i++) pags.push(doc.addPage([base + i, 300]));
  const pesado = doc.context.register(doc.context.stream(crypto.randomBytes(300000)));
  pags[n - 1].node.setXObject(PDFName.of("Pesado"), pesado);
  const link = doc.context.register(doc.context.obj({ Type: "Annot", Subtype: "Link", Rect: [0, 0, 9, 9], Dest: [pags[n - 1].ref, "Fit"] }));
  pags[0].node.set(PDFName.of("Annots"), doc.context.obj([link]));
  return Buffer.from(await doc.save());
}
const anchos = async (url) => {
  const b = Buffer.from(await (await fetch(url)).arrayBuffer());
  return { anchos: (await PDFDocument.load(b)).getPages().map((p) => Math.round(p.getWidth())), bytes: b.length };
};
const sinFirma = (url) => url.split("?")[0];

// Lo que hay que limpiar
const limpiar = { manuales: [], ordenes: [], rutas: [], mant: null, tarea: null, cumpl: null, usuario: null, inicio: null };

async function subir(tokenJefe, bytes) {
  const s = await api(tokenJefe, "POST", "/taller/manuales/subida");
  limpiar.rutas.push(s.data.ruta);
  const put = await fetch(s.data.signedUrl, { method: "PUT", headers: { "content-type": "application/pdf", "x-upsert": "false" }, body: bytes });
  return { ruta: s.data.ruta, reserva: s, put: put.status };
}

async function main() {
  limpiar.inicio = (await db.query("SELECT (NOW() AT TIME ZONE 'America/El_Salvador') AS t")).rows[0].t;
  const zz = (await db.query("SELECT id_aeronave FROM aeronave WHERE codigo = 'ZZ-PRUEBA'")).rows[0].id_aeronave;

  // Un técnico temporal: "otro mecánico" que NO es de la orden.
  const hash = await bcrypt.hash("demo123", 10);
  const u = await db.query(
    `INSERT INTO usuario (nombre, apellido, username, password_hash, rol, activo, must_change_password,
                          must_set_email, datos_confirmados, correo)
     VALUES ('E2E','Otro','e2e.otro.manuales',$1,'TECNICO',true,false,false,true,'e2e.otro@example.com')
     RETURNING id_usuario`, [hash]);
  limpiar.usuario = u.rows[0].id_usuario;

  const jefe = await login("u_taller", "demo123");
  const meca = await login("u_mecanico", "demo123");
  const otro = await login("e2e.otro.manuales", "demo123");
  const idMeca = (await db.query("SELECT id_usuario FROM usuario WHERE username='u_mecanico'")).rows[0].id_usuario;

  console.log("A · Biblioteca");
  const r403 = await api(meca, "POST", "/taller/manuales/subida");
  check(r403.status === 403, "el mecánico no puede reservar una subida (403)", r403.status);

  const bytesA = await pdfDePrueba(12, 300);
  const shaA = crypto.createHash("sha256").update(bytesA).digest("hex");
  const subA = await subir(jefe, bytesA);
  check(/^manuales\/[0-9a-f-]{36}\.pdf$/.test(subA.ruta), "la ruta reservada es manuales/<uuid>.pdf", subA.ruta);
  check(subA.put === 200, "el navegador sube directo a Storage (PUT 200)", subA.put);
  const regA = await api(jefe, "POST", "/taller/manuales", { ruta: subA.ruta, titulo: "E2E manual A", categoria: "MANTENIMIENTO", aeronaves: [zz] });
  check(regA.status === 201, "registrar el manual (201)", regA);
  const A = regA.data;
  limpiar.manuales.push(A.id_manual);
  check(A.paginas === 12 && A.sha256 === shaA, "el SERVIDOR sacó las páginas y la huella", { p: A.paginas });

  const subDup = await subir(jefe, bytesA);
  const regDup = await api(jefe, "POST", "/taller/manuales", { ruta: subDup.ruta, titulo: "dup", categoria: "MANTENIMIENTO" });
  check(regDup.status === 409 && /ya está en la biblioteca/.test(regDup.data?.message), "el mismo archivo otra vez → 409 con el nombre", regDup);

  const lista = await api(meca, "GET", `/taller/manuales?aeronave=${zz}`);
  check(lista.data.some((m) => m.id_manual === A.id_manual), "el mecánico lo ve en la biblioteca del avión");
  const url = await api(meca, "GET", `/taller/manuales/${A.id_manual}/url`);
  const rango = await fetch(url.data.url, { headers: { Range: "bytes=0-99" } });
  check(rango.status === 206, "la URL firmada contesta por rango (206)", rango.status);

  const pdf1 = await api(meca, "POST", "/taller/manuales/pdf", { extractos: [
    { id_manual: A.id_manual, pagina_desde: 3, pagina_hasta: 4 },
    { id_manual: A.id_manual, pagina_desde: 1, pagina_hasta: 1 }] });
  check(pdf1.status === 200 && pdf1.data.paginas === 3, "imprimir páginas sueltas (200, 3 págs.)", pdf1);
  const a1 = await anchos(pdf1.data.url);
  check(JSON.stringify(a1.anchos) === "[303,304,301]", "salen exactamente esas páginas, en ese orden", a1.anchos);
  check(a1.bytes < 50000, "el link de la página 1 no arrastró los 300 KB", a1.bytes);
  limpiar.rutas.push(sinFirma(pdf1.data.url).split(`/${BUCKET}/`)[1]);
  const pdf2 = await api(meca, "POST", "/taller/manuales/pdf", { extractos: [
    { id_manual: A.id_manual, pagina_desde: 3, pagina_hasta: 4 },
    { id_manual: A.id_manual, pagina_desde: 1, pagina_hasta: 1 }] });
  check(sinFirma(pdf2.data.url) === sinFirma(pdf1.data.url), "la segunda vez reutiliza el mismo archivo");
  const pdfMal = await api(meca, "POST", "/taller/manuales/pdf", { extractos: [{ id_manual: A.id_manual, pagina_desde: 1, pagina_hasta: 13 }] });
  check(pdfMal.status === 400 && /tiene 12 páginas/.test(pdfMal.data?.message), "pasar del total → 400 con el mensaje", pdfMal);

  console.log("B · Paquetes");
  const pMeca = await api(meca, "PUT", `/taller/paquetes-manuales/${zz}/100HR`, { estado: "BORRADOR", extractos: [] });
  check(pMeca.status === 403 && pMeca.data?.message === "Acceso denegado", "el mecánico no edita paquetes (403 del rol)", pMeca);
  const pSin = await api(jefe, "PUT", `/taller/paquetes-manuales/${zz}/100HR`, { extractos: [] });
  check(pSin.status === 400 && /Falta el estado/.test(pSin.data?.message), "sin estado → 400", pSin);
  const pVacio = await api(jefe, "PUT", `/taller/paquetes-manuales/${zz}/100HR`, { estado: "CONFIRMADO", extractos: [] });
  check(pVacio.status === 400 && /al menos un rango/.test(pVacio.data?.message), "confirmar vacío → 400", pVacio);
  const pBorr = await api(jefe, "PUT", `/taller/paquetes-manuales/${zz}/100HR`, { estado: "BORRADOR", extractos: [{ id_manual: A.id_manual, pagina_desde: 2, pagina_hasta: 3, titulo: "E2E insp" }] });
  check(pBorr.status === 200 && pBorr.data.estado === "BORRADOR" && pBorr.data.extractos.length === 1, "guardar borrador", pBorr);
  const tabla = await api(meca, "GET", "/taller/paquetes-manuales");
  const celda = tabla.data.celdas.find((c) => c.id_aeronave === zz && c.tipo_mantenimiento === "100HR");
  check(celda?.estado === "BORRADOR" && celda.paginas === 2, "la tabla muestra la celda en borrador con 2 págs.", celda);

  console.log("C · Orden de trabajo");
  const mant = await db.query(
    `INSERT INTO mantenimiento_aeronave (id_aeronave, tipo, fecha_programada, descripcion, completado, estado)
     VALUES ($1, '100HR', CURRENT_DATE, 'E2E manuales', true, 'COMPLETADO') RETURNING id_mantenimiento`, [zz]);
  limpiar.mant = mant.rows[0].id_mantenimiento;
  const oA = await api(meca, "POST", "/taller/ordenes", { id_aeronave: zz, discrepancia: "E2E manuales A", id_mantenimiento: limpiar.mant });
  limpiar.ordenes.push(oA.data.id_orden);
  const idA = oA.data.id_orden;

  let m = await api(meca, "GET", `/taller/ordenes/${idA}/manuales`);
  check(m.data.inspeccion === "100HR" && m.data.paquete_estado === "BORRADOR" && m.data.del_paquete.length === 0,
    "orden de 100 h: el paquete en borrador NO se le muestra al mecánico", m.data);
  check(m.data.puede_agregar === true, "el mecánico de la orden puede agregar");

  await api(jefe, "PUT", `/taller/paquetes-manuales/${zz}/100HR`, { estado: "CONFIRMADO", extractos: [{ id_manual: A.id_manual, pagina_desde: 2, pagina_hasta: 3, titulo: "E2E insp" }] });
  m = await api(meca, "GET", `/taller/ordenes/${idA}/manuales`);
  check(m.data.del_paquete.length === 1 && m.data.del_paquete[0].pagina_desde === 2, "confirmado: ahora sí lo ve", m.data.del_paquete);

  const add = await api(meca, "POST", `/taller/ordenes/${idA}/manuales`, { id_manual: A.id_manual, pagina_desde: 5, pagina_hasta: 6, titulo: "E2E extra" });
  check(add.status === 201, "el mecánico agrega páginas a su orden (201)", add);
  const addOtro = await api(otro, "POST", `/taller/ordenes/${idA}/manuales`, { id_manual: A.id_manual, pagina_desde: 1, pagina_hasta: 1, titulo: "x" });
  check(addOtro.status === 403 && /Solo el jefe de taller o quien trabaja/.test(addOtro.data?.message),
    "otro mecánico no puede (403 del CONTROLLER, no del rol)", addOtro);
  await db.query("UPDATE orden_trabajo SET id_aprendiz = $2 WHERE id_orden = $1", [idA, limpiar.usuario]);
  const addSeg = await api(otro, "POST", `/taller/ordenes/${idA}/manuales`, { id_manual: A.id_manual, pagina_desde: 1, pagina_hasta: 1, titulo: "segundo" });
  check(addSeg.status === 201, "quien la trabaja de segundo (id_aprendiz) sí puede", addSeg);
  const qui = await api(otro, "DELETE", `/taller/ordenes/${idA}/manuales/${addSeg.data.id_extracto}`);
  check(qui.status === 200, "y quitar lo que agregó", qui);
  await db.query("UPDATE orden_trabajo SET id_aprendiz = NULL WHERE id_orden = $1", [idA]);

  const pOrden = await api(meca, "POST", `/taller/ordenes/${idA}/manuales/pdf`);
  const aO = await anchos(pOrden.data.url);
  check(JSON.stringify(aO.anchos) === "[302,303,305,306]", "PDF de la orden = paquete + agregadas, en orden", aO.anchos);
  limpiar.rutas.push(sinFirma(pOrden.data.url).split(`/${BUCKET}/`)[1]);

  const firma = await api(meca, "POST", `/taller/ordenes/${idA}/firmar`, { accion_correctiva: "E2E manuales" });
  check(firma.status === 200 && firma.data.estado === "FIRMADA", "firmar la orden", firma.status);
  const cong = await db.query("SELECT COUNT(*)::int n FROM taller_orden_extracto WHERE id_orden = $1 AND origen = 'PAQUETE'", [idA]);
  check(cong.rows[0].n === 1, "al firmar se copió el paquete a la orden", cong.rows[0]);
  const addFirmada = await api(meca, "POST", `/taller/ordenes/${idA}/manuales`, { id_manual: A.id_manual, pagina_desde: 1, pagina_hasta: 1, titulo: "x" });
  check(addFirmada.status === 409 && /quedaron fijas/.test(addFirmada.data?.message), "firmada: no se agregan páginas (409)", addFirmada);

  await api(jefe, "PUT", `/taller/paquetes-manuales/${zz}/100HR`, { estado: "CONFIRMADO", extractos: [{ id_manual: A.id_manual, pagina_desde: 7, pagina_hasta: 8, titulo: "E2E nuevo" }] });
  m = await api(meca, "GET", `/taller/ordenes/${idA}/manuales`);
  check(m.data.congelado && m.data.del_paquete[0].pagina_desde === 2 && m.data.agregadas.length === 1,
    "cambiar el paquete después NO toca la orden firmada", m.data);

  const dev = await api(jefe, "POST", `/taller/ordenes/${idA}/devolver`, { nota_revision: "E2E manuales" });
  check(dev.status === 200, "el jefe devuelve la orden", dev.status);
  m = await api(meca, "GET", `/taller/ordenes/${idA}/manuales`);
  check(!m.data.congelado && m.data.del_paquete[0].pagina_desde === 7, "abierta otra vez: vuelve el paquete en vivo", m.data.del_paquete);
  await api(meca, "POST", `/taller/ordenes/${idA}/firmar`, { accion_correctiva: "E2E manuales 2" });
  const cong2 = await db.query("SELECT pagina_desde FROM taller_orden_extracto WHERE id_orden = $1 AND origen = 'PAQUETE'", [idA]);
  check(cong2.rows.length === 1 && cong2.rows[0].pagina_desde === 7, "la segunda firma reemplaza, no duplica", cong2.rows);

  console.log("D · Qué inspección es la orden");
  const tarea = await db.query(
    `INSERT INTO taller_tarea_programada (id_aeronave, nombre, tipo, activo, origen)
     VALUES ($1, 'Inspección 100 horas', 'INSPECCION', false, 'E2E') RETURNING id_tarea`, [zz]);
  limpiar.tarea = tarea.rows[0].id_tarea;
  const cumpl = await db.query("INSERT INTO taller_cumplimiento (id_tarea, descripcion) VALUES ($1, 'E2E') RETURNING id_cumplimiento", [limpiar.tarea]);
  limpiar.cumpl = cumpl.rows[0].id_cumplimiento;
  const oB = await api(meca, "POST", "/taller/ordenes", { id_aeronave: zz, discrepancia: "E2E manuales B", id_cumplimiento: limpiar.cumpl });
  limpiar.ordenes.push(oB.data.id_orden);
  m = await api(meca, "GET", `/taller/ordenes/${oB.data.id_orden}/manuales`);
  check(m.data.inspeccion === "100HR", "sin mantenimiento: la saca del nombre de la tarea del cumplimiento", m.data.inspeccion);

  const oC = await api(meca, "POST", "/taller/ordenes", { id_aeronave: zz, discrepancia: "E2E manuales C" });
  limpiar.ordenes.push(oC.data.id_orden);
  m = await api(meca, "GET", `/taller/ordenes/${oC.data.id_orden}/manuales`);
  check(m.data.inspeccion === null && m.data.del_paquete.length === 0, "sin nada enlazado: no hay paquete", m.data);
  const traer = await api(meca, "POST", `/taller/ordenes/${oC.data.id_orden}/manuales/paquete`, { tipo: "100HR" });
  check(traer.status === 200 && traer.data.agregadas === 1, "traer las páginas del paquete de 100 h", traer);
  await api(meca, "POST", `/taller/ordenes/${oC.data.id_orden}/firmar`, { accion_correctiva: "E2E C" });
  const cC = await db.query("SELECT origen, COUNT(*)::int n FROM taller_orden_extracto WHERE id_orden = $1 GROUP BY origen", [oC.data.id_orden]);
  check(cC.rows.length === 1 && cC.rows[0].origen === "MANUAL", "lo traído a mano sobrevive a la firma y no se duplica", cC.rows);

  console.log("E · Revisiones y borrado");
  const subB = await subir(jefe, await pdfDePrueba(12, 500));
  const rev = await api(jefe, "POST", `/taller/manuales/${A.id_manual}/revision`, { ruta: subB.ruta, revision: "Rev E2E 2" });
  check(rev.status === 201 && rev.data.titulo === "E2E manual A", "subir revisión hereda el título", rev);
  limpiar.manuales.push(rev.data.id_manual);
  const vA = await api(jefe, "GET", `/taller/manuales/${A.id_manual}`);
  check(vA.data.estado === "REEMPLAZADO" && vA.data.reemplazado_por_revision === "Rev E2E 2", "el viejo queda REEMPLAZADO", vA.data.estado);
  const hereda = await db.query("SELECT COUNT(*)::int n FROM taller_manual_aeronave WHERE id_manual = $1 AND id_aeronave = $2", [rev.data.id_manual, zz]);
  check(hereda.rows[0].n === 1, "la revisión nueva hereda los aviones");
  const tabla2 = await api(jefe, "GET", "/taller/paquetes-manuales");
  const c2 = tabla2.data.celdas.find((c) => c.id_aeronave === zz && c.tipo_mantenimiento === "100HR");
  check(c2.reemplazados === 1, "la tabla avisa que el paquete usa una revisión reemplazada", c2);
  m = await api(meca, "GET", `/taller/ordenes/${idA}/manuales`);
  check(m.data.del_paquete[0].manual_estado === "REEMPLAZADO", "la orden marca «de la revisión anterior»");

  const delA = await api(jefe, "DELETE", `/taller/manuales/${A.id_manual}`);
  check(delA.status === 409 && /lo usan/.test(delA.data?.message), "borrar un manual en uso → 409", delA);
  const delB = await api(jefe, "DELETE", `/taller/manuales/${rev.data.id_manual}`);
  check(delB.status === 409 && /reemplazó a/.test(delB.data?.message), "borrar la revisión que reemplazó a otra → 409", delB);
  const subX = await subir(jefe, await pdfDePrueba(3, 700));
  const regX = await api(jefe, "POST", "/taller/manuales", { ruta: subX.ruta, titulo: "E2E libre", categoria: "CATALOGO" });
  const delX = await api(jefe, "DELETE", `/taller/manuales/${regX.data.id_manual}`);
  check(delX.status === 200, "borrar uno libre (200)", delX);
  check(await storage.existeArchivo(BUCKET, subX.ruta), "…y su archivo SIGUE en el bucket");
  const edit = await api(jefe, "PATCH", `/taller/manuales/${rev.data.id_manual}`, { revision: "Rev E2E 2b" });
  check(edit.status === 200 && edit.data.titulo === "E2E manual A" && edit.data.revision === "Rev E2E 2b",
    "editar un campo no nulifica los demás", edit.data);
}

async function limpieza() {
  const ids = limpiar.ordenes.filter(Boolean);
  if (ids.length) {
    await db.query("DELETE FROM taller_orden_extracto WHERE id_orden = ANY($1::int[])", [ids]);
    await db.query("DELETE FROM orden_trabajo WHERE id_orden = ANY($1::int[])", [ids]);
  }
  await db.query("DELETE FROM taller_paquete_manual WHERE id_aeronave = (SELECT id_aeronave FROM aeronave WHERE codigo='ZZ-PRUEBA')");
  const man = await db.query("SELECT id_manual FROM taller_manual WHERE titulo LIKE 'E2E%' OR titulo = 'dup'");
  const mids = man.rows.map((r) => r.id_manual);
  if (mids.length) {
    await db.query("UPDATE taller_manual SET id_reemplazado_por = NULL WHERE id_manual = ANY($1::int[])", [mids]);
    await db.query("DELETE FROM taller_manual WHERE id_manual = ANY($1::int[])", [mids]);
  }
  if (limpiar.cumpl) await db.query("DELETE FROM taller_cumplimiento WHERE id_cumplimiento = $1", [limpiar.cumpl]);
  if (limpiar.tarea) await db.query("DELETE FROM taller_tarea_programada WHERE id_tarea = $1", [limpiar.tarea]);
  if (limpiar.mant) await db.query("DELETE FROM mantenimiento_aeronave WHERE id_mantenimiento = $1", [limpiar.mant]);
  if (limpiar.inicio) {
    // devolverOrden notifica al mecánico: esas notificaciones son de la prueba.
    await db.query(
      `DELETE FROM notificacion WHERE creada_en >= $1 AND mensaje ILIKE '%E2E%'`, [limpiar.inicio]);
  }
  if (limpiar.usuario) await db.query("DELETE FROM usuario WHERE id_usuario = $1", [limpiar.usuario]);
  for (const r of limpiar.rutas.filter(Boolean)) await storage.borrarArchivo(BUCKET, r);
  const resto = await db.query(
    `SELECT (SELECT COUNT(*) FROM taller_manual WHERE titulo LIKE 'E2E%')::int manuales,
            (SELECT COUNT(*) FROM orden_trabajo WHERE discrepancia LIKE 'E2E manuales%')::int ordenes,
            (SELECT COUNT(*) FROM usuario WHERE username = 'e2e.otro.manuales')::int usuarios`);
  console.log("limpieza:", resto.rows[0]);
}

main()
  .catch((e) => { fallos++; console.error("💥", e); })
  .finally(async () => {
    try { await limpieza(); } catch (e) { console.error("💥 limpieza:", e.message); }
    console.log(`\n${ok} OK · ${fallos} fallos`);
    process.exit(fallos ? 1 : 0);
  });
```

> Antes de correrlo, confirmar dos supuestos con `node query.js`: (1) que `usuario` acepta el INSERT de arriba (si alguna columna NOT NULL nueva falta, agregarla); (2) que `devolverOrden` escribe la nota en `notificacion.mensaje` — si usa otro texto, ajustar el `DELETE` de notificaciones a lo que realmente escribe.

- [ ] **Step 2: Levantar el backend local con las variables de Railway**

Run (terminal aparte, desde `legacy/CAA-backend`, en segundo plano): `railway run bash -c "PORT=5099 node server.js"`
Expected en el log: el servidor escuchando en **5099**. Verificar con `netstat -ano | findstr 5099` que el PID que escucha es el recién levantado (no uno viejo).

- [ ] **Step 3: Correr el E2E**

Run: `railway run node _e2e_manuales.js`
Expected: todas las líneas `✔`, `limpieza: { manuales: 0, ordenes: 0, usuarios: 0 }` y `N OK · 0 fallos`. Si algo falla: arreglar el código (no la prueba) salvo que la prueba esté mal, y volver a correr.

- [ ] **Step 4: Detener el backend local**

Terminar el proceso de la Step 2.

- [ ] **Step 5: Commit** — nada que commitear (el E2E es gitignored). Si hubo arreglos de código en esta task, commitearlos: `fix(taller): <lo que se arregló> (E2E de manuales)`.

---

## Task 10: Frontend — base (dependencia, API, pdf.js, formato, subida)

**Files:**
- Modify: `CAA-frontend/package.json`
- Create: `CAA-frontend/src/services/manualesApi.js`
- Create: `CAA-frontend/src/pages/Taller/manuales/pdfjs.js`
- Create: `CAA-frontend/src/pages/Taller/manuales/formatoManual.js`
- Create: `CAA-frontend/src/pages/Taller/manuales/subirManual.js`

- [ ] **Step 1: Instalar pdf.js**

Run (desde `CAA-frontend`): `npm install pdfjs-dist@4.10.38 --save-exact`
Si `CAA-frontend/node_modules` no existe todavía, correr antes `npm ci`.

- [ ] **Step 2: `src/services/manualesApi.js`**

```js
import axios from "axios";
import { API_URL } from "../api/axiosConfig";

// Manuales del taller (spec 2026-09-20). Biblioteca, paquetes por inspección y
// páginas de una orden de trabajo.
const T = () => `${API_URL}/taller`;

export const getManuales = async (params = {}) => (await axios.get(`${T()}/manuales`, { params })).data;
export const getManual = async (id) => (await axios.get(`${T()}/manuales/${id}`)).data;
export const getManualUrl = async (id) => (await axios.get(`${T()}/manuales/${id}/url`)).data;
export const reservarSubidaManual = async () => (await axios.post(`${T()}/manuales/subida`)).data;
export const registrarManual = async (datos) => (await axios.post(`${T()}/manuales`, datos)).data;
export const subirRevisionManual = async (id, datos) =>
  (await axios.post(`${T()}/manuales/${id}/revision`, datos)).data;
export const editarManual = async (id, datos) => (await axios.patch(`${T()}/manuales/${id}`, datos)).data;
export const borrarManual = async (id) => (await axios.delete(`${T()}/manuales/${id}`)).data;
export const pdfDeManual = async (extractos) => (await axios.post(`${T()}/manuales/pdf`, { extractos })).data;

export const getTablaPaquetes = async () => (await axios.get(`${T()}/paquetes-manuales`)).data;
export const getPaquete = async (idAeronave, tipo) =>
  (await axios.get(`${T()}/paquetes-manuales/${idAeronave}/${tipo}`)).data;
export const guardarPaquete = async (idAeronave, tipo, datos) =>
  (await axios.put(`${T()}/paquetes-manuales/${idAeronave}/${tipo}`, datos)).data;

export const getManualesOrden = async (idOrden) => (await axios.get(`${T()}/ordenes/${idOrden}/manuales`)).data;
export const agregarManualOrden = async (idOrden, datos) =>
  (await axios.post(`${T()}/ordenes/${idOrden}/manuales`, datos)).data;
export const traerPaqueteOrden = async (idOrden, tipo) =>
  (await axios.post(`${T()}/ordenes/${idOrden}/manuales/paquete`, { tipo })).data;
export const quitarManualOrden = async (idOrden, idExtracto) =>
  (await axios.delete(`${T()}/ordenes/${idOrden}/manuales/${idExtracto}`)).data;
export const pdfDeOrden = async (idOrden) => (await axios.post(`${T()}/ordenes/${idOrden}/manuales/pdf`)).data;

/**
 * Abre en otra pestaña el PDF que devuelve `obtener()` ({url}).
 *
 * La pestaña se abre YA, dentro del clic, y recién después se le pone la
 * dirección: si se abre después del `await`, Safari y Chrome en el celular la
 * bloquean como popup. La URL es firmada: se abre sin token.
 */
export async function abrirPdfCuandoEste(obtener) {
  const pestana = window.open("", "_blank");
  try {
    const { url } = await obtener();
    if (pestana) pestana.location.href = url;
    else window.location.assign(url);
  } catch (e) {
    pestana?.close();
    throw e;
  }
}
```

- [ ] **Step 3: `src/pages/Taller/manuales/pdfjs.js`**

```js
/**
 * pdf.js, cargado solo cuando se abre un manual: no engorda el bundle principal.
 *
 * Versión fija 4.10.38 y el build LEGACY: el normal usa Promise.withResolvers,
 * que Safari no tiene antes de iOS 17.4, y los mecánicos abren esto en su
 * celular. El legacy trae los polyfills.
 */
let cargando = null;

export function cargarPdfjs() {
  if (!cargando) {
    cargando = Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
    ])
      .then(([pdfjs, worker]) => {
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        return pdfjs;
      })
      .catch((e) => {
        cargando = null;
        throw e;
      });
  }
  return cargando;
}

/**
 * Abre un manual pidiendo SOLO los bytes que hacen falta.
 *
 * Supabase sí contesta peticiones por rango (206), pero no deja que el navegador
 * lea la cabecera Accept-Ranges (no la expone por CORS). pdf.js la mira para
 * decidir si pide por partes; sin ella bajaría los 72 MB enteros. Por eso los
 * rangos los pide este código, con PDFDataRangeTransport y el tamaño del archivo
 * que ya está en la base. (Medido el 2026-09-21.)
 *
 * `obtenerUrl` se vuelve a llamar una vez si la URL firmada venció (dura 1 h).
 * Devuelve la tarea de pdf.js: `.promise` da el documento, `.destroy()` lo cierra.
 */
export async function abrirPorRangos({ obtenerUrl, largo, onError }) {
  const pdfjs = await cargarPdfjs();
  let url = await obtenerUrl();
  const transporte = new pdfjs.PDFDataRangeTransport(largo, null);

  const pedir = async (desde, hasta, reintento = false) => {
    const r = await fetch(url, { headers: { Range: `bytes=${desde}-${hasta - 1}` } });
    if ((r.status === 400 || r.status === 403) && !reintento) {
      url = await obtenerUrl();
      return pedir(desde, hasta, true);
    }
    if (r.status !== 206 && r.status !== 200) throw new Error(`HTTP ${r.status}`);
    const datos = new Uint8Array(await r.arrayBuffer());
    // Si el servidor ignoró el rango (200), se recorta: pdf.js espera [desde, hasta).
    return r.status === 200 ? datos.subarray(desde, hasta) : datos;
  };

  transporte.requestDataRange = (desde, hasta) => {
    pedir(desde, hasta)
      .then((datos) => transporte.onDataRange(desde, datos))
      .catch((e) => onError?.(e));
  };

  return pdfjs.getDocument({
    range: transporte,
    length: largo,
    rangeChunkSize: 262144,
    disableAutoFetch: true,
    disableStream: true,
  });
}
```

- [ ] **Step 4: `src/pages/Taller/manuales/formatoManual.js`**

```js
export const CATEGORIA = {
  MANTENIMIENTO: "Mantenimiento",
  PARTES: "Catálogo de partes",
  OVERHAUL: "Overhaul",
  OPERACION: "Operación (POH)",
  BOLETINES: "Boletines",
  NORMATIVA: "Normativa",
  CATALOGO: "Catálogo comercial",
};

export const TIPOS = ["25HR", "50HR", "100HR", "ANUAL"];
export const TIPO_INSPECCION = { "25HR": "25 h", "50HR": "50 h", "100HR": "100 h", ANUAL: "anual" };

export function pesoLegible(bytes) {
  const mb = Number(bytes) / 1048576;
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(Number(bytes) / 1024))} KB`;
}

export const mensajeError = (e, porDefecto) => e?.response?.data?.message || e?.message || porDefecto;
```

- [ ] **Step 5: `src/pages/Taller/manuales/subirManual.js`**

```js
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
```

- [ ] **Step 6: Verificar que compila**

Run (desde `CAA-frontend`): `npm run build`
Expected: build OK (los archivos nuevos todavía no se importan desde ninguna pantalla; esto confirma que la dependencia instaló bien).

- [ ] **Step 7: Commit**

```bash
git add CAA-frontend/package.json CAA-frontend/package-lock.json CAA-frontend/src/services/manualesApi.js CAA-frontend/src/pages/Taller/manuales/pdfjs.js CAA-frontend/src/pages/Taller/manuales/formatoManual.js CAA-frontend/src/pages/Taller/manuales/subirManual.js
git commit -F <msg>   # "feat(taller): cliente de manuales y apertura por rangos con pdf.js"
```

---

## Task 11: Frontend — el visor

**Files:**
- Create: `CAA-frontend/src/pages/Taller/manuales/VisorManual.jsx`
- Create: `CAA-frontend/src/pages/Taller/manuales/VisorManualModal.jsx`
- Create: `CAA-frontend/src/pages/Taller/manuales/manuales.css`

- [ ] **Step 1: `VisorManual.jsx`**

```jsx
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { abrirPorRangos } from "./pdfjs";
import { getManualUrl, pdfDeManual, abrirPdfCuandoEste } from "../../../services/manualesApi";
import { mensajeError } from "./formatoManual";
import "../inventario/inventario.css";
import "./manuales.css";

/**
 * Visor de manuales. Uno solo para la biblioteca, el configurador de paquetes y
 * la orden de trabajo: solo cambia lo que hace el botón de abajo (spec §9.2).
 *
 * Se trabaja SIEMPRE con la página del PDF (la del contador), no con la
 * numeración impresa del manual (2-15, fichas 1A11): el título del rango dice qué es.
 *
 * @param accion  { etiqueta, icono, pideTitulo, ejecutar({pagina_desde, pagina_hasta, titulo}) }
 *                Sin `accion`, el botón imprime las páginas marcadas.
 */
export default function VisorManual({ manual, paginaInicial = 1, accion }) {
  const total = manual.paginas;
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState(null);
  const [intento, setIntento] = useState(0);
  const [pagina, setPagina] = useState(paginaInicial);
  const [irA, setIrA] = useState(String(paginaInicial));
  const [zoom, setZoom] = useState(1);
  const [indice, setIndice] = useState([]);
  const [verIndice, setVerIndice] = useState(() => window.innerWidth > 900);
  const [ultimaEntrada, setUltimaEntrada] = useState("");
  const [desde, setDesde] = useState(null);
  const [hasta, setHasta] = useState(null);
  const [titulo, setTitulo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [busqueda, setBusqueda] = useState({ texto: "", activa: false, progreso: 0, sinResultado: false });
  const [ancho, setAncho] = useState(0);
  const lienzo = useRef(null);
  const marco = useRef(null);
  const tareaRender = useRef(null);
  const textos = useRef(new Map());
  const cancelarBusqueda = useRef(false);

  const ir = useCallback((n) => {
    const p = Math.max(1, Math.min(total, Math.round(Number(n)) || 1));
    setPagina(p);
    setIrA(String(p));
  }, [total]);

  useEffect(() => { ir(paginaInicial); }, [paginaInicial, ir]);

  // Abrir el documento (solo pide los bytes que hacen falta).
  useEffect(() => {
    let vivo = true;
    let tarea = null;
    setDoc(null);
    setError(null);
    textos.current = new Map();
    abrirPorRangos({
      obtenerUrl: async () => (await getManualUrl(manual.id_manual)).url,
      largo: Number(manual.tamano_bytes),
      onError: () => vivo && setError("Se cortó la conexión leyendo el manual."),
    })
      .then((t) => {
        tarea = t;
        if (!vivo) { t.destroy(); return null; }
        return t.promise;
      })
      .then((d) => {
        if (!vivo || !d) return null;
        setDoc(d);
        return d.getOutline();
      })
      .then((o) => { if (vivo && o) setIndice(o); })
      .catch(() => vivo && setError("No se pudo abrir el manual."));
    return () => {
      vivo = false;
      cancelarBusqueda.current = true;
      tarea?.destroy();
    };
  }, [manual.id_manual, manual.tamano_bytes, intento]);

  // Ancho disponible para la hoja.
  useEffect(() => {
    if (!marco.current) return undefined;
    const ro = new ResizeObserver(([e]) => setAncho(Math.floor(e.contentRect.width)));
    ro.observe(marco.current);
    return () => ro.disconnect();
  }, []);

  // Dibujar la página actual.
  useEffect(() => {
    if (!doc || !ancho || !lienzo.current) return undefined;
    let cancelado = false;
    (async () => {
      const pg = await doc.getPage(pagina);
      if (cancelado) return;
      tareaRender.current?.cancel();
      const base = pg.getViewport({ scale: 1 });
      const escala = Math.min((ancho - 24) / base.width, 3) * zoom;
      const dpr = window.devicePixelRatio || 1;
      const vp = pg.getViewport({ scale: escala * dpr });
      const c = lienzo.current;
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      c.style.width = `${Math.floor(vp.width / dpr)}px`;
      c.style.height = `${Math.floor(vp.height / dpr)}px`;
      const t = pg.render({ canvasContext: c.getContext("2d"), viewport: vp });
      tareaRender.current = t;
      await t.promise.catch(() => {}); // cancelada: normal al pasar rápido de página
    })().catch(() => {});
    return () => { cancelado = true; };
  }, [doc, pagina, zoom, ancho]);

  // Flechas del teclado para pasar de página (salvo escribiendo en un campo).
  useEffect(() => {
    const tecla = (e) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName)) return;
      if (e.key === "ArrowRight") ir(pagina + 1);
      if (e.key === "ArrowLeft") ir(pagina - 1);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [pagina, ir]);

  const irAEntrada = async (item) => {
    try {
      const dest = typeof item.dest === "string" ? await doc.getDestination(item.dest) : item.dest;
      if (!dest) return;
      const idx = typeof dest[0] === "number" ? dest[0] : await doc.getPageIndex(dest[0]);
      ir(idx + 1);
      setUltimaEntrada(String(item.title || "").trim());
      if (window.innerWidth <= 900) setVerIndice(false);
    } catch {
      toast.error("Esa entrada del índice no apunta a ninguna página");
    }
  };

  const textoDe = async (n) => {
    if (!textos.current.has(n)) {
      const pg = await doc.getPage(n);
      const tc = await pg.getTextContent();
      textos.current.set(n, tc.items.map((i) => i.str).join(" ").toLowerCase());
    }
    return textos.current.get(n);
  };

  const buscarSiguiente = async () => {
    const q = busqueda.texto.trim().toLowerCase();
    if (!q || !doc) return;
    cancelarBusqueda.current = false;
    setBusqueda((b) => ({ ...b, activa: true, progreso: 0, sinResultado: false }));
    for (let k = 1; k <= total; k++) {
      if (cancelarBusqueda.current) break;
      const n = ((pagina - 1 + k) % total) + 1;
      const t = await textoDe(n).catch(() => "");
      if (k % 10 === 0) setBusqueda((b) => ({ ...b, progreso: k / total }));
      if (t.includes(q)) {
        ir(n);
        setBusqueda((b) => ({ ...b, activa: false }));
        return;
      }
    }
    setBusqueda((b) => ({ ...b, activa: false, sinResultado: !cancelarBusqueda.current }));
  };

  const marcarDesde = () => {
    setDesde(pagina);
    if (hasta !== null && hasta < pagina) setHasta(pagina);
    if (!titulo && ultimaEntrada) setTitulo(ultimaEntrada);
  };
  const marcarHasta = () => {
    setHasta(pagina);
    if (desde === null || desde > pagina) setDesde(pagina);
  };
  const rango = desde !== null && hasta !== null ? { pagina_desde: desde, pagina_hasta: hasta } : null;

  const efectiva = accion || {
    etiqueta: "Imprimir estas páginas",
    icono: "bi-printer",
    pideTitulo: false,
    ejecutar: (r) => abrirPdfCuandoEste(() => pdfDeManual([{ id_manual: manual.id_manual, ...r }])),
  };

  const ejecutar = async () => {
    if (!rango) return toast.error("Marcá desde qué página y hasta cuál");
    if (efectiva.pideTitulo && !titulo.trim()) {
      return toast.error("Poné qué es ese rango (ej. «Inspección 100 h», «Lubricación»)");
    }
    setEnviando(true);
    try {
      // Sin await antes de esto: si la acción abre una pestaña, tiene que ser dentro del clic.
      await efectiva.ejecutar({ ...rango, titulo: titulo.trim() });
      setDesde(null);
      setHasta(null);
      setTitulo("");
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo"), {
        action: { label: "Reintentar", onClick: () => ejecutar() },
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="vm">
      <div className="vm-barra">
        <button type="button" className="adf-icon-btn" title="Índice del manual"
          aria-pressed={verIndice} onClick={() => setVerIndice((v) => !v)}>
          <i className="bi bi-list-nested"></i>
        </button>
        <div className="vm-nav">
          <button type="button" className="adf-icon-btn" title="Página anterior"
            onClick={() => ir(pagina - 1)} disabled={pagina <= 1}>
            <i className="bi bi-chevron-left"></i>
          </button>
          <input className="vm-pag" inputMode="numeric" aria-label="Página" value={irA}
            onChange={(e) => setIrA(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") ir(irA); }}
            onBlur={() => ir(irA)} />
          <span className="vm-de">de {total}</span>
          <button type="button" className="adf-icon-btn" title="Página siguiente"
            onClick={() => ir(pagina + 1)} disabled={pagina >= total}>
            <i className="bi bi-chevron-right"></i>
          </button>
        </div>
        <div className="vm-zoom">
          <button type="button" className="adf-icon-btn" title="Alejar"
            onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}>
            <i className="bi bi-zoom-out"></i>
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" className="adf-icon-btn" title="Acercar"
            onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.25) * 100) / 100))}>
            <i className="bi bi-zoom-in"></i>
          </button>
        </div>
        <form className="vm-buscar" onSubmit={(e) => { e.preventDefault(); buscarSiguiente(); }}>
          <input className="inv-campo" placeholder="Buscar en el manual" value={busqueda.texto}
            onChange={(e) => setBusqueda((b) => ({ ...b, texto: e.target.value, sinResultado: false }))} />
          {busqueda.activa ? (
            <button type="button" className="adf-btn secondary small"
              onClick={() => { cancelarBusqueda.current = true; }}>
              Cancelar {Math.round(busqueda.progreso * 100)}%
            </button>
          ) : (
            <button type="submit" className="adf-btn secondary small"><i className="bi bi-search"></i> Buscar</button>
          )}
        </form>
      </div>

      {busqueda.sinResultado && (
        <p className="vm-aviso">
          No aparece «{busqueda.texto}» en el texto del manual. Si es un escaneo sin texto, usá el índice o el número de página.
        </p>
      )}

      <div className="vm-cuerpo">
        {verIndice && (
          <nav className="vm-indice" aria-label="Índice del manual">
            {indice.length
              ? <ListaIndice items={indice} onElegir={irAEntrada} nivel={0} />
              : <p className="vm-vacio">Este manual no trae índice. Usá la búsqueda o el número de página.</p>}
          </nav>
        )}
        <div className="vm-hoja" ref={marco}>
          {error && (
            <div className="vm-error">
              {error}
              <button type="button" className="adf-btn secondary small" onClick={() => setIntento((n) => n + 1)}>
                Reintentar
              </button>
            </div>
          )}
          {!error && !doc && <div className="vm-cargando">Abriendo el manual…</div>}
          <canvas ref={lienzo} className="vm-lienzo" style={{ display: doc && !error ? "block" : "none" }} />
        </div>
      </div>

      <div className="vm-rango">
        <div className="vm-rango__marcas">
          <button type="button" className="adf-btn secondary small" onClick={marcarDesde}>
            <i className="bi bi-arrow-bar-right"></i> Desde aquí
          </button>
          <button type="button" className="adf-btn secondary small" onClick={marcarHasta}>
            <i className="bi bi-arrow-bar-left"></i> Hasta aquí
          </button>
          <span className="vm-rango__txt">
            {rango
              ? `Págs. ${desde}–${hasta} (${hasta - desde + 1})`
              : desde !== null ? `Desde la ${desde}…` : "Marcá un rango de páginas"}
          </span>
        </div>
        {efectiva.pideTitulo && (
          <input className="inv-campo vm-rango__titulo" maxLength={200} value={titulo}
            placeholder="Qué es: «5-20-00 Scheduled Maintenance»"
            onChange={(e) => setTitulo(e.target.value)} />
        )}
        <button type="button" className="adf-btn" disabled={!rango || enviando} onClick={ejecutar}>
          <i className={`bi ${efectiva.icono}`}></i> {enviando ? "Un momento…" : efectiva.etiqueta}
        </button>
      </div>
    </div>
  );
}

function ListaIndice({ items, onElegir, nivel }) {
  return (
    <ul className="vm-indice__lista">
      {items.map((it, i) => <EntradaIndice key={`${nivel}-${i}`} item={it} onElegir={onElegir} nivel={nivel} />)}
    </ul>
  );
}

function EntradaIndice({ item, onElegir, nivel }) {
  const [abierta, setAbierta] = useState(false);
  const hijos = item.items?.length > 0;
  return (
    <li>
      <div className="vm-indice__fila" style={{ paddingLeft: 6 + nivel * 12 }}>
        {hijos ? (
          <button type="button" className="vm-indice__toggle" aria-label={abierta ? "Cerrar" : "Abrir"}
            onClick={() => setAbierta((a) => !a)}>
            <i className={`bi ${abierta ? "bi-chevron-down" : "bi-chevron-right"}`}></i>
          </button>
        ) : <span className="vm-indice__toggle" />}
        <button type="button" className="vm-indice__titulo" title={item.title} onClick={() => onElegir(item)}>
          {item.title}
        </button>
      </div>
      {hijos && abierta && <ListaIndice items={item.items} onElegir={onElegir} nivel={nivel + 1} />}
    </li>
  );
}
```

- [ ] **Step 2: `VisorManualModal.jsx`**

```jsx
import VisorManual from "./VisorManual";

/**
 * El visor en un modal. El clic en el fondo cierra SOLO este modal
 * (stopPropagation): se abre encima de otros modales (la orden de trabajo) y
 * sin eso el clic cerraba los dos.
 */
export default function VisorManualModal({ manual, paginaInicial, accion, onClose }) {
  return (
    <div className="adf-modal-backdrop" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="adf-card adf-modal-card vm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="adf-edit-head">
          <span className="adf-edit-head__title vm-modal__titulo">
            <span className="adf-edit-head__chip"><i className="bi bi-book"></i></span>
            {manual.titulo}
            {manual.revision && <small className="man-tenue"> · {manual.revision}</small>}
          </span>
          <button type="button" className="adf-btn secondary" onClick={onClose}>Cerrar</button>
        </div>
        <VisorManual manual={manual} paginaInicial={paginaInicial} accion={accion} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `manuales.css`**

```css
/* Manuales del taller (spec 2026-09-20). Tokens de src/styles/tokens.css. */

/* ── Visor ──────────────────────────────────────────────────────────────── */
.vm { display: flex; flex-direction: column; min-height: 0; height: 100%; background: var(--c-surface-0); }
.vm-modal {
  padding: 0; width: min(1200px, 96vw); max-width: none;
  height: calc(100vh - 2 * var(--sp-6)); max-height: none; overflow: hidden;
  display: flex; flex-direction: column;
}
.vm-modal .vm { flex: 1; }
.vm-modal__titulo { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vm-barra {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--c-line-1);
}
.vm-nav, .vm-zoom { display: flex; align-items: center; gap: var(--sp-1); font-size: 0.85rem; color: var(--c-ink-2); }
.vm-zoom span { min-width: 44px; text-align: center; font-variant-numeric: tabular-nums; }
.vm-pag {
  width: 64px; height: 32px; text-align: center; font-variant-numeric: tabular-nums;
  border: 1px solid var(--c-line-2); border-radius: var(--radius-sm);
  background: var(--c-surface-0); color: var(--c-ink-1);
}
.vm-de { color: var(--c-ink-3); font-variant-numeric: tabular-nums; }
.vm-buscar { display: flex; gap: var(--sp-2); margin-left: auto; }
.vm-buscar .inv-campo { min-width: 180px; height: 32px; }
.vm-aviso { margin: 0; padding: var(--sp-2) var(--sp-3); font-size: 0.82rem; color: var(--c-warn-700); background: var(--c-warn-50); }
.vm-cuerpo { position: relative; flex: 1; display: flex; min-height: 0; }
.vm-indice {
  width: 280px; flex-shrink: 0; overflow-y: auto; padding: var(--sp-2) 0;
  border-right: 1px solid var(--c-line-1); font-size: 0.82rem; background: var(--c-surface-0);
}
.vm-indice__lista { list-style: none; margin: 0; padding: 0; }
.vm-indice__fila { display: flex; align-items: flex-start; }
.vm-indice__toggle { width: 22px; flex-shrink: 0; background: none; border: 0; padding: 3px 0; color: var(--c-ink-3); cursor: pointer; }
.vm-indice__titulo {
  flex: 1; min-width: 0; text-align: left; background: none; border: 0; padding: 3px 6px;
  color: var(--c-ink-2); cursor: pointer; border-radius: var(--radius-xs); line-height: 1.3;
}
.vm-indice__titulo:hover { background: var(--c-surface-1); color: var(--c-ink-1); }
.vm-hoja {
  flex: 1; min-width: 0; overflow: auto; display: flex; justify-content: center; align-items: flex-start;
  padding: var(--sp-3); background: var(--c-surface-2);
}
.vm-lienzo { background: #fff; box-shadow: 0 1px 3px oklch(20% 0.02 262 / 0.2); }
.vm-cargando, .vm-vacio { color: var(--c-ink-3); font-size: 0.9rem; padding: var(--sp-6) var(--sp-3); text-align: center; }
.vm-error {
  color: var(--c-danger-700); font-size: 0.9rem; padding: var(--sp-6);
  display: flex; flex-direction: column; align-items: center; gap: var(--sp-3);
}
.vm-rango {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-3);
  padding: var(--sp-3); border-top: 1px solid var(--c-line-1); background: var(--c-surface-0);
}
.vm-rango__marcas { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); }
.vm-rango__txt { font-size: 0.85rem; color: var(--c-ink-2); font-variant-numeric: tabular-nums; }
.vm-rango__titulo { flex: 1; min-width: 200px; height: 36px; }
.man-tenue { color: var(--c-ink-3); }
@media (max-width: 900px) {
  .vm-modal { width: 100vw; height: 100dvh; border-radius: 0; }
  .vm-indice {
    position: absolute; top: 0; bottom: 0; left: 0; z-index: 2; width: min(300px, 85vw);
    box-shadow: 2px 0 8px oklch(20% 0.02 262 / 0.2);
  }
  .vm-buscar { margin-left: 0; width: 100%; }
  .vm-buscar .inv-campo { flex: 1; min-width: 0; }
  .vm-rango__titulo { min-width: 0; flex-basis: 100%; }
}
```

- [ ] **Step 4: Verificar que compila**

Run: `npm run build` → OK.

- [ ] **Step 5: Commit**

```bash
git add CAA-frontend/src/pages/Taller/manuales/VisorManual.jsx CAA-frontend/src/pages/Taller/manuales/VisorManualModal.jsx CAA-frontend/src/pages/Taller/manuales/manuales.css
git commit -F <msg>   # "feat(taller): visor de manuales (índice, búsqueda, desde/hasta)"
```

---

## Task 12: Frontend — Biblioteca, formulario, página y menú

**Files:**
- Create: `CAA-frontend/src/pages/Taller/manuales/Biblioteca.jsx`
- Create: `CAA-frontend/src/pages/Taller/manuales/ManualFormModal.jsx`
- Create: `CAA-frontend/src/pages/Taller/Manuales.jsx`
- Modify: `CAA-frontend/src/pages/Taller/manuales/manuales.css` (agregar al final)
- Modify: `CAA-frontend/src/App.jsx`
- Modify: `CAA-frontend/src/components/TallerSidebar/TallerSidebar.jsx`
- Modify: `CAA-frontend/src/components/AdminSidebar/AdminSidebar.jsx`

- [ ] **Step 1: `Biblioteca.jsx`**

```jsx
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getManuales } from "../../../services/manualesApi";
import { esJefeTaller } from "../permisos";
import VisorManualModal from "./VisorManualModal";
import ManualFormModal from "./ManualFormModal";
import { CATEGORIA, pesoLegible, mensajeError } from "./formatoManual";

/** La biblioteca: todos los manuales, filtrables por avión. Todo el taller la ve. */
export default function Biblioteca() {
  const jefe = esJefeTaller();
  const [manuales, setManuales] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState("todos"); // 'todos' | 'generales' | 'sin' | matrícula
  const [q, setQ] = useState("");
  const [verReemplazados, setVerReemplazados] = useState(false);
  const [abierto, setAbierto] = useState(null);
  const [form, setForm] = useState(null);

  const cargar = () => {
    setCargando(true);
    getManuales(verReemplazados ? { incluir_reemplazados: "true" } : {})
      .then(setManuales)
      .catch((e) => toast.error(mensajeError(e, "No se pudo cargar la biblioteca")))
      .finally(() => setCargando(false));
  };
  useEffect(cargar, [verReemplazados]);

  const aviones = useMemo(
    () => [...new Set(manuales.flatMap((m) => m.aeronaves.map((a) => a.codigo)))].sort(),
    [manuales]
  );
  const porConfirmar = manuales.filter((m) => m.necesita_confirmacion).length;

  const texto = q.trim().toLowerCase();
  const visibles = manuales.filter((m) => {
    if (filtro === "generales" && !m.es_general) return false;
    if (filtro === "sin" && (m.es_general || m.aeronaves.length)) return false;
    if (!["todos", "generales", "sin"].includes(filtro) && !m.aeronaves.some((a) => a.codigo === filtro)) return false;
    if (texto && ![m.titulo, m.numero_parte, m.fabricante].some((x) => (x || "").toLowerCase().includes(texto))) return false;
    return true;
  });

  const fichas = [["todos", "Todos"], ...aviones.map((a) => [a, a]), ["generales", "Generales"], ["sin", "Sin asignar"]];

  return (
    <>
      <div className="inv-filtros">
        <div>
          <label htmlFor="man-q">Buscar</label>
          <input id="man-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Título, número de parte, fabricante" />
        </div>
        <label className="man-check">
          <input type="checkbox" checked={verReemplazados} onChange={(e) => setVerReemplazados(e.target.checked)} />
          Mostrar reemplazados y archivados
        </label>
        {jefe && (
          <button type="button" className="adf-btn" style={{ marginLeft: "auto" }} onClick={() => setForm({ modo: "nuevo" })}>
            <i className="bi bi-upload"></i> Subir manual
          </button>
        )}
      </div>

      <div className="man-fichas">
        {fichas.map(([k, l]) => (
          <button type="button" key={k} className={`man-ficha ${filtro === k ? "man-ficha--activa" : ""}`}
            onClick={() => setFiltro(k)}>{l}</button>
        ))}
      </div>

      {jefe && porConfirmar > 0 && (
        <p className="adf-note">
          <i className="bi bi-info-circle"></i>
          {porConfirmar} manual(es) tienen la asignación de aviones <strong>por confirmar</strong>: la dedujo el
          sistema leyendo la portada. Abrí «Editar» en cada uno para confirmarla o corregirla.
        </p>
      )}

      <div className="adf-table-wrap">
        <table className="adf-table">
          <thead>
            <tr>
              <th>Manual</th><th>Tipo</th><th>N° de parte</th><th>Revisión</th>
              <th className="man-num">Págs.</th><th>Aviones</th><th></th>
            </tr>
          </thead>
          <tbody>
            {cargando && <tr><td colSpan={7} className="man-vacio">Cargando…</td></tr>}
            {!cargando && !visibles.length && <tr><td colSpan={7} className="man-vacio">No hay manuales con ese filtro.</td></tr>}
            {visibles.map((m) => (
              <tr key={m.id_manual}>
                <td>
                  <button type="button" className="man-link" onClick={() => setAbierto(m)}>{m.titulo}</button>
                  <div className="man-tags">
                    {m.necesita_confirmacion && <span className="adf-tag amber" title={m.nota_confirmacion || ""}>Por confirmar</span>}
                    {m.estado === "REEMPLAZADO" && (
                      <span className="adf-tag gray">Reemplazado por {m.reemplazado_por_revision || m.reemplazado_por_titulo}</span>
                    )}
                    {m.estado !== "VIGENTE" && m.usos_paquetes > 0 && (
                      <span className="adf-tag red">{m.usos_paquetes} rango(s) de paquetes todavía la usan</span>
                    )}
                    {m.estado === "ARCHIVADO" && <span className="adf-tag gray">Archivado</span>}
                  </div>
                </td>
                <td>{CATEGORIA[m.categoria] || m.categoria}</td>
                <td className="man-mono">{m.numero_parte || "—"}</td>
                <td>{m.revision || "—"}</td>
                <td className="man-num">{m.paginas} <small className="man-tenue">· {pesoLegible(m.tamano_bytes)}</small></td>
                <td>
                  {m.es_general
                    ? <span className="adf-tag blue">General</span>
                    : m.aeronaves.length ? m.aeronaves.map((a) => a.codigo).join(", ") : <span className="man-tenue">Sin asignar</span>}
                </td>
                <td className="man-acciones">
                  <button type="button" className="adf-icon-btn" title="Abrir" onClick={() => setAbierto(m)}>
                    <i className="bi bi-eye"></i>
                  </button>
                  {jefe && m.estado === "VIGENTE" && (
                    <button type="button" className="adf-icon-btn" title="Subir revisión nueva"
                      onClick={() => setForm({ modo: "revision", manual: m })}>
                      <i className="bi bi-arrow-repeat"></i>
                    </button>
                  )}
                  {jefe && (
                    <button type="button" className="adf-icon-btn" title="Editar"
                      onClick={() => setForm({ modo: "editar", manual: m })}>
                      <i className="bi bi-pencil"></i>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {abierto && <VisorManualModal manual={abierto} onClose={() => setAbierto(null)} />}
      {form && (
        <ManualFormModal {...form} onClose={() => setForm(null)}
          onGuardado={() => { setForm(null); cargar(); }} />
      )}
    </>
  );
}
```

- [ ] **Step 2: `ManualFormModal.jsx`**

```jsx
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  reservarSubidaManual, registrarManual, subirRevisionManual, editarManual, borrarManual, getTablaPaquetes,
} from "../../../services/manualesApi";
import { CATEGORIA, pesoLegible, mensajeError } from "./formatoManual";
import { subirAStorage } from "./subirManual";

/**
 * Subir un manual, subir una revisión nueva, o editar sus datos.
 * El archivo va DIRECTO del navegador a Storage (spec §10); el backend después
 * lo lee para sacar la huella y las páginas.
 */
export default function ManualFormModal({ modo, manual, onClose, onGuardado }) {
  const base = manual || {};
  const [f, setF] = useState({
    titulo: base.titulo || "",
    categoria: base.categoria || "MANTENIMIENTO",
    fabricante: base.fabricante || "",
    numero_parte: base.numero_parte || "",
    revision: modo === "revision" ? "" : base.revision || "",
    es_general: !!base.es_general,
    aeronaves: (base.aeronaves || []).map((a) => a.id_aeronave),
    confirmar: false,
  });
  const [archivo, setArchivo] = useState(null);
  const [aviones, setAviones] = useState([]);
  const [progreso, setProgreso] = useState(null); // null | 0..1 | "leyendo"
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => { getTablaPaquetes().then((t) => setAviones(t.aeronaves)).catch(() => {}); }, []);

  const toggleAvion = (id) =>
    set("aeronaves", f.aeronaves.includes(id) ? f.aeronaves.filter((x) => x !== id) : [...f.aeronaves, id]);

  const datos = () => ({
    titulo: f.titulo, categoria: f.categoria, fabricante: f.fabricante, numero_parte: f.numero_parte,
    revision: f.revision, es_general: f.es_general, aeronaves: f.aeronaves,
  });

  const guardar = async () => {
    if (!f.titulo.trim()) return toast.error("Escribí el título del manual");
    if (modo === "revision" && !f.revision.trim()) return toast.error("Escribí qué revisión es");
    if (modo !== "editar") {
      if (!archivo) return toast.error("Elegí el PDF");
      if (!/\.pdf$/i.test(archivo.name) && archivo.type !== "application/pdf") return toast.error("Tiene que ser un PDF");
    }
    setGuardando(true);
    try {
      if (modo === "editar") {
        await editarManual(manual.id_manual, { ...datos(), ...(f.confirmar ? { confirmar_asignacion: true } : {}) });
        toast.success("Manual actualizado");
      } else {
        const { ruta, signedUrl } = await reservarSubidaManual();
        setProgreso(0);
        await subirAStorage(signedUrl, archivo, setProgreso);
        setProgreso("leyendo");
        if (modo === "nuevo") await registrarManual({ ruta, ...datos() });
        else await subirRevisionManual(manual.id_manual, { ruta, ...datos() });
        toast.success(modo === "nuevo" ? "Manual agregado a la biblioteca" : "Revisión cargada; la anterior quedó reemplazada");
      }
      onGuardado();
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo guardar"));
      setProgreso(null);
    } finally {
      setGuardando(false);
    }
  };

  const archivar = async () => {
    if (!window.confirm(`¿Archivar «${manual.titulo}»? Deja de aparecer en la biblioteca, pero los paquetes y órdenes que lo usan lo siguen viendo.`)) return;
    try {
      await editarManual(manual.id_manual, { archivar: true });
      toast.success("Manual archivado");
      onGuardado();
    } catch (e) { toast.error(mensajeError(e, "No se pudo archivar")); }
  };
  const borrar = async () => {
    if (!window.confirm(`¿Borrar «${manual.titulo}» de la biblioteca?`)) return;
    try {
      await borrarManual(manual.id_manual);
      toast.success("Manual borrado");
      onGuardado();
    } catch (e) { toast.error(mensajeError(e, "No se pudo borrar")); }
  };

  const titulo = { nuevo: "Subir manual", revision: "Subir revisión nueva", editar: "Editar manual" }[modo];
  const pct = typeof progreso === "number" ? Math.round(progreso * 100) : 100;

  return (
    <div className="adf-modal-backdrop" onClick={(e) => { e.stopPropagation(); if (!guardando) onClose(); }}>
      <div className="adf-card adf-modal-card" style={{ padding: 0, maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        <div className="adf-edit-head">
          <span className="adf-edit-head__title">
            <span className="adf-edit-head__chip"><i className="bi bi-book"></i></span>{titulo}
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="adf-btn" disabled={guardando} onClick={guardar}>
              <i className="bi bi-check"></i>{guardando ? "Guardando…" : "Guardar"}
            </button>
            <button type="button" className="adf-btn secondary" disabled={guardando} onClick={onClose}>Cerrar</button>
          </div>
        </div>
        <div style={{ padding: "var(--sp-4)" }}>
          {modo === "revision" && (
            <p className="adf-note">
              <i className="bi bi-info-circle"></i>
              Reemplaza a <strong>{manual.titulo}{manual.revision ? ` · ${manual.revision}` : ""}</strong>. La anterior
              queda archivada y los paquetes siguen apuntando a ella hasta que los actualices.
            </p>
          )}
          {modo !== "editar" && (
            <div className="adf-form-field">
              <label htmlFor="man-archivo">Archivo PDF</label>
              <input id="man-archivo" type="file" accept="application/pdf,.pdf" disabled={guardando}
                onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
              {archivo && <small className="man-tenue">{archivo.name} · {pesoLegible(archivo.size)}</small>}
              {progreso !== null && (
                <div className="man-progreso" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <div style={{ width: `${pct}%` }} />
                  <span>{progreso === "leyendo" ? "Revisando el PDF…" : `Subiendo ${pct}%`}</span>
                </div>
              )}
            </div>
          )}
          <div className="adf-form-grid" style={{ marginTop: 12 }}>
            <div className="adf-form-field" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="man-titulo">Título</label>
              <input id="man-titulo" value={f.titulo} maxLength={200} placeholder="PA-38-112 Airplane Maintenance Manual"
                onChange={(e) => set("titulo", e.target.value)} />
            </div>
            <div className="adf-form-field">
              <label htmlFor="man-cat">Tipo</label>
              <select id="man-cat" value={f.categoria} onChange={(e) => set("categoria", e.target.value)}>
                {Object.entries(CATEGORIA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="adf-form-field">
              <label htmlFor="man-fab">Fabricante</label>
              <input id="man-fab" value={f.fabricante} maxLength={80} placeholder="Piper"
                onChange={(e) => set("fabricante", e.target.value)} />
            </div>
            <div className="adf-form-field">
              <label htmlFor="man-np">Número de parte</label>
              <input id="man-np" value={f.numero_parte} maxLength={40} placeholder="761-660"
                onChange={(e) => set("numero_parte", e.target.value)} />
            </div>
            <div className="adf-form-field">
              <label htmlFor="man-rev">Revisión</label>
              <input id="man-rev" value={f.revision} maxLength={80} placeholder="Oct 31, 2019"
                onChange={(e) => set("revision", e.target.value)} />
            </div>
          </div>
          <div className="adf-form-field" style={{ marginTop: 12 }}>
            <label>¿A qué aviones aplica?</label>
            <label className="man-check">
              <input type="checkbox" checked={f.es_general} onChange={(e) => set("es_general", e.target.checked)} />
              A toda la flota (manual general: AC 43.13, Champion, Slick…)
            </label>
            {!f.es_general && (
              <div className="man-aviones">
                {aviones.map((a) => (
                  <label key={a.id_aeronave} className="man-check">
                    <input type="checkbox" checked={f.aeronaves.includes(a.id_aeronave)} onChange={() => toggleAvion(a.id_aeronave)} />
                    {a.codigo}{a.es_externa ? " (externo)" : ""}
                  </label>
                ))}
              </div>
            )}
          </div>
          {modo === "editar" && manual.necesita_confirmacion && (
            <div className="adf-note" style={{ marginTop: 12 }}>
              <i className="bi bi-exclamation-circle"></i>
              {manual.nota_confirmacion || "Esta asignación la dedujo el sistema."}
              <label className="man-check" style={{ display: "flex", marginTop: 8 }}>
                <input type="checkbox" checked={f.confirmar} onChange={(e) => set("confirmar", e.target.checked)} />
                Revisé los datos y los aviones: confirmar
              </label>
            </div>
          )}
          {modo === "editar" && (
            <div className="man-peligro">
              {manual.estado === "VIGENTE" && (
                <button type="button" className="adf-btn secondary small" onClick={archivar}>
                  <i className="bi bi-archive"></i> Archivar
                </button>
              )}
              <button type="button" className="adf-btn danger small" onClick={borrar}>
                <i className="bi bi-trash"></i> Borrar
              </button>
              <small>Borrar solo se puede si ningún paquete ni orden lo usa. El archivo no se elimina del almacenamiento.</small>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `pages/Taller/Manuales.jsx`**

```jsx
import { useSearchParams } from "react-router-dom";
import Biblioteca from "./manuales/Biblioteca";
import Paquetes from "./manuales/Paquetes";
import { esJefeTaller } from "./permisos";
import "./inventario/inventario.css";
import "./manuales/manuales.css";

/**
 * Manuales del avión (spec 2026-09-20).
 * Biblioteca: todo el taller ve e imprime. Paquetes: el jefe arma qué páginas
 * acompañan cada inspección.
 */
const TABS = [
  { key: "biblioteca", label: "Biblioteca", icon: "bi-book" },
  { key: "paquetes", label: "Paquetes por inspección", icon: "bi-collection", soloJefe: true },
];

export default function Manuales() {
  const [params, setParams] = useSearchParams();
  const jefe = esJefeTaller();
  const tabs = TABS.filter((t) => !t.soloJefe || jefe);
  const pedida = params.get("tab");
  const tab = tabs.some((t) => t.key === pedida) ? pedida : "biblioteca";

  return (
    <>
      <div className="inv-head">
        <div>
          <h2 className="adf-section-title"><i className="bi bi-book me-2"></i>Manuales</h2>
          <p className="adf-section-subtitle">Los manuales de cada avión, y qué páginas acompañan cada inspección.</p>
        </div>
      </div>
      {tabs.length > 1 && (
        <nav className="inv-nav">
          <div className="inv-grupo">
            <div className="inv-tabs">
              {tabs.map((t) => (
                <button type="button" key={t.key} className={`inv-tab ${tab === t.key ? "inv-tab--activa" : ""}`}
                  onClick={() => setParams(t.key === "biblioteca" ? {} : { tab: t.key })}>
                  <i className={`bi ${t.icon}`}></i> {t.label}
                </button>
              ))}
            </div>
          </div>
        </nav>
      )}
      {tab === "biblioteca" && <Biblioteca />}
      {tab === "paquetes" && <Paquetes />}
    </>
  );
}
```

`Paquetes` se crea en la Task 13. Para que esta task compile sola, crear ya un `src/pages/Taller/manuales/Paquetes.jsx` provisorio:

```jsx
export default function Paquetes() { return null; }
```

- [ ] **Step 4: Agregar estilos de la biblioteca al final de `manuales.css`**

```css
/* ── Biblioteca ─────────────────────────────────────────────────────────── */
.man-fichas { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.man-ficha {
  height: 32px; padding: 0 var(--sp-3); border-radius: var(--radius-pill); font-size: 0.85rem; cursor: pointer;
  border: 1px solid var(--c-line-2); background: var(--c-surface-0); color: var(--c-ink-2);
}
.man-ficha:hover { border-color: var(--c-line-3); color: var(--c-ink-1); }
.man-ficha--activa, .man-ficha--activa:hover { background: var(--c-primary-500); border-color: var(--c-primary-500); color: var(--c-surface-0); }
.man-check { display: inline-flex; align-items: center; gap: 6px; font-size: 0.85rem; color: var(--c-ink-2); text-transform: none; letter-spacing: 0; }
.man-link { background: none; border: 0; padding: 0; text-align: left; font-weight: 600; color: var(--c-ink-1); cursor: pointer; }
.man-link:hover { color: var(--c-primary-600); text-decoration: underline; }
.man-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.man-num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.man-mono { font-family: var(--font-mono); font-size: 0.85rem; }
.man-vacio { color: var(--c-ink-3); text-align: center; padding: var(--sp-6) var(--sp-3); }
.man-acciones { white-space: nowrap; text-align: right; }
.man-aviones { display: flex; flex-wrap: wrap; gap: var(--sp-2) var(--sp-4); margin-top: var(--sp-2); }
.man-peligro {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2);
  margin-top: var(--sp-5); padding-top: var(--sp-3); border-top: 1px solid var(--c-line-1);
}
.man-peligro small { flex-basis: 100%; color: var(--c-ink-3); }
.man-progreso { position: relative; height: 26px; margin-top: var(--sp-2); border-radius: var(--radius-sm); background: var(--c-surface-2); overflow: hidden; }
.man-progreso > div { position: absolute; top: 0; bottom: 0; left: 0; background: var(--c-primary-100); transition: width 0.2s; }
.man-progreso > span { position: relative; display: block; line-height: 26px; padding: 0 var(--sp-2); font-size: 0.8rem; color: var(--c-ink-1); font-variant-numeric: tabular-nums; }
```

- [ ] **Step 5: Ruta y menú**

En `src/App.jsx`, junto a los imports del Taller:

```jsx
import TallerManuales from "./pages/Taller/Manuales";
```

Y junto a las rutas `/taller/*`:

```jsx
          <Route path="/taller/manuales"          element={<ProtectedTaller><TallerLayoutAuto><TallerManuales /></TallerLayoutAuto></ProtectedTaller>} />
```

En `components/TallerSidebar/TallerSidebar.jsx`, agregar al final de `menuItems`:

```js
    { label: "Manuales",         path: "/taller/manuales",         icon: "bi-book" },
```

En `components/AdminSidebar/AdminSidebar.jsx`, sección `Taller`, agregar **después de "Inventario" y antes de "Aeronaves"** (regla §39.F: los ítems del taller, en el mismo orden, y después lo que es solo del ADMIN):

```js
        { label: "Manuales", path: "/taller/manuales", icon: "bi-book" },
```

Y actualizar el comentario de esa sección: dice "Estos cinco primeros" → "Estos seis primeros".

- [ ] **Step 6: Verificar que compila**

Run: `npm run build` → OK.

- [ ] **Step 7: Commit**

```bash
git add CAA-frontend/src/pages/Taller/manuales/ CAA-frontend/src/pages/Taller/Manuales.jsx CAA-frontend/src/App.jsx CAA-frontend/src/components/TallerSidebar/TallerSidebar.jsx CAA-frontend/src/components/AdminSidebar/AdminSidebar.jsx
git commit -F <msg>   # "feat(taller): biblioteca de manuales en el menú del taller"
```

---

## Task 13: Frontend — Paquetes y su editor

**Files:**
- Modify (reemplazar el provisorio): `CAA-frontend/src/pages/Taller/manuales/Paquetes.jsx`
- Create: `CAA-frontend/src/pages/Taller/manuales/PaqueteEditor.jsx`
- Modify: `CAA-frontend/src/pages/Taller/manuales/manuales.css` (agregar al final)

- [ ] **Step 1: `Paquetes.jsx`**

```jsx
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getTablaPaquetes } from "../../../services/manualesApi";
import { TIPO_INSPECCION, mensajeError } from "./formatoManual";
import PaqueteEditor from "./PaqueteEditor";

/** Aviones × inspecciones. Solo lo abre el jefe (la pestaña se oculta al mecánico). */
export default function Paquetes() {
  const [t, setT] = useState(null);
  const [editando, setEditando] = useState(null); // { aeronave, tipo }

  const cargar = () =>
    getTablaPaquetes().then(setT).catch((e) => toast.error(mensajeError(e, "No se pudieron cargar los paquetes")));
  useEffect(() => { cargar(); }, []);

  if (editando) {
    return (
      <PaqueteEditor aeronave={editando.aeronave} tipo={editando.tipo} tabla={t}
        onVolver={() => { setEditando(null); cargar(); }} />
    );
  }
  if (!t) return <p className="man-vacio">Cargando…</p>;

  const celda = (id, tipo) => t.celdas.find((c) => c.id_aeronave === id && c.tipo_mantenimiento === tipo);
  const conReemplazo = t.celdas.filter((c) => c.reemplazados > 0).length;

  return (
    <>
      <p className="adf-section-subtitle">
        Por avión y por inspección: qué páginas le salen al mecánico cuando abre ese trabajo. Solo ve los
        paquetes <strong>confirmados</strong>.
      </p>
      {conReemplazo > 0 && (
        <p className="adf-note">
          <i className="bi bi-exclamation-triangle"></i>
          {conReemplazo} paquete(s) usan una revisión reemplazada de un manual. Abrilos y apuntá cada rango a la revisión nueva.
        </p>
      )}
      <div className="adf-table-wrap">
        <table className="adf-table man-grilla">
          <thead>
            <tr><th>Avión</th>{t.tipos.map((x) => <th key={x}>{TIPO_INSPECCION[x]}</th>)}</tr>
          </thead>
          <tbody>
            {t.aeronaves.map((a) => (
              <tr key={a.id_aeronave}>
                <td>
                  <strong>{a.codigo}</strong> <small className="man-tenue">{a.modelo}</small>
                  {a.es_externa && <span className="adf-tag gray" style={{ marginLeft: 6 }}>Externo</span>}
                </td>
                {t.tipos.map((tipo) => {
                  const c = celda(a.id_aeronave, tipo);
                  const clase = c ? c.estado.toLowerCase() : "vacia";
                  return (
                    <td key={tipo}>
                      <button type="button" className={`man-celda man-celda--${clase}`}
                        onClick={() => setEditando({ aeronave: a, tipo })}
                        aria-label={`${a.codigo} ${TIPO_INSPECCION[tipo]}: ${c ? c.estado.toLowerCase() : "sin paquete"}`}>
                        {!c && "—"}
                        {c && <>{c.estado === "CONFIRMADO" ? "Confirmado" : "Borrador"}<small>{c.paginas} págs.</small></>}
                        {c?.reemplazados > 0 && <i className="bi bi-exclamation-triangle" title="Usa una revisión reemplazada"></i>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
```

- [ ] **Step 2: `PaqueteEditor.jsx`**

```jsx
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getPaquete, guardarPaquete, getManuales, getManual } from "../../../services/manualesApi";
import { TIPO_INSPECCION, mensajeError } from "./formatoManual";
import VisorManual from "./VisorManual";

const aFila = (e) => ({
  clave: `e${e.id_extracto}`,
  id_manual: e.id_manual,
  manual_titulo: e.manual_titulo,
  manual_revision: e.manual_revision,
  manual_estado: e.manual_estado,
  manual_paginas: e.manual_paginas,
  pagina_desde: e.pagina_desde,
  pagina_hasta: e.pagina_hasta,
  titulo: e.titulo || "",
  origen: e.origen,
});

/**
 * Editor de un paquete: a la izquierda los rangos, a la derecha el visor para
 * marcar páginas nuevas. El estado se elige explícito al guardar (spec §9.4).
 */
export default function PaqueteEditor({ aeronave, tipo, tabla, onVolver }) {
  const [paquete, setPaquete] = useState(null);
  const [filas, setFilas] = useState([]);
  const [sucio, setSucio] = useState(false);
  const [manuales, setManuales] = useState([]);
  const [verTodos, setVerTodos] = useState(false);
  const [visor, setVisor] = useState(null); // { manual, pagina }
  const [guardando, setGuardando] = useState(false);
  const [copiarDe, setCopiarDe] = useState("");

  useEffect(() => {
    getPaquete(aeronave.id_aeronave, tipo)
      .then((r) => { setPaquete(r.paquete); setFilas(r.extractos.map(aFila)); })
      .catch((e) => toast.error(mensajeError(e, "No se pudo abrir el paquete")));
  }, [aeronave.id_aeronave, tipo]);

  useEffect(() => {
    getManuales(verTodos ? {} : { aeronave: aeronave.id_aeronave })
      .then((ms) => {
        setManuales(ms);
        setVisor((v) => v || (ms.length ? { manual: ms.find((m) => m.categoria === "MANTENIMIENTO") || ms[0], pagina: 1 } : null));
      })
      .catch(() => {});
  }, [verTodos, aeronave.id_aeronave]);

  const codigoDe = (id) => tabla?.aeronaves.find((a) => a.id_aeronave === id)?.codigo || `#${id}`;
  const opcionesCopia = useMemo(
    () => (tabla?.celdas || []).filter((c) => c.extractos > 0 && !(c.id_aeronave === aeronave.id_aeronave && c.tipo_mantenimiento === tipo)),
    [tabla, aeronave.id_aeronave, tipo]
  );
  const total = filas.reduce((s, f) => s + (Number(f.pagina_hasta) - Number(f.pagina_desde) + 1 || 0), 0);

  const cambiar = (nuevas) => { setFilas(nuevas); setSucio(true); };
  const mover = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= filas.length) return;
    const n = [...filas];
    [n[i], n[j]] = [n[j], n[i]];
    cambiar(n);
  };
  const editarFila = (i, k, v) => cambiar(filas.map((f, x) => (x === i ? { ...f, [k]: v, origen: "MANUAL" } : f)));
  const quitar = (i) => cambiar(filas.filter((_, x) => x !== i));

  const elegirManual = (id) => {
    const m = manuales.find((x) => String(x.id_manual) === String(id));
    if (m) setVisor({ manual: m, pagina: 1 });
  };
  const ver = (f) =>
    getManual(f.id_manual).then((m) => setVisor({ manual: m, pagina: f.pagina_desde }))
      .catch((e) => toast.error(mensajeError(e, "No se pudo abrir el manual")));

  const agregar = async ({ pagina_desde, pagina_hasta, titulo }) => {
    const m = visor.manual;
    cambiar([...filas, {
      clave: `n${Date.now()}`, id_manual: m.id_manual, manual_titulo: m.titulo, manual_revision: m.revision,
      manual_estado: m.estado, manual_paginas: m.paginas, pagina_desde, pagina_hasta, titulo, origen: "MANUAL",
    }]);
    toast.success(`Págs. ${pagina_desde}–${pagina_hasta} agregadas. Falta guardar.`);
  };

  const copiar = async () => {
    if (!copiarDe) return;
    const [idA, tp] = copiarDe.split("|");
    try {
      const r = await getPaquete(idA, tp);
      if (filas.length && !window.confirm(`¿Reemplazar los ${filas.length} rango(s) actuales por los ${r.extractos.length} del otro paquete?`)) return;
      cambiar(r.extractos.map((e) => ({ ...aFila(e), clave: `c${e.id_extracto}`, origen: "MANUAL" })));
      toast.success("Copiado. Revisá los rangos y guardá.");
    } catch (e) { toast.error(mensajeError(e, "No se pudo copiar")); }
  };

  const guardar = async (estado) => {
    const sinTitulo = filas.findIndex((f) => !String(f.titulo).trim());
    if (sinTitulo >= 0) return toast.error(`El rango ${sinTitulo + 1} no tiene título`);
    setGuardando(true);
    try {
      const r = await guardarPaquete(aeronave.id_aeronave, tipo, {
        estado,
        extractos: filas.map((f) => ({
          id_manual: f.id_manual, pagina_desde: Number(f.pagina_desde), pagina_hasta: Number(f.pagina_hasta),
          titulo: f.titulo, origen: f.origen,
        })),
      });
      const { extractos, ...p } = r;
      setPaquete(p);
      setFilas(extractos.map(aFila));
      setSucio(false);
      toast.success(estado === "CONFIRMADO" ? "Paquete confirmado: el mecánico ya lo ve" : "Guardado como borrador: el mecánico no lo ve");
    } catch (e) {
      toast.error(mensajeError(e, "No se pudo guardar"));
    } finally {
      setGuardando(false);
    }
  };
  const volver = () => {
    if (sucio && !window.confirm("Hay cambios sin guardar. ¿Salir igual?")) return;
    onVolver();
  };

  const estado = paquete?.estado || null;
  const botones = estado === "CONFIRMADO"
    ? [["Pasar a borrador", "BORRADOR", "secondary"], ["Guardar", "CONFIRMADO", ""]]
    : [["Guardar borrador", "BORRADOR", "secondary"], ["Guardar y confirmar", "CONFIRMADO", ""]];

  return (
    <div className="pe">
      <div className="pe-head">
        <button type="button" className="adf-btn secondary small" onClick={volver}>
          <i className="bi bi-arrow-left"></i> Tabla de paquetes
        </button>
        <h3>{aeronave.codigo} · Inspección {TIPO_INSPECCION[tipo]}</h3>
        {estado && (
          <span className={`adf-tag ${estado === "CONFIRMADO" ? "green" : "amber"}`}>
            {estado === "CONFIRMADO" ? "Confirmado" : "Borrador"}
          </span>
        )}
        {filas.some((f) => f.origen === "SUGERIDO") && <span className="adf-tag blue">Sugerido por el sistema</span>}
        <div className="pe-acciones">
          {sucio && <small className="man-tenue">Cambios sin guardar</small>}
          {botones.map(([l, e, cl]) => (
            <button type="button" key={l} className={`adf-btn ${cl}`}
              disabled={guardando || (e === "CONFIRMADO" && !filas.length)} onClick={() => guardar(e)}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="pe-cuerpo">
        <section className="pe-lista">
          <div className="pe-lista__tit">Páginas del paquete <small>({filas.length} rango(s) · {total} págs.)</small></div>
          {!filas.length && (
            <p className="man-vacio">Todavía no tiene páginas. Elegí un manual a la derecha, marcá desde y hasta, y agregalas.</p>
          )}
          {filas.map((f, i) => (
            <div key={f.clave} className="pe-fila">
              <input className="inv-campo pe-fila__titulo" value={f.titulo} maxLength={200} placeholder="Qué es"
                aria-label={`Título del rango ${i + 1}`} onChange={(e) => editarFila(i, "titulo", e.target.value)} />
              <div className="pe-fila__meta">
                {f.manual_titulo}{f.manual_revision ? ` · ${f.manual_revision}` : ""}
                {f.manual_estado !== "VIGENTE" && <span className="adf-tag red">Revisión reemplazada</span>}
              </div>
              <div className="pe-fila__rango">
                págs.
                <input type="number" min={1} max={f.manual_paginas} value={f.pagina_desde} aria-label="Desde"
                  onChange={(e) => editarFila(i, "pagina_desde", e.target.value)} />
                a
                <input type="number" min={1} max={f.manual_paginas} value={f.pagina_hasta} aria-label="Hasta"
                  onChange={(e) => editarFila(i, "pagina_hasta", e.target.value)} />
                <span className="pe-fila__botones">
                  <button type="button" className="adf-icon-btn" title="Ver" onClick={() => ver(f)}><i className="bi bi-eye"></i></button>
                  <button type="button" className="adf-icon-btn" title="Subir" disabled={i === 0} onClick={() => mover(i, -1)}><i className="bi bi-arrow-up"></i></button>
                  <button type="button" className="adf-icon-btn" title="Bajar" disabled={i === filas.length - 1} onClick={() => mover(i, 1)}><i className="bi bi-arrow-down"></i></button>
                  <button type="button" className="adf-icon-btn danger" title="Quitar" onClick={() => quitar(i)}><i className="bi bi-trash"></i></button>
                </span>
              </div>
            </div>
          ))}
          {opcionesCopia.length > 0 && (
            <div className="pe-copiar">
              <select className="inv-campo" value={copiarDe} aria-label="Copiar de otro paquete" onChange={(e) => setCopiarDe(e.target.value)}>
                <option value="">Copiar de otro paquete…</option>
                {opcionesCopia.map((c) => (
                  <option key={`${c.id_aeronave}|${c.tipo_mantenimiento}`} value={`${c.id_aeronave}|${c.tipo_mantenimiento}`}>
                    {codigoDe(c.id_aeronave)} · {TIPO_INSPECCION[c.tipo_mantenimiento]} ({c.estado === "CONFIRMADO" ? "confirmado" : "borrador"})
                  </option>
                ))}
              </select>
              <button type="button" className="adf-btn secondary small" disabled={!copiarDe} onClick={copiar}>Copiar</button>
            </div>
          )}
        </section>

        <section className="pe-visor">
          <div className="pe-visor__elegir">
            <select className="inv-campo" aria-label="Manual" value={visor?.manual?.id_manual || ""} onChange={(e) => elegirManual(e.target.value)}>
              {!manuales.length && <option value="">Este avión no tiene manuales asignados</option>}
              {manuales.map((m) => (
                <option key={m.id_manual} value={m.id_manual}>{m.titulo}{m.revision ? ` · ${m.revision}` : ""}</option>
              ))}
            </select>
            <label className="man-check">
              <input type="checkbox" checked={verTodos} onChange={(e) => setVerTodos(e.target.checked)} /> Ver todos los manuales
            </label>
          </div>
          {visor ? (
            <VisorManual key={visor.manual.id_manual} manual={visor.manual} paginaInicial={visor.pagina}
              accion={{ etiqueta: "Agregar al paquete", icono: "bi-plus-lg", pideTitulo: true, ejecutar: agregar }} />
          ) : <p className="man-vacio">Elegí un manual.</p>}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Agregar estilos al final de `manuales.css`**

```css
/* ── Tabla de paquetes ──────────────────────────────────────────────────── */
.man-grilla td { vertical-align: middle; }
.man-celda {
  position: relative; width: 100%; min-width: 110px; min-height: 44px; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  border: 1px dashed var(--c-line-2); border-radius: var(--radius-sm);
  background: var(--c-surface-0); color: var(--c-ink-3); font-size: 0.85rem;
}
.man-celda small { font-size: 0.72rem; color: inherit; }
.man-celda:hover { border-color: var(--c-primary-500); }
.man-celda--borrador { border-style: solid; border-color: var(--c-warn-500); background: var(--c-warn-50); color: var(--c-warn-700); }
.man-celda--confirmado { border-style: solid; border-color: var(--c-success-500); background: var(--c-success-50); color: var(--c-success-700); }
.man-celda .bi-exclamation-triangle { position: absolute; top: 4px; right: 6px; color: var(--c-danger-700); }

/* ── Editor de paquete ──────────────────────────────────────────────────── */
.pe-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-3); margin-bottom: var(--sp-3); }
.pe-head h3 { margin: 0; font-size: 1.1rem; color: var(--c-ink-1); }
.pe-acciones { margin-left: auto; display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); }
.pe-cuerpo { display: grid; grid-template-columns: minmax(300px, 380px) minmax(0, 1fr); gap: var(--sp-4); align-items: start; }
.pe-lista { display: flex; flex-direction: column; gap: var(--sp-2); min-width: 0; }
.pe-lista__tit { font-weight: 600; color: var(--c-ink-1); }
.pe-lista__tit small { font-weight: 400; color: var(--c-ink-3); }
.pe-fila {
  display: flex; flex-direction: column; gap: 4px; padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--c-line-1); border-radius: var(--radius-md); background: var(--c-surface-0);
}
.pe-fila__titulo { width: 100%; min-width: 0; height: 32px; }
.pe-fila__meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 0.78rem; color: var(--c-ink-3); }
.pe-fila__rango { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 0.82rem; color: var(--c-ink-2); }
.pe-fila__rango input {
  width: 70px; height: 30px; padding: 0 6px; font-variant-numeric: tabular-nums;
  border: 1px solid var(--c-line-2); border-radius: var(--radius-sm); background: var(--c-surface-0); color: var(--c-ink-1);
}
.pe-fila__botones { margin-left: auto; display: flex; gap: 2px; }
.pe-copiar { display: flex; gap: var(--sp-2); margin-top: var(--sp-3); }
.pe-copiar .inv-campo { flex: 1; min-width: 0; }
.pe-visor {
  display: flex; flex-direction: column; overflow: hidden; height: calc(100vh - 220px); min-height: 520px;
  border: 1px solid var(--c-line-1); border-radius: var(--radius-md); background: var(--c-surface-0);
}
.pe-visor__elegir { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--c-line-1); }
.pe-visor__elegir .inv-campo { flex: 1; min-width: 200px; }
.pe-visor .vm { flex: 1; min-height: 0; }
@media (max-width: 1024px) {
  .pe-cuerpo { grid-template-columns: minmax(0, 1fr); }
  .pe-visor { height: 80vh; }
}
```

- [ ] **Step 4: Verificar que compila**

Run: `npm run build` → OK.

- [ ] **Step 5: Commit**

```bash
git add CAA-frontend/src/pages/Taller/manuales/Paquetes.jsx CAA-frontend/src/pages/Taller/manuales/PaqueteEditor.jsx CAA-frontend/src/pages/Taller/manuales/manuales.css
git commit -F <msg>   # "feat(taller): configurador de paquetes de manuales por inspección"
```

---

## Task 14: Frontend — "Manuales de este trabajo"

**Files:**
- Create: `CAA-frontend/src/pages/Taller/ordenes/ManualesOrdenModal.jsx`
- Modify: `CAA-frontend/src/pages/Taller/MiTaller.jsx`
- Modify: `CAA-frontend/src/pages/Taller/ordenes/OrdenDetalleModal.jsx`
- Modify: `CAA-frontend/src/pages/Taller/manuales/manuales.css` (agregar al final)

- [ ] **Step 1: `ManualesOrdenModal.jsx`**

```jsx
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getManualesOrden, agregarManualOrden, quitarManualOrden, traerPaqueteOrden, pdfDeOrden,
  getManuales, getManual, abrirPdfCuandoEste,
} from "../../../services/manualesApi";
import { TIPO_INSPECCION, TIPOS, mensajeError } from "../manuales/formatoManual";
import VisorManualModal from "../manuales/VisorManualModal";
import "../manuales/manuales.css";

/**
 * "Manuales de este trabajo": las páginas del paquete de la inspección más las
 * que se le agregaron a la orden, listas para imprimir (spec §9.5). Pensado para
 * el celular: el mecánico lo abre de pie junto al avión.
 *
 * `orden` necesita id_orden, correlativo y aeronave_codigo (lo que ya trae SELECT_OT).
 */
export default function ManualesOrdenModal({ orden, onClose }) {
  const [d, setD] = useState(null);
  const [visor, setVisor] = useState(null); // { manual, pagina, agregar }
  const [eligiendo, setEligiendo] = useState(false);
  const [manuales, setManuales] = useState([]);
  const [verTodos, setVerTodos] = useState(false);
  const [tipoTraer, setTipoTraer] = useState("100HR");
  const [trabajando, setTrabajando] = useState(false);

  const cargar = () =>
    getManualesOrden(orden.id_orden).then(setD)
      .catch((e) => toast.error(mensajeError(e, "No se pudieron cargar los manuales")));
  useEffect(() => { cargar(); }, [orden.id_orden]);

  const idAeronave = d?.orden.id_aeronave;
  useEffect(() => {
    if (!eligiendo || !idAeronave) return;
    getManuales(verTodos ? {} : { aeronave: idAeronave }).then(setManuales).catch(() => {});
  }, [eligiendo, verTodos, idAeronave]);

  const imprimirTodo = () =>
    abrirPdfCuandoEste(() => pdfDeOrden(orden.id_orden))
      .catch((e) => toast.error(mensajeError(e, "No se pudo armar el PDF"), {
        action: { label: "Reintentar", onClick: () => imprimirTodo() },
      }));

  const ver = (e) =>
    getManual(e.id_manual).then((m) => setVisor({ manual: m, pagina: e.pagina_desde, agregar: false }))
      .catch((err) => toast.error(mensajeError(err, "No se pudo abrir el manual")));

  const quitar = async (e) => {
    if (!window.confirm(`¿Quitar «${e.titulo || e.manual_titulo}» de esta orden?`)) return;
    try { await quitarManualOrden(orden.id_orden, e.id_extracto); cargar(); }
    catch (err) { toast.error(mensajeError(err, "No se pudo quitar")); }
  };

  const traer = async () => {
    setTrabajando(true);
    try {
      const r = await traerPaqueteOrden(orden.id_orden, tipoTraer);
      toast.success(`${r.agregadas} rango(s) agregados`);
      cargar();
    } catch (err) {
      toast.error(mensajeError(err, "No se pudo traer el paquete"));
    } finally {
      setTrabajando(false);
    }
  };

  const agregar = async (r) => {
    await agregarManualOrden(orden.id_orden, { id_manual: visor.manual.id_manual, ...r });
    toast.success(`Págs. ${r.pagina_desde}–${r.pagina_hasta} agregadas a la orden`);
    setVisor(null);
    cargar();
  };

  const etiqueta = d?.inspeccion ? TIPO_INSPECCION[d.inspeccion] : null;
  const hayPaginas = d && (d.del_paquete.length > 0 || d.agregadas.length > 0);

  const lista = (titulo, items, quitable) => (
    <section className="mo-seccion">
      <h4>{titulo}</h4>
      {items.map((e) => (
        <div key={`${e.origen}-${e.id_extracto}`} className="mo-fila">
          <button type="button" className="mo-fila__abrir" onClick={() => ver(e)}>
            <span className="mo-fila__titulo">{e.titulo || e.manual_titulo}</span>
            <span className="mo-fila__meta">
              {e.manual_titulo} · págs. {e.pagina_desde}–{e.pagina_hasta} ({e.paginas})
              {quitable && e.agregado_por_nombre ? ` · ${e.agregado_por_nombre}` : ""}
              {quitable && e.creado_txt ? ` · ${e.creado_txt}` : ""}
            </span>
            {e.manual_estado !== "VIGENTE" && <span className="adf-tag amber">De la revisión anterior</span>}
          </button>
          {quitable && d.puede_agregar && (
            <button type="button" className="adf-icon-btn danger" title="Quitar" onClick={() => quitar(e)}>
              <i className="bi bi-trash"></i>
            </button>
          )}
        </div>
      ))}
    </section>
  );

  return (
    <>
      <div className="adf-modal-backdrop" onClick={(e) => { e.stopPropagation(); onClose(); }}>
        <div className="adf-card adf-modal-card mo" onClick={(e) => e.stopPropagation()}>
          <div className="adf-edit-head">
            <span className="adf-edit-head__title">
              <span className="adf-edit-head__chip"><i className="bi bi-book"></i></span>Manuales de este trabajo
            </span>
            <button type="button" className="adf-btn secondary" onClick={onClose}>Cerrar</button>
          </div>
          <div className="mo-cuerpo">
            <p className="mo-sub">
              {orden.correlativo} · {orden.aeronave_codigo}{etiqueta ? ` · inspección ${etiqueta}` : ""}
            </p>
            {!d && <p className="man-vacio">Cargando…</p>}
            {d && (
              <>
                {d.del_paquete.length > 0 &&
                  lista(d.congelado ? `Del paquete ${etiqueta || ""} (fijado al firmar)` : `Del paquete ${etiqueta}`, d.del_paquete, false)}

                {d.inspeccion && !d.del_paquete.length && !d.congelado && (
                  <p className="adf-note">
                    <i className="bi bi-info-circle"></i>
                    {d.paquete_estado === "BORRADOR"
                      ? (d.es_jefe
                        ? `El paquete ${etiqueta} de este avión está en borrador: el mecánico no lo ve. Confirmalo en Manuales → Paquetes por inspección.`
                        : `El paquete ${etiqueta} de este avión todavía no está listo.`)
                      : `Este avión todavía no tiene paquete de ${etiqueta}.`}
                  </p>
                )}

                {!d.inspeccion && d.puede_agregar && (
                  <div className="mo-traer">
                    <span>¿Es una inspección? Traé sus páginas:</span>
                    <select className="inv-campo" value={tipoTraer} aria-label="Inspección" onChange={(e) => setTipoTraer(e.target.value)}>
                      {TIPOS.map((t) => <option key={t} value={t}>{TIPO_INSPECCION[t]}</option>)}
                    </select>
                    <button type="button" className="adf-btn secondary small" disabled={trabajando} onClick={traer}>
                      Traer las páginas del paquete
                    </button>
                  </div>
                )}

                {d.agregadas.length > 0 && lista("Agregadas en este trabajo", d.agregadas, true)}
                {!hayPaginas && <p className="man-vacio">Esta orden todavía no tiene páginas de manual.</p>}

                <div className="mo-acciones">
                  {hayPaginas && (
                    <button type="button" className="adf-btn mo-grande" onClick={imprimirTodo}>
                      <i className="bi bi-printer"></i> Abrir e imprimir todo ({d.paginas} págs.)
                    </button>
                  )}
                  {d.puede_agregar && (
                    <button type="button" className="adf-btn secondary mo-grande" onClick={() => setEligiendo((x) => !x)}>
                      <i className="bi bi-plus-lg"></i> Agregar páginas de un manual
                    </button>
                  )}
                </div>

                {eligiendo && (
                  <section className="mo-seccion">
                    <h4>¿De qué manual?</h4>
                    <label className="man-check">
                      <input type="checkbox" checked={verTodos} onChange={(e) => setVerTodos(e.target.checked)} /> Ver todos los manuales
                    </label>
                    {manuales.map((m) => (
                      <button type="button" key={m.id_manual} className="mo-manual"
                        onClick={() => { setEligiendo(false); setVisor({ manual: m, pagina: 1, agregar: true }); }}>
                        {m.titulo}<small>{m.revision || ""}</small>
                      </button>
                    ))}
                    {!manuales.length && <p className="man-vacio">No hay manuales asignados a este avión. Marcá «Ver todos».</p>}
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {visor && (
        <VisorManualModal manual={visor.manual} paginaInicial={visor.pagina} onClose={() => setVisor(null)}
          accion={visor.agregar
            ? { etiqueta: `Agregar a la orden ${orden.correlativo}`, icono: "bi-plus-lg", pideTitulo: true, ejecutar: agregar }
            : undefined} />
      )}
    </>
  );
}
```

- [ ] **Step 2: Botón en Mi taller**

En `src/pages/Taller/MiTaller.jsx`:

Import:

```jsx
import ManualesOrdenModal from "./ordenes/ManualesOrdenModal";
```

Dentro de `<div className="tec-acciones">`, **después** del botón "Pedir material":

```jsx
            <button className="tec-btn" onClick={() => setAccion("manuales")}>
              <i className="bi bi-book"></i>
              <span>Manuales de este trabajo</span>
              <small>ver e imprimir las páginas</small>
            </button>
```

Y junto a los otros modales de `accion` (después del bloque `accion === "material"`):

```jsx
      {accion === "manuales" && activa && (
        <ManualesOrdenModal orden={activa} onClose={() => setAccion(null)} />
      )}
```

Actualizar el comentario de `accion` en el `useState`: `// 'abrir' | 'material' | 'aceite' | 'firmar' | 'manuales'`.

- [ ] **Step 3: Botón en el detalle de la orden**

En `src/pages/Taller/ordenes/OrdenDetalleModal.jsx`:

Import:

```jsx
import ManualesOrdenModal from "./ManualesOrdenModal";
```

Estado, junto a los otros `useState`:

```jsx
  const [manuales, setManuales] = useState(false);
```

En la cabecera, justo después del botón "Imprimir":

```jsx
            {o && (
              <button className="adf-btn secondary" onClick={() => setManuales(true)}>
                <i className="bi bi-book"></i> Manuales
              </button>
            )}
```

Y junto a `EmitirStickersModal` al final:

```jsx
      {manuales && o && (
        <ManualesOrdenModal orden={o} onClose={() => setManuales(false)} />
      )}
```

- [ ] **Step 4: Estilos al final de `manuales.css`**

```css
/* ── Manuales de una orden (celular primero) ────────────────────────────── */
.mo { padding: 0; max-width: 620px; }
.mo-cuerpo { display: flex; flex-direction: column; gap: var(--sp-3); padding: var(--sp-3) var(--sp-4) var(--sp-4); }
.mo-sub { margin: 0; font-size: 0.88rem; color: var(--c-ink-3); }
.mo-seccion h4 { margin: 0 0 var(--sp-2); font-size: 0.78rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--c-ink-3); }
.mo-fila { display: flex; align-items: center; gap: var(--sp-2); border-bottom: 1px solid var(--c-line-1); }
.mo-fila__abrir {
  flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  padding: var(--sp-2) 0; text-align: left; background: none; border: 0; cursor: pointer;
}
.mo-fila__titulo { font-weight: 600; color: var(--c-ink-1); }
.mo-fila__meta { font-size: 0.8rem; color: var(--c-ink-3); }
.mo-acciones { display: flex; flex-direction: column; gap: var(--sp-2); }
.mo-grande { width: 100%; min-height: 48px; justify-content: center; font-size: 1rem; }
.mo-traer { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); font-size: 0.88rem; color: var(--c-ink-2); }
.mo-manual {
  display: flex; justify-content: space-between; gap: var(--sp-2); width: 100%; margin-bottom: 6px;
  padding: var(--sp-3); text-align: left; cursor: pointer; color: var(--c-ink-1);
  background: var(--c-surface-0); border: 1px solid var(--c-line-1); border-radius: var(--radius-sm);
}
.mo-manual small { color: var(--c-ink-3); }
@media (max-width: 640px) { .mo { max-width: none; } }
```

- [ ] **Step 5: Verificar que compila**

Run: `npm run build` → OK.

- [ ] **Step 6: Commit**

```bash
git add CAA-frontend/src/pages/Taller/ordenes/ManualesOrdenModal.jsx CAA-frontend/src/pages/Taller/MiTaller.jsx CAA-frontend/src/pages/Taller/ordenes/OrdenDetalleModal.jsx CAA-frontend/src/pages/Taller/manuales/manuales.css
git commit -F <msg>   # "feat(taller): «Manuales de este trabajo» en Mi taller y en la orden"
```

---

## Task 15: Carga inicial — preparar e inventariar el ZIP

**Files:**
- Create: `supabase/dump/manuales_taller/comun.py`
- Create: `supabase/dump/manuales_taller/preparar.py`

- [ ] **Step 1: `comun.py`**

```python
"""
Lectura del ZIP de manuales, compartida por preparar.py y subir.py.

Los dos tienen que producir EXACTAMENTE los mismos bytes por manual: la ruta en
Storage sale de la huella (sha256). Por eso la unión del Azteca y el descifrado
viven acá y en ningún otro lado.
"""
import re
import sys
import unicodedata
import zipfile
from pathlib import Path

import fitz  # PyMuPDF

ZIP_POR_DEFECTO = Path(r"C:\Users\Daniel\Downloads\OneDrive_1_20-9-2026.zip")
AZTECA_DIR = "PA 23-250 AZTECA MM/"
AZTECA_CLAVE = "pa-23-250-azteca-mm"
TOPE_TOMO = 52428800  # 50 MiB: el tope por archivo del plan gratuito de Supabase

# Duplicados vistos en el inventario: se descarta la clave de la izquierda y se
# conserva la de la derecha, pero SOLO después de comprobar que el texto coincide.
DUPLICADOS = {
    "pa28-service": "service-manual-140-200r",
    "overhaul-manual-lycoming-direct-drive-eng-autosaved": "overhaul-manual-lycoming-direct-drive-eng",
}


def slug(nombre):
    s = unicodedata.normalize("NFKD", nombre).encode("ascii", "ignore").decode()
    s = re.sub(r"\.pdf$", "", s, flags=re.I).lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:60].strip("-")


def _muestra(doc):
    n = doc.page_count
    return [" ".join(doc[i].get_text().split()) for i in sorted({0, n // 4, n // 2, (3 * n) // 4, n - 1})]


def grupos_del_zip(z):
    """[(clave, [nombres en el ZIP])] de los manuales finales, sin duplicados."""
    grupos = {}
    for n in z.namelist():
        if n.endswith("/") or not n.lower().endswith(".pdf"):
            continue
        clave = AZTECA_CLAVE if n.startswith(AZTECA_DIR) else slug(Path(n).name)
        grupos.setdefault(clave, []).append(n)
    for dup, queda in DUPLICADOS.items():
        if dup not in grupos:
            continue
        with fitz.open(stream=z.read(grupos[dup][0]), filetype="pdf") as a, \
             fitz.open(stream=z.read(grupos[queda][0]), filetype="pdf") as b:
            if a.page_count != b.page_count or _muestra(a) != _muestra(b):
                sys.exit(f"{dup} y {queda} NO son el mismo manual: revisar antes de descartar.")
        del grupos[dup]
    return sorted(grupos.items())


def bytes_finales(z, clave, nombres):
    """Los bytes que se suben: el Azteca unido en orden de nombre; todo, sin cifrado."""
    if clave == AZTECA_CLAVE:
        salida = fitz.open()
        for n in sorted(nombres):
            with fitz.open(stream=z.read(n), filetype="pdf") as parte:
                salida.insert_pdf(parte)
        # garbage=1 y sin deflate: rápido y determinista. garbage=3 + deflate tardaba minutos.
        datos = salida.tobytes(garbage=1, no_new_id=True)
        salida.close()
    else:
        datos = z.read(nombres[0])
    with fitz.open(stream=datos, filetype="pdf") as doc:
        if doc.needs_pass:
            sys.exit(f"{clave} pide contraseña para abrirse: no se puede cargar así.")
        # 🚨 NO usar doc.is_encrypted: PyMuPDF desbloquea solo los PDF que tienen
        # únicamente contraseña de dueño y ahí `is_encrypted` da False. Son 10 de
        # los 35 manuales (RC4), entre ellos el del Cessna 152, y pdf-lib no los
        # puede recortar. Lo que sí lo dice es el metadato "encryption".
        if not doc.metadata.get("encryption"):
            return datos
        return doc.tobytes(encryption=fitz.PDF_ENCRYPT_NONE, no_new_id=True)


def en_tomos(clave, datos):
    """Si pasa el tope por archivo, lo parte en dos mitades por página: [(clave, bytes)]."""
    if len(datos) <= TOPE_TOMO:
        return [(clave, datos)]
    with fitz.open(stream=datos, filetype="pdf") as doc:
        mitad = doc.page_count // 2
        partes = []
        for i, (desde, hasta) in enumerate([(0, mitad - 1), (mitad, doc.page_count - 1)], start=1):
            t = fitz.open()
            t.insert_pdf(doc, from_page=desde, to_page=hasta)
            partes.append((f"{clave}-tomo-{i}", t.tobytes(garbage=1, no_new_id=True)))
            t.close()
    return partes
```

- [ ] **Step 2: `preparar.py`**

```python
"""
Paso 1 de 3 de la carga inicial de manuales (spec 2026-09-20 §11).

Lee el ZIP SIN descomprimirlo a disco y escribe inventario.json: por manual, sus
páginas, tamaño, huella, texto de la portada y las entradas del índice que
hablan de inspecciones. Con eso se cura catalogo.json a mano.

    python preparar.py [ruta_del_zip]
"""
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path

import fitz

from comun import ZIP_POR_DEFECTO, AZTECA_CLAVE, grupos_del_zip, bytes_finales

INSPECCION = re.compile(r"INSPECT|HOUR|PERIODIC|SCHEDULED|ANNUAL|TIME LIMIT", re.I)


def main():
    ruta = Path(sys.argv[1]) if len(sys.argv) > 1 else ZIP_POR_DEFECTO
    z = zipfile.ZipFile(ruta)
    manuales = []
    for clave, nombres in grupos_del_zip(z):
        with fitz.open(stream=z.read(sorted(nombres)[0]), filetype="pdf") as original:
            cifrado = bool(original.metadata.get("encryption"))
        datos = bytes_finales(z, clave, nombres)
        with fitz.open(stream=datos, filetype="pdf") as limpio:
            assert not limpio.metadata.get("encryption"), f"{clave} sigue cifrado después de descifrarlo"
        if clave == AZTECA_CLAVE:
            # Tiene que salir idéntico cada vez: su ruta en Storage sale de la huella.
            otra = bytes_finales(z, clave, nombres)
            assert hashlib.sha256(datos).digest() == hashlib.sha256(otra).digest(), "El Azteca no sale igual dos veces"
        with fitz.open(stream=datos, filetype="pdf") as doc:
            toc = doc.get_toc()
            manuales.append({
                "clave": clave,
                "archivos": sorted(nombres) if clave != AZTECA_CLAVE else [f"PA 23-250 AZTECA MM/* ({len(nombres)} pedazos)"],
                "sha256": hashlib.sha256(datos).hexdigest(),
                "paginas": doc.page_count,
                "tamano_bytes": len(datos),
                "venia_cifrado": cifrado,
                "portada": " ".join(doc[0].get_text().split())[:400],
                "indice_inspeccion": [[lvl, t.strip(), p] for lvl, t, p in toc if INSPECCION.search(t)][:40],
            })
    salida = Path(__file__).parent / "inventario.json"
    salida.write_text(json.dumps({"zip": ruta.name, "manuales": manuales}, ensure_ascii=False, indent=1), encoding="utf-8")
    mb = sum(m["tamano_bytes"] for m in manuales) / 1048576
    cifrados = [m["clave"] for m in manuales if m["venia_cifrado"]]
    print(f"{len(manuales)} manuales · {mb:.0f} MB → {salida.name}")
    print(f"venían cifrados ({len(cifrados)}): {', '.join(cifrados)}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Correrlo**

Run (desde `supabase/dump/manuales_taller`): `python preparar.py`
Expected: `35 manuales · ~630 MB → inventario.json` y `venían cifrados (10): …` (entre ellos `cessna-152-mm` y `slick-4300-6300-overhaul-manual-l-1363f`). El Azteca con `paginas: 1433`. Si la cuenta de cifrados no es 10, parar y averiguar por qué antes de seguir.

- [ ] **Step 4: Commit**

```bash
git add supabase/dump/manuales_taller/comun.py supabase/dump/manuales_taller/preparar.py supabase/dump/manuales_taller/inventario.json
git commit -F <msg>   # "chore(taller): inventario del ZIP de manuales"
```

---

## Task 16: Carga inicial — catálogo curado y rangos sugeridos verificados

**Files:**
- Create: `supabase/dump/manuales_taller/catalogo.json`
- Create: `supabase/dump/manuales_taller/verificar_rangos.py`

- [ ] **Step 1: Escribir `catalogo.json`**

Punto de partida (deducido de las portadas). En el Step 2 se coteja cada `numero_parte` y `revision` contra `inventario.json` → `portada`, y se corrige lo que no coincida. **No inventar**: si la portada no lo dice, dejar el campo en `null`.

```json
{
  "manuales": [
    {"clave": "100672612-temp-rev-5-152-service-manual-c152", "titulo": "Cessna 152 Service Manual — Temporary Revision 5", "categoria": "MANTENIMIENTO", "fabricante": "Cessna", "numero_parte": "D2064-1-13", "revision": "Temporary Revision 5, Dec 1, 2011", "aeronaves": ["YS-333-PE"], "es_general": false},
    {"clave": "445839407-piper-753-582-cherokee-parts-catalog-2009-part4", "titulo": "Cherokee Parts Catalog PA-28 / PA-28R (parte 4)", "categoria": "PARTES", "fabricante": "Piper", "numero_parte": "753-582", "revision": null, "aeronaves": ["YS-270-PE", "YS-155-PE", "YS-127-P"], "es_general": false, "nota": "Es solo una parte (56 págs.) del catálogo 753-582; el completo es «Cherokee Parts Catalog PA-28 / PA-28R (753-582)». ¿Hace falta conservarla?"},
    {"clave": "447340064-piper-parts-manual-761-589-pa44-200t", "titulo": "Seneca II Parts Catalog (PA-34-200T)", "categoria": "PARTES", "fabricante": "Piper", "numero_parte": "761-589", "revision": null, "aeronaves": [], "es_general": false, "nota": "El nombre del archivo dice PA44-200T, pero es el catálogo del Seneca II (PA-34-200T). ¿De qué avión es?"},
    {"clave": "624658018-x30583-tsio-360-and-ltsio-360-series", "titulo": "Continental TSIO-360 / LTSIO-360 Operator's Manual", "categoria": "OPERACION", "fabricante": "Continental", "numero_parte": "X30583", "revision": "Aug 2011", "aeronaves": [], "es_general": false, "nota": "Motor del Seneca II. ¿De qué avión es?"},
    {"clave": "644315110-sm-753-586-pa-28s", "titulo": "Cherokee Service Manual PA-28 / PA-28R (753-586, 2021)", "categoria": "MANTENIMIENTO", "fabricante": "Piper", "numero_parte": "753-586", "revision": "Sep 18, 2021", "aeronaves": ["YS-270-PE", "YS-155-PE", "YS-127-P"], "es_general": false, "nota": "Hay dos service manuals del Cherokee: este (edición 2021) y el de fichas «140-200R». ¿Cuál es el vigente? Los paquetes sugeridos usan este."},
    {"clave": "697350008-service-manual-pa-34-200t-seneca-ii", "titulo": "Seneca II Service Manual (PA-34-200T)", "categoria": "MANTENIMIENTO", "fabricante": "Piper", "numero_parte": "761-590", "revision": "Oct 31, 2019", "aeronaves": [], "es_general": false, "nota": "¿De qué avión es?"},
    {"clave": "762-332-service-bulletin-letter-index-09-27-00", "titulo": "Piper Service Bulletin / Service Letter Index", "categoria": "BOLETINES", "fabricante": "Piper", "numero_parte": "762-332", "revision": "Sep 27, 2000", "aeronaves": [], "es_general": true},
    {"clave": "ac-43-13-1b-w-chg1", "titulo": "AC 43.13-1B — Acceptable Methods, Techniques and Practices (con Change 1)", "categoria": "NORMATIVA", "fabricante": "FAA", "numero_parte": "AC 43.13-1B", "revision": "Change 1", "aeronaves": [], "es_general": true},
    {"clave": "c152-poh-1979", "titulo": "Cessna 152 Information Manual / POH (1979)", "categoria": "OPERACION", "fabricante": "Cessna", "numero_parte": null, "revision": "1979", "aeronaves": ["YS-333-PE"], "es_general": false},
    {"clave": "cessna-152-mm", "titulo": "Cessna 152 Service Manual 1978–1985", "categoria": "MANTENIMIENTO", "fabricante": "Cessna", "numero_parte": "D2064-1-13", "revision": null, "aeronaves": ["YS-333-PE"], "es_general": false},
    {"clave": "champion-slick-app", "titulo": "Slick / Champion — Consolidated Application Data", "categoria": "CATALOGO", "fabricante": "Champion Aerospace", "numero_parte": "L-1318H", "revision": null, "aeronaves": [], "es_general": true},
    {"clave": "championaerospacecatalog", "titulo": "Champion Aerospace Aviation Catalog AV-14", "categoria": "CATALOGO", "fabricante": "Champion Aerospace", "numero_parte": "AV-14", "revision": "Jan 2007", "aeronaves": [], "es_general": true},
    {"clave": "cherokee-parts-753-582-parts-catalog-pa28s", "titulo": "Cherokee Parts Catalog PA-28 / PA-28R (753-582)", "categoria": "PARTES", "fabricante": "Piper", "numero_parte": "753-582", "revision": null, "aeronaves": ["YS-270-PE", "YS-155-PE", "YS-127-P"], "es_general": false},
    {"clave": "continental-motors-publication-m-0", "titulo": "Continental Standard Practice Maintenance Manual (M-0)", "categoria": "MANTENIMIENTO", "fabricante": "Continental", "numero_parte": "M-0", "revision": "Rev. 1, Sep 2019", "aeronaves": [], "es_general": true},
    {"clave": "lycoming-parts-catalog-o-235-series-engines-june-1982-revise", "titulo": "Lycoming O-235 Parts Catalog", "categoria": "PARTES", "fabricante": "Lycoming", "numero_parte": "PC-302B", "revision": "Jun 1982, rev. Jan 1987", "aeronaves": ["YS-334-PE", "YS-333-PE"], "es_general": false},
    {"clave": "maintenance-manual-pa-38", "titulo": "PA-38-112 Tomahawk Maintenance Manual (fichas, 2000)", "categoria": "MANTENIMIENTO", "fabricante": "Piper", "numero_parte": "761-660", "revision": "Interim revision Feb 25, 2000", "aeronaves": ["YS-334-PE"], "es_general": false, "nota": "Hay dos ediciones del manual del Tomahawk: esta (2000) y la de 2019. Sus páginas no coinciden. ¿Cuál es la vigente? Los paquetes sugeridos usan la de 2019."},
    {"clave": "o-235-o-290-operator-manual-60297-9", "titulo": "Lycoming O-235 / O-290 Operator's Manual", "categoria": "OPERACION", "fabricante": "Lycoming", "numero_parte": "60297-9", "revision": "5th ed., Jan 2007", "aeronaves": ["YS-334-PE", "YS-333-PE"], "es_general": false},
    {"clave": "operator-s-manual-continental-ys303p", "titulo": "Continental TSIO-520 / LTSIO-520-AE Operator's Manual", "categoria": "OPERACION", "fabricante": "Continental", "numero_parte": "X30044", "revision": "Aug 2011", "aeronaves": [], "es_general": false, "nota": "Motor del T303; el nombre del archivo menciona una matrícula. ¿Es un avión cliente de la OMA?"},
    {"clave": "overhaul-manual-lycoming-direct-drive-eng", "titulo": "Lycoming Direct Drive Engines Overhaul Manual", "categoria": "OVERHAUL", "fabricante": "Lycoming", "numero_parte": "60294-7", "revision": "6th printing, Dec 1974", "aeronaves": ["YS-334-PE", "YS-333-PE", "YS-270-PE", "YS-155-PE", "YS-127-P"], "es_general": false},
    {"clave": "p689-12-cessna-t303-parts-catalog", "titulo": "Cessna T303 Crusader Parts Catalog", "categoria": "PARTES", "fabricante": "Cessna", "numero_parte": "P689-12", "revision": null, "aeronaves": [], "es_general": false, "nota": "¿De qué avión es?"},
    {"clave": "pa-23-250-azteca-mm", "titulo": "PA-23 Apache / Aztec Service Manual", "categoria": "MANTENIMIENTO", "fabricante": "Piper", "numero_parte": "753-564", "revision": "Jan 1, 2009", "aeronaves": [], "es_general": false, "nota": "Venía partido en 144 pedazos; se unió en orden de fichas (1A1 a 5L20). ¿De qué avión es?"},
    {"clave": "pa-28-151-amm", "titulo": "PA-28-151 / PA-28-161 Warrior Service Manual", "categoria": "MANTENIMIENTO", "fabricante": "Piper", "numero_parte": "761-539", "revision": "Jul 11, 2019", "aeronaves": [], "es_general": false, "nota": "Ningún avión de la flota es Warrior por modelo. ¿De cuál es?"},
    {"clave": "pa-31-pa-31-300-325-smv1994", "titulo": "PA-31 Navajo Service Manual", "categoria": "MANTENIMIENTO", "fabricante": "Piper", "numero_parte": "753-704", "revision": null, "aeronaves": [], "es_general": false, "nota": "¿De qué avión es?"},
    {"clave": "pa-38-112-amm", "titulo": "PA-38-112 Tomahawk Airplane Maintenance Manual (2019)", "categoria": "MANTENIMIENTO", "fabricante": "Piper", "numero_parte": "761-660", "revision": "Oct 31, 2019", "aeronaves": ["YS-334-PE"], "es_general": false, "nota": "Hay dos ediciones del manual del Tomahawk: esta (2019) y la de 2000. ¿Cuál es la vigente? Los paquetes sugeridos usan esta."},
    {"clave": "pa38-poh", "titulo": "PA-38-112 Tomahawk POH", "categoria": "OPERACION", "fabricante": "Piper", "numero_parte": null, "revision": null, "aeronaves": ["YS-334-PE"], "es_general": false, "nota": "Escaneo sin texto: la búsqueda no encuentra nada, se navega por página."},
    {"clave": "parts-catalog-cessna-152", "titulo": "Cessna 152 Parts Catalog", "categoria": "PARTES", "fabricante": "Cessna", "numero_parte": null, "revision": null, "aeronaves": ["YS-333-PE"], "es_general": false, "nota": "Escaneo sin texto: la búsqueda no encuentra nada, se navega por página."},
    {"clave": "parts-catalog-pa-140-180r", "titulo": "Cherokee Parts Catalog PA-28 / PA-28R (fichas)", "categoria": "PARTES", "fabricante": "Piper", "numero_parte": null, "revision": null, "aeronaves": ["YS-270-PE", "YS-155-PE", "YS-127-P"], "es_general": false},
    {"clave": "parts-catalog-pa-38", "titulo": "PA-38-112 Tomahawk Parts Catalog", "categoria": "PARTES", "fabricante": "Piper", "numero_parte": "761-659", "revision": "Interim revision Jun 26, 1998", "aeronaves": ["YS-334-PE"], "es_general": false},
    {"clave": "piper-pa-28-180e-poh", "titulo": "Cherokee 180 E Owner's Handbook", "categoria": "OPERACION", "fabricante": "Piper", "numero_parte": null, "revision": null, "aeronaves": ["YS-270-PE"], "es_general": false, "nota": "¿Es el POH del Cherokee al que está asignado?"},
    {"clave": "piper-pa-28r-180-poh", "titulo": "Cherokee Arrow (PA-28R-180) Owner's Handbook", "categoria": "OPERACION", "fabricante": "Piper", "numero_parte": null, "revision": null, "aeronaves": ["YS-127-P"], "es_general": false, "nota": "¿El Arrow al que está asignado es PA-28R-180 o PA-28R-200?"},
    {"clave": "rapco-fuelpump-app", "titulo": "Rapco Fuel Pump Application Guide", "categoria": "CATALOGO", "fabricante": "Rapco", "numero_parte": null, "revision": null, "aeronaves": [], "es_general": true},
    {"clave": "rapcobrakeapp-2013", "titulo": "Rapco Brake Application Guide (2013)", "categoria": "CATALOGO", "fabricante": "Rapco", "numero_parte": null, "revision": "2013", "aeronaves": [], "es_general": true},
    {"clave": "service-manual-140-200r", "titulo": "Cherokee Service Manual PA-28-140 a PA-28R-200 (fichas)", "categoria": "MANTENIMIENTO", "fabricante": "Piper", "numero_parte": "753-586", "revision": null, "aeronaves": ["YS-270-PE", "YS-155-PE", "YS-127-P"], "es_general": false, "nota": "Hay dos service manuals del Cherokee: este (fichas) y la edición 2021. ¿Cuál es el vigente?"},
    {"clave": "slick-4300-6300-overhaul-manual-l-1363f", "titulo": "Slick 4300/6300 Magneto Maintenance and Overhaul Manual", "categoria": "OVERHAUL", "fabricante": "Champion Aerospace (Slick)", "numero_parte": "L-1363F", "revision": null, "aeronaves": [], "es_general": true},
    {"clave": "t303-amm-july-1996-rev-02", "titulo": "Cessna T303 Crusader Maintenance Manual", "categoria": "MANTENIMIENTO", "fabricante": "Cessna", "numero_parte": null, "revision": "Rev. 2, Jul 1996", "aeronaves": [], "es_general": false, "nota": "¿De qué avión es?"}
  ],
  "paquetes_sugeridos": [
    {"aeronave": "YS-334-PE", "tipo": "100HR", "extractos": [{"clave": "pa-38-112-amm", "desde": 43, "hasta": 58, "titulo": "5-20-00 Scheduled Maintenance (Annual / 100 Hour)"}]},
    {"aeronave": "YS-334-PE", "tipo": "ANUAL", "extractos": [{"clave": "pa-38-112-amm", "desde": 43, "hasta": 58, "titulo": "5-20-00 Scheduled Maintenance (Annual / 100 Hour)"}]},
    {"aeronave": "YS-333-PE", "tipo": "100HR", "extractos": [{"clave": "cessna-152-mm", "desde": 52, "hasta": 0, "titulo": "Inspection Requirements — 100 Hour / Annual"}]},
    {"aeronave": "YS-333-PE", "tipo": "ANUAL", "extractos": [{"clave": "cessna-152-mm", "desde": 52, "hasta": 0, "titulo": "Inspection Requirements — 100 Hour / Annual"}]},
    {"aeronave": "YS-270-PE", "tipo": "100HR", "extractos": [{"clave": "644315110-sm-753-586-pa-28s", "desde": 150, "hasta": 181, "titulo": "Scheduled Maintenance + Annual / 100 Hour Inspection Procedure"}]},
    {"aeronave": "YS-270-PE", "tipo": "ANUAL", "extractos": [{"clave": "644315110-sm-753-586-pa-28s", "desde": 150, "hasta": 181, "titulo": "Scheduled Maintenance + Annual / 100 Hour Inspection Procedure"}]},
    {"aeronave": "YS-155-PE", "tipo": "100HR", "extractos": [{"clave": "644315110-sm-753-586-pa-28s", "desde": 150, "hasta": 181, "titulo": "Scheduled Maintenance + Annual / 100 Hour Inspection Procedure"}]},
    {"aeronave": "YS-155-PE", "tipo": "ANUAL", "extractos": [{"clave": "644315110-sm-753-586-pa-28s", "desde": 150, "hasta": 181, "titulo": "Scheduled Maintenance + Annual / 100 Hour Inspection Procedure"}]},
    {"aeronave": "YS-127-P", "tipo": "100HR", "extractos": [{"clave": "644315110-sm-753-586-pa-28s", "desde": 150, "hasta": 181, "titulo": "Scheduled Maintenance + Annual / 100 Hour Inspection Procedure"}]},
    {"aeronave": "YS-127-P", "tipo": "ANUAL", "extractos": [{"clave": "644315110-sm-753-586-pa-28s", "desde": 150, "hasta": 181, "titulo": "Scheduled Maintenance + Annual / 100 Hour Inspection Procedure"}]}
  ]
}
```

> Los `"hasta": 0` del C152 son **a propósito**: el índice dice dónde EMPIEZA la sección (pág. 52), no dónde termina. El Step 3 lo determina leyendo las páginas. `cargar.js` rechaza un `hasta` menor que `desde`, así que un 0 olvidado no llega a la base.

- [ ] **Step 2: `verificar_rangos.py`**

```python
"""
Lee las páginas de borde de cada rango sugerido para comprobar que la sección
empieza y termina donde dice catalogo.json (el índice solo da el comienzo).

    python verificar_rangos.py
Imprime, por rango: la primera línea de la página ANTERIOR al desde, del desde,
del hasta y de la SIGUIENTE al hasta. Lo correcto: el desde abre la sección y
la siguiente al hasta ya es otra sección.
"""
import json
import sys
import zipfile
from pathlib import Path

import fitz

from comun import ZIP_POR_DEFECTO, grupos_del_zip, bytes_finales

AQUI = Path(__file__).parent


def cabecera(doc, n):
    if n < 1 or n > doc.page_count:
        return "(fuera del manual)"
    return " ".join(doc[n - 1].get_text().split())[:160] or "(sin texto)"


def main():
    cat = json.loads((AQUI / "catalogo.json").read_text(encoding="utf-8"))
    z = zipfile.ZipFile(Path(sys.argv[1]) if len(sys.argv) > 1 else ZIP_POR_DEFECTO)
    grupos = dict(grupos_del_zip(z))
    vistos = set()
    for p in cat["paquetes_sugeridos"]:
        for e in p["extractos"]:
            k = (e["clave"], e["desde"], e["hasta"])
            if k in vistos:
                continue
            vistos.add(k)
            with fitz.open(stream=bytes_finales(z, e["clave"], grupos[e["clave"]]), filetype="pdf") as doc:
                print(f"\n== {e['clave']}  {e['desde']}–{e['hasta']}  «{e['titulo']}»")
                for etiqueta, n in [("antes", e["desde"] - 1), ("desde", e["desde"]), ("hasta", e["hasta"]), ("después", e["hasta"] + 1)]:
                    print(f"   {etiqueta:8s} p.{n:<5} {cabecera(doc, n)}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Determinar y verificar cada rango**

Run: `python verificar_rangos.py`

Para cada rango:
1. Si `hasta` es 0 (C152): recorrer las páginas desde el `desde` con `python -c "import fitz, zipfile; from comun import *; z=zipfile.ZipFile(ZIP_POR_DEFECTO); g=dict(grupos_del_zip(z)); d=fitz.open(stream=bytes_finales(z,'cessna-152-mm',g['cessna-152-mm']),filetype='pdf'); [print(n, ' '.join(d[n-1].get_text().split())[:140]) for n in range(50, 80)]"` y ubicar la última página de la tabla de inspección de 100 h / anual (la sección de Cessna "Inspection Requirements / Inspection Charts"). Poner ese número en `hasta`.
2. Para todos: confirmar que la línea `desde` abre la sección nombrada en el `titulo` y que la línea `después` ya pertenece a otra sección (`5-30-00 Special Inspections` en el PA-38; `8. Special Inspections` en el Cherokee 2021). Si no, corregir el número en `catalogo.json`.
3. Si alguna página de borde sale `(sin texto)`, renderizarla a PNG y mirarla: `pdftoppm` no sirve dentro del ZIP, así que usar `python -c "…; d[n-1].get_pixmap(dpi=60).save('borde.png')"` y leer la imagen. Borrar el PNG después.

Volver a correr `python verificar_rangos.py` hasta que todos los bordes cuadren. Ningún `hasta` puede quedar en 0.

- [ ] **Step 4: Cotejar números de parte y revisiones**

> Regla: **ninguna `nota` ni `titulo` lleva matrículas.** Se copian tal cual al esquema `demo`, y el disfraz del demo cambia las matrículas de las aeronaves pero no el texto libre (§39.D). Verificar: `python -c "import json,re; print([m['clave'] for m in json.load(open('catalogo.json',encoding='utf-8'))['manuales'] if re.search(r'YS-?\d', (m.get('nota') or '') + m['titulo'])])"` → `[]`.


Con `python -c "import json; [print(m['clave'], '|', m['portada'][:220]) for m in json.load(open('inventario.json', encoding='utf-8'))['manuales']]"`, recorrer las 35 portadas y corregir en `catalogo.json` todo `numero_parte` / `revision` que la portada contradiga. Si la portada no lo dice, `null` (no se inventa). Confirmar que hay exactamente 35 entradas y que cada `clave` de `catalogo.json` existe en `inventario.json` y viceversa:

`python -c "import json; c={m['clave'] for m in json.load(open('catalogo.json',encoding='utf-8'))['manuales']}; i={m['clave'] for m in json.load(open('inventario.json',encoding='utf-8'))['manuales']}; print(len(c), c^i)"`
Expected: `35 set()`

- [ ] **Step 5: Commit**

```bash
git add supabase/dump/manuales_taller/catalogo.json supabase/dump/manuales_taller/verificar_rangos.py
git commit -F <msg>   # "chore(taller): catálogo de manuales y paquetes sugeridos verificados"
```

---

## Task 17: Carga inicial — subir a Storage y registrar en la base

**Files:**
- Create: `supabase/dump/manuales_taller/subir.py`
- Create: `supabase/dump/manuales_taller/cargar.js`

- [ ] **Step 1: `subir.py`**

```python
"""
Paso 2 de 3: sube los manuales a Supabase Storage (bucket privado manuales-taller).

Corre con las credenciales de Railway, que NO se imprimen ni se guardan:
    cd legacy/CAA-backend
    railway run python ../../supabase/dump/manuales_taller/subir.py [--tomos] [ruta_del_zip]

Re-ejecutable: la ruta sale de la huella del archivo y, si ya existe, se da por
subido. Escribe subidos.json: clave → {sha256, paginas, tamano_bytes, archivo_path}.

--tomos: parte en dos lo que pase de 50 MiB (plan gratuito de Supabase). Usarlo
SOLO si la primera corrida falla con "tamaño máximo" en los manuales del T303.
"""
import hashlib
import json
import os
import sys
import uuid
import zipfile
from pathlib import Path

import fitz
import requests

sys.path.insert(0, str(Path(__file__).parent))
from comun import ZIP_POR_DEFECTO, grupos_del_zip, bytes_finales, en_tomos  # noqa: E402

AQUI = Path(__file__).parent
BUCKET = "manuales-taller"
NS = uuid.UUID("6f1c2a6e-8d0b-4a8e-9a55-2c7c0f6b1e11")  # fijo: misma huella → misma ruta


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    tomos = "--tomos" in sys.argv
    url = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_KEY"]
    h = {"Authorization": f"Bearer {key}", "apikey": key}

    r = requests.get(f"{url}/storage/v1/bucket/{BUCKET}", headers=h, timeout=30)
    if r.status_code != 200:
        sys.exit(f"El bucket {BUCKET} no existe: correr primero la migración 20260921000001.")

    z = zipfile.ZipFile(Path(args[0]) if args else ZIP_POR_DEFECTO)
    previo = AQUI / "subidos.json"
    salida = json.loads(previo.read_text(encoding="utf-8")) if previo.exists() else {}
    fallos = []
    for clave, nombres in grupos_del_zip(z):
        datos = bytes_finales(z, clave, nombres)
        partes = en_tomos(clave, datos) if tomos else [(clave, datos)]
        for k, b in partes:
            sha = hashlib.sha256(b).hexdigest()
            ruta = f"manuales/{uuid.uuid5(NS, sha)}.pdf"
            resp = requests.post(
                f"{url}/storage/v1/object/{BUCKET}/{ruta}",
                headers={**h, "Content-Type": "application/pdf", "x-upsert": "false"},
                data=b, timeout=900,
            )
            ya_estaba = resp.status_code == 409 or '"409"' in resp.text or "already exists" in resp.text
            if resp.status_code in (200, 201) or ya_estaba:
                with fitz.open(stream=b, filetype="pdf") as d:
                    salida[k] = {"sha256": sha, "paginas": d.page_count, "tamano_bytes": len(b), "archivo_path": ruta}
                print(f"{'YA   ' if ya_estaba else 'OK   '} {k} ({len(b) / 1048576:.1f} MB)")
            else:
                fallos.append(k)
                print(f"FALLO {k}: {resp.status_code} {resp.text[:200]}")
    previo.write_text(json.dumps(salida, indent=1), encoding="utf-8")
    print(f"\n{len(salida)} subidos · {len(fallos)} fallos {fallos if fallos else ''}")
    if fallos:
        sys.exit(1)


if __name__ == "__main__":
    main()
```

> Si se corre con `--tomos` después de una corrida normal, quitar de `subidos.json` la entrada del manual entero que falló (no debería estar: los fallos no se escriben).

- [ ] **Step 2: Subir**

Run (desde `legacy/CAA-backend`): `railway run python ../../supabase/dump/manuales_taller/subir.py`
Expected: 35 líneas `OK`, `35 subidos · 0 fallos`. Tarda varios minutos (630 MB).
- Si **solo** fallan `t303-amm-july-1996-rev-02` y/o `p689-12-cessna-t303-parts-catalog` con un mensaje de tamaño máximo: el plan es el gratuito. Volver a correr con `--tomos` (los ya subidos salen como `YA`). Anotarlo para el reporte a Daniel.
- Cualquier otro fallo: diagnosticar antes de seguir.

- [ ] **Step 3: Verificar en la base**

Run: `node query.js "SELECT COUNT(*) n, ROUND(SUM((metadata->>'size')::bigint)/1048576.0) mb FROM storage.objects WHERE bucket_id='manuales-taller' AND name LIKE 'manuales/%'"`
Expected: `n` = cantidad de entradas de `subidos.json` (35, o 37 con tomos); `mb` ≈ 630.

- [ ] **Step 3b: Comprobar que el SERVIDOR puede recortar cada manual subido**

La spec da por hecho que pdf-lib maneja los 35; esto lo prueba de verdad, con los archivos de Storage. Crear `legacy/CAA-backend/_verificar_manuales.js` (gitignored):

```js
// Carga cada manual subido con pdf-lib y recorta su primera página, como lo hará la app.
const fs = require("fs");
const path = require("path");
const storage = require("./utils/storage");
const { analizarPdf, armarPdf } = require("./utils/pdfExtractos");
const subidos = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "supabase", "dump", "manuales_taller", "subidos.json"), "utf8"));
(async () => {
  let fallos = 0;
  for (const [clave, s] of Object.entries(subidos)) {
    try {
      const bytes = await storage.descargarArchivo("manuales-taller", s.archivo_path);
      const a = await analizarPdf(bytes);
      if (a.error) throw new Error(a.error);
      if (a.sha256 !== s.sha256 || a.paginas !== s.paginas) throw new Error(`no coincide: ${a.paginas} págs.`);
      const out = await armarPdf([{ sha256: a.sha256, pagina_desde: 1, pagina_hasta: 1 }], new Map([[a.sha256, bytes]]));
      console.log(`OK    ${clave} (${out.length} bytes la pág. 1)`);
    } catch (e) {
      fallos++;
      console.log(`FALLO ${clave}: ${e.message}`);
    }
  }
  console.log(`\n${Object.keys(subidos).length - fallos} OK · ${fallos} fallos`);
  process.exit(fallos ? 1 : 0);
})();
```

Run (desde `legacy/CAA-backend`): `railway run node _verificar_manuales.js`
Expected: todas `OK` y `0 fallos`. Un fallo acá significa que ese manual no se podría imprimir desde la app: arreglar `comun.py` (o el armado) y volver a subir **antes** de registrar nada en la base.

- [ ] **Step 4: `cargar.js`**

```js
/**
 * Paso 3 de 3: registra en la base los manuales ya subidos y los paquetes
 * sugeridos (spec 2026-09-20 §11).
 *
 *   node cargar.js --dry-run    no escribe nada, solo el reporte
 *   node cargar.js              carga de verdad
 *
 * Re-ejecutable: un manual con la misma huella no se vuelve a insertar, y un
 * paquete sugerido solo se crea si el avión todavía no tiene ese paquete (nunca
 * pisa lo que el jefe ya armó).
 */
const fs = require("fs");
const path = require("path");

// Mismo patrón que aeronavegabilidad/cargar.js: dependencias y .env por ruta
// absoluta al backend (require() resuelve contra la carpeta DEL SCRIPT).
const BACKEND = path.join(__dirname, "..", "..", "..", "legacy", "CAA-backend");
require(path.join(BACKEND, "node_modules", "dotenv")).config({ path: path.join(BACKEND, ".env"), quiet: true });
const { Pool } = require(path.join(BACKEND, "node_modules", "pg"));

const DRY = process.argv.includes("--dry-run");
const ORIGEN = "ZIP_2026-09-20";
const NOTA = "Asignación deducida por el sistema leyendo la portada. Confirmala o corregila.";

const pool = new Pool({
  host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

async function main() {
  const cat = JSON.parse(fs.readFileSync(path.join(__dirname, "catalogo.json"), "utf8"));
  const sub = JSON.parse(fs.readFileSync(path.join(__dirname, "subidos.json"), "utf8"));
  const rep = { insertados: [], ya_estaban: [], sin_subir: [], paquetes: [], paquetes_omitidos: [] };
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const av = await c.query("SELECT id_aeronave, codigo FROM aeronave");
    const idAvion = new Map(av.rows.map((a) => [a.codigo, a.id_aeronave]));
    const unico = new Map(); // clave → {id, paginas} de los manuales que NO se partieron en tomos

    for (const m of cat.manuales) {
      const partes = Object.keys(sub).filter((k) => k === m.clave || k.startsWith(`${m.clave}-tomo-`)).sort();
      if (!partes.length) { rep.sin_subir.push(m.clave); continue; }
      for (const [i, k] of partes.entries()) {
        const s = sub[k];
        const titulo = partes.length > 1 ? `${m.titulo} (Tomo ${i + 1} de ${partes.length})` : m.titulo;
        const ya = await c.query("SELECT id_manual FROM taller_manual WHERE sha256 = $1", [s.sha256]);
        let id;
        if (ya.rows.length) {
          id = ya.rows[0].id_manual;
          rep.ya_estaban.push(k);
        } else {
          const r = await c.query(
            `INSERT INTO taller_manual (titulo, categoria, fabricante, numero_parte, revision, paginas, tamano_bytes,
                                        sha256, archivo_path, es_general, necesita_confirmacion, nota_confirmacion, origen)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12) RETURNING id_manual`,
            [titulo, m.categoria, m.fabricante || null, m.numero_parte || null, m.revision || null, s.paginas,
             s.tamano_bytes, s.sha256, s.archivo_path, !!m.es_general, m.nota || NOTA, ORIGEN]
          );
          id = r.rows[0].id_manual;
          rep.insertados.push(k);
          for (const cod of m.aeronaves || []) {
            if (!idAvion.has(cod)) throw new Error(`${m.clave}: no existe el avión ${cod}`);
            await c.query(
              "INSERT INTO taller_manual_aeronave (id_manual, id_aeronave) VALUES ($1,$2) ON CONFLICT DO NOTHING",
              [id, idAvion.get(cod)]
            );
          }
        }
        if (partes.length === 1) unico.set(m.clave, { id, paginas: s.paginas });
      }
    }

    for (const p of cat.paquetes_sugeridos) {
      const idA = idAvion.get(p.aeronave);
      if (!idA) throw new Error(`Paquete sugerido: no existe el avión ${p.aeronave}`);
      const existe = await c.query(
        "SELECT 1 FROM taller_paquete_manual WHERE id_aeronave = $1 AND tipo_mantenimiento = $2", [idA, p.tipo]
      );
      if (existe.rows.length) { rep.paquetes_omitidos.push(`${p.aeronave} ${p.tipo}`); continue; }
      const pq = await c.query(
        "INSERT INTO taller_paquete_manual (id_aeronave, tipo_mantenimiento, estado) VALUES ($1,$2,'BORRADOR') RETURNING id_paquete",
        [idA, p.tipo]
      );
      for (const [i, e] of p.extractos.entries()) {
        const m = unico.get(e.clave);
        if (!m) throw new Error(`Paquete ${p.aeronave} ${p.tipo}: el manual ${e.clave} no está cargado (o está en tomos)`);
        if (!(e.desde >= 1 && e.hasta >= e.desde && e.hasta <= m.paginas)) {
          throw new Error(`Paquete ${p.aeronave} ${p.tipo}: rango ${e.desde}-${e.hasta} inválido para ${e.clave} (${m.paginas} págs.)`);
        }
        await c.query(
          `INSERT INTO taller_paquete_extracto (id_paquete, id_manual, pagina_desde, pagina_hasta, titulo, orden, origen)
           VALUES ($1,$2,$3,$4,$5,$6,'SUGERIDO')`,
          [pq.rows[0].id_paquete, m.id, e.desde, e.hasta, e.titulo, i]
        );
      }
      rep.paquetes.push(`${p.aeronave} ${p.tipo}`);
    }

    await c.query(DRY ? "ROLLBACK" : "COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
    await pool.end();
  }
  fs.writeFileSync(path.join(__dirname, "reporte.json"), JSON.stringify(rep, null, 1));
  console.log(`${DRY ? "[DRY-RUN] " : ""}manuales nuevos ${rep.insertados.length} · ya estaban ${rep.ya_estaban.length} · ` +
    `sin subir ${rep.sin_subir.length} · paquetes ${rep.paquetes.length} · omitidos ${rep.paquetes_omitidos.length}`);
  if (rep.sin_subir.length) console.log("Sin subir:", rep.sin_subir.join(", "));
}

main().catch((e) => { console.error(e.message); process.exit(1); });
```

- [ ] **Step 5: Probar en seco y cargar**

Run (desde la raíz del worktree): `node supabase/dump/manuales_taller/cargar.js --dry-run`
Expected: `[DRY-RUN] manuales nuevos 35 · ya estaban 0 · sin subir 0 · paquetes 10 · omitidos 0`.
Luego: `node supabase/dump/manuales_taller/cargar.js` → mismo resumen sin `[DRY-RUN]`.
Y otra vez `node supabase/dump/manuales_taller/cargar.js` → `manuales nuevos 0 · ya estaban 35 · … · paquetes 0 · omitidos 10` (idempotente).

- [ ] **Step 6: Commit**

```bash
git add supabase/dump/manuales_taller/subir.py supabase/dump/manuales_taller/cargar.js supabase/dump/manuales_taller/subidos.json supabase/dump/manuales_taller/reporte.json
git commit -F <msg>   # "chore(taller): carga inicial de los 35 manuales y paquetes sugeridos"
```

---

## Task 18: Cuenta de demostraciones

**Files:**
- Modify: `legacy/CAA-backend/demo/catalogo.js` (lista `CATALOGO`)
- Modify: `legacy/CAA-backend/demo/reset.js` (set `CONSERVAR`)
- Modify: `docs/demo/RUNBOOK.md`

- [ ] **Step 1: Agregar las tablas de configuración**

En `demo/catalogo.js`, al final del arreglo `CATALOGO` (después de `"taller_sticker_plantilla"`):

```js
  // Manuales del taller (spec 2026-09-20 §12): documentos del fabricante y
  // paquetes sin nada de CAAA. Los archivos se comparten con producción: la app
  // nunca borra ni pisa un objeto del bucket, así que el demo no puede tocarlos.
  "taller_manual",
  "taller_manual_aeronave",
  "taller_paquete_manual",
  "taller_paquete_extracto",
```

En `demo/reset.js`, en la sección `// Taller` de `CONSERVAR`, después de `"taller_formulario", "taller_sticker_plantilla",`:

```js
  // Manuales: configuración, sobrevive al reinicio. Las páginas agregadas a
  // una ORDEN (taller_orden_extracto) NO están acá: son operación y se vacían
  // con las órdenes. Por eso son dos tablas y no una (spec 2026-09-20 §12).
  "taller_manual", "taller_manual_aeronave", "taller_paquete_manual", "taller_paquete_extracto",
```

- [ ] **Step 2: Anotar en el runbook**

En `docs/demo/RUNBOOK.md`, al final de la sección 3 ("Después de cada migración"), agregar:

```markdown
> **Manuales del taller.** La biblioteca y los paquetes son catálogo: se copian
> de `public` y **sobreviven a "Reiniciar demo"**. Si en una demostración alguien
> sube, edita o archiva un manual, eso queda; la biblioteca del demo solo vuelve
> a la de producción corriendo otra vez el segundo comando de arriba. Los
> archivos PDF son los mismos del bucket `manuales-taller`: la app nunca borra ni
> pisa uno, así que el demo no puede dañar los de CAAA.
```

- [ ] **Step 3: Regenerar el esquema demo**

Run (desde `legacy/CAA-backend`), los dos comandos de la sección 3 del runbook:

```bash
node -e "require('dotenv').config();const db=require('./config/db');db.poolPublic.query('SELECT public.clonar_demo()').then(r=>{console.log(r.rows[0]);process.exit(0)})"
node -e "require('dotenv').config();require('./demo/catalogo').copiarCatalogo({log:console.log}).then(()=>require('./demo/reset').reiniciar({log:console.log})).then(r=>{console.log(r);process.exit(0)})"
```

Expected: el segundo imprime `taller_manual: 35` (o 37 con tomos) entre las copiadas, y el reinicio termina sin error.

- [ ] **Step 4: Probar que una página en una orden del demo no rompe el reinicio**

```bash
node -e "require('dotenv').config();const db=require('./config/db');(async()=>{const o=await db.poolDemo.query('SELECT id_orden FROM taller_orden_extracto LIMIT 0');const ot=await db.poolDemo.query('SELECT id_orden FROM orden_trabajo LIMIT 1');const m=await db.poolDemo.query('SELECT id_manual FROM taller_manual LIMIT 1');await db.poolDemo.query(\"INSERT INTO taller_orden_extracto (id_orden,id_manual,pagina_desde,pagina_hasta,titulo,origen) VALUES (\$1,\$2,1,1,'prueba reinicio','MANUAL')\",[ot.rows[0].id_orden,m.rows[0].id_manual]);await require('./demo/reset').reiniciar({log:()=>{}});const r=await db.poolDemo.query(\"SELECT (SELECT COUNT(*) FROM taller_orden_extracto WHERE titulo='prueba reinicio')::int ord,(SELECT COUNT(*) FROM taller_manual)::int man,(SELECT COUNT(*) FROM taller_paquete_extracto)::int paq\");console.log(r.rows[0]);process.exit(0)})().catch(e=>{console.error(e.message);process.exit(1)})"
```

Expected: `{ ord: 0, man: 35, paq: 10 }` — la página de la orden se fue, los manuales y paquetes quedaron. (Si `orden_trabajo` del demo está vacío porque el escenario no siembra órdenes, crear una con el mismo INSERT mínimo que usa `demo/escenarioTaller.js` antes de probar.)

- [ ] **Step 5: Commit**

```bash
git add legacy/CAA-backend/demo/catalogo.js legacy/CAA-backend/demo/reset.js docs/demo/RUNBOOK.md
git commit -F <msg>   # "feat(demo): los manuales del taller en la cuenta de demostraciones"
```

---

## Task 19: Verificación en el navegador

Sin archivos nuevos: es la prueba de las pantallas con los manuales reales ya cargados.

- [ ] **Step 1: Backend local con CORS para el front local**

Run (en segundo plano, desde `legacy/CAA-backend`): `railway run bash -c "PORT=5099 ALLOWED_ORIGINS=http://localhost:5179 node server.js"`. Confirmar en el log que escucha en 5099.

- [ ] **Step 2: Front local apuntando al backend local**

Run (desde `CAA-frontend`): `VITE_API_URL=http://localhost:5099 node scripts/generate-config.mjs` (genera `public/config.js`, que está en `.gitignore`; confirmarlo con `git check-ignore public/config.js`). Luego `preview_start` con `{name: "caaa-frontend"}` (puerto 5179, `.claude/launch.json` en la raíz del repo).

- [ ] **Step 3: Recorrido como jefe (`u_taller` / `demo123`)**

1. Menú → **Manuales**: la biblioteca lista 35 manuales; la nota "35 manual(es) … por confirmar"; las fichas por matrícula filtran.
2. Abrir **PA-38-112 AMM (2019)**: abre en segundos (confirmar con `read_network_requests` que las peticiones al bucket son `206` de ~256 KB, **no** una descarga de 7 MB). El índice muestra "Chapter 5"; tocar `5-20-00 Scheduled Maintenance` salta a la 43. Buscar "torque" encuentra una página.
3. Marcar desde/hasta y **Imprimir estas páginas**: se abre una pestaña con el PDF y solo esas páginas.
4. **Paquetes por inspección**: 10 celdas en borrador (YS-334-PE, YS-333-PE, YS-270-PE, YS-155-PE, YS-127-P × 100 h / anual). Abrir YS-334-PE · 100 h: el rango sugerido aparece con la etiqueta "Sugerido por el sistema". **No confirmar**: es decisión del jefe real. Salir sin guardar.
5. Crear un paquete de prueba en **ZZ-PRUEBA · 50 h** con un rango de cualquier manual → "Guardar y confirmar" → la celda sale verde.

- [ ] **Step 4: Recorrido como mecánico (`u_mecanico` / `demo123`)**

1. Menú → Manuales: no aparece la pestaña "Paquetes por inspección".
2. **Mi taller**: abrir un trabajo sobre **ZZ-PRUEBA** (desde "Iniciar un mantenimiento"), tocar **Manuales de este trabajo**: como la orden no está enlazada a una inspección, aparece "¿Es una inspección? Traé sus páginas" → elegir 50 h → **Traer**: aparece el rango del paquete de prueba.
3. **Agregar páginas de un manual** → elegir uno → marcar → "Agregar a la orden …" → aparece en "Agregadas en este trabajo".
4. **Abrir e imprimir todo**: se abre el PDF con paquete + agregadas.
5. Con `resize_window` a **375 px** (recargar la página después, lección §35), repetir 2–4: nada se desborda (`document.documentElement.scrollWidth <= 375`), los botones grandes caben.
6. Medir contraste de los textos nuevos con el método de §35 (canvas + primer ancestro opaco): ninguno por debajo de 4.5:1 (3:1 en texto grande). Corregir tokens si hace falta.

- [ ] **Step 5: Limpiar lo de prueba**

Anular/borrar la orden de prueba sobre ZZ-PRUEBA y su paquete de 50 h:
`node query.js "DELETE FROM taller_orden_extracto WHERE id_orden IN (SELECT id_orden FROM orden_trabajo WHERE id_aeronave=(SELECT id_aeronave FROM aeronave WHERE codigo='ZZ-PRUEBA') AND estado IN ('ABIERTA','ANULADA') AND creado_en::date = CURRENT_DATE)"` — revisar antes con un SELECT qué órdenes toca; borrar la orden de prueba y `DELETE FROM taller_paquete_manual WHERE id_aeronave=(SELECT id_aeronave FROM aeronave WHERE codigo='ZZ-PRUEBA')`. Detener el backend local y el preview.

- [ ] **Step 6: Commit de lo que se haya corregido**

Si la verificación destapó defectos, arreglarlos y commitear: `fix(taller): <defecto> (verificación en el navegador)`.

---

## Task 20: Documentación, despliegue y verificación en producción

**Files:**
- Modify: `CLAUDE.md` (nueva §41 y §24)
- Memory: `C:\Users\Daniel\.claude\projects\C--Users-Daniel-Desktop-CAAA-modulo-op-admin\memory\`

- [ ] **Step 1: CLAUDE.md**

Agregar al final una sección **§41 "Sesión 2026-09-21 — Manuales del taller"** con: qué se construyó (biblioteca, paquetes, páginas por orden), el modelo (5 tablas, dos de extractos y por qué), las trampas medidas (pdf-lib arrastra por `/Annots`; Supabase no expone `Accept-Ranges` → `PDFDataRangeTransport`; la app nunca borra objetos del bucket), dónde está la carga (`supabase/dump/manuales_taller/`), y si el plan de Supabase obligó a tomos. En **§24 "Pendientes vigentes"** agregar el bloque **"📚 Manuales (con el jefe de taller)"**: confirmar la asignación de los 35 manuales; ¿cuál edición del Tomahawk y cuál service manual del Cherokee son vigentes?; falta el manual del Cessna 310; ¿de qué avión son T303 / Seneca II / Azteca / Navajo / Warrior?; revisar y confirmar los 10 paquetes sugeridos; armar los de 25 h y 50 h.

- [ ] **Step 2: Memoria**

Crear `sesion-2026-09-21-manuales-taller.md` (tipo `project`) con lo no derivable del código: las decisiones de Daniel (páginas por orden, jefe y mecánico agregan, impresión tal cual, revisiones siguen con la vieja y avisan) y los pendientes del jefe. Agregar la línea al índice `MEMORY.md`.

- [ ] **Step 3: Pruebas y build finales**

Run: `cd legacy/CAA-backend && npm test` → PASS. `cd CAA-frontend && VITE_API_URL="https://caaa-backend-production.up.railway.app" npm run build` → OK.

- [ ] **Step 4: Commit de docs**

```bash
git add CLAUDE.md
git commit -F <msg>   # "docs: CLAUDE.md §41 manuales del taller y pendientes con el jefe"
```

- [ ] **Step 5: Desplegar**

La migración ya está aplicada (Task 1) y los manuales ya están cargados (Task 17). Desde el worktree:

```bash
git fetch origin
git merge origin/master        # traer lo de Samuel; resolver conflictos si los hay y volver a correr Step 3
git merge-base --is-ancestor origin/master HEAD && echo listo
git push origin HEAD:master     # sin forzar: si origin se movió, git lo rechaza
```

Si el clasificador de auto-mode bloquea el push, pedir autorización a Daniel.

- [ ] **Step 6: Verificar producción**

1. `curl -s -o /dev/null -w "%{http_code}" https://caaa-backend-production.up.railway.app/api/taller/manuales` → **401** (existe y pide auth). Ojo: `/api/taller` tiene auth a nivel de router y da 401 aunque la ruta no exista (§29) — confirmar de verdad con token: script `node` que loguea `u_taller` contra la URL de producción y hace `GET /api/taller/manuales` → 200 con 35 manuales, y `POST /api/taller/manuales/pdf` de un rango chico → 200 con URL que abre un PDF.
2. Esperar el deploy de Vercel (puede tardar ~6 min) y abrir `https://caaa-app.vercel.app/taller/manuales` con `u_taller`: la biblioteca carga y un manual abre en el visor.
3. Recién ahí avisarle a Daniel, con la lista de pendientes para el jefe de taller.
