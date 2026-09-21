# Manuales del taller: biblioteca, paquetes por inspección y páginas por orden

**Fecha:** 2026-09-20
**Estado:** diseño aprobado, pendiente de plan de implementación
**Alcance:** ver e imprimir los manuales desde la plataforma; que el jefe de taller configure qué
páginas acompañan cada inspección programada; que a cualquier orden se le puedan agregar páginas.

---

## 1. El caso

La escuela entregó en un ZIP todos los manuales de los aviones (`OneDrive_1_20-9-2026.zip`,
687 MB). Hoy viven en carpetas sueltas.

Las inspecciones de **25, 50 y 100 horas y la anual** usan **siempre las mismas páginas**, porque
están estandarizadas. Pero **esa lista no existe todavía**: nadie la ha escrito, y Daniel no la
conoce. Por eso no se puede sembrar a mano: hace falta que el **jefe de taller** la arme desde la
plataforma.

### Lo que se busca

1. Que desde la plataforma se puedan **ver** los manuales y **mandar a imprimir** páginas.
2. Un **configurador** para el jefe de taller: por avión y por inspección, qué manuales y qué
   páginas le salen al mecánico.
3. Que el mecánico con el trabajo abierto toque **"Manuales de este trabajo"** y obtenga esas
   páginas listas para imprimir.
4. Que **a cualquier orden** —incluida una programada, cuando aparece algo que arreglar— se le puedan
   agregar más páginas de las que trae el paquete.

---

## 2. Lo que trae el ZIP (medido, no supuesto)

Inventario hecho leyendo cada PDF desde el ZIP, sin descomprimirlo.

| | |
|---|---|
| Archivos | **180**, 687 MB |
| Manuales reales | **45** — el del Azteca viene partido en **144 pedazos** (1,433 págs.) |
| Duplicados | 2: `service manual 140-200R.pdf` = `pa28-service.pdf` (mismas 912 págs. e índice, bytes distintos); `overhaul_manual__lycoming…(Autosaved).pdf` = el mismo sin "(Autosaved)" |
| Después de limpiar | **43 manuales, ~630 MB** |
| Más pesados | `T303 AMM` 72 MB (1,533 págs.) · `P689-12 T303 Parts Catalog` 60 MB · `pa-31` 50 MB |
| Con texto buscable | casi todos. **Sin texto** (escaneos): catálogo de partes del T303, catálogo de partes del C152, POH del PA-38 |
| Con índice (marcadores) | casi todos, y ricos: el PA-38 AMM trae 545 entradas, el AC 43.13 trae 3,784 |

**Recomprimir no sirve**: son escaneos de 1 bit ya comprimidos en CCITT/JBIG2. El T303 pasa de 72.4 a
70.7 MB y el C152 de 19.7 a 18.9. Se guardan tal cual.

### Hallazgos que el jefe tiene que resolver

- **Falta el manual del Cessna 310 (`YS-259-PE`).** No viene en el ZIP.
- **Vienen manuales de aviones que no están en la flota**: T303 Crusader (y su motor TSIO-520),
  Seneca II (y su motor TSIO-360), Azteca (PA-23-250) y Navajo (PA-31). Probablemente de los clientes
  externos de la OMA (`YS-361-PE`, `YS-243-P`, `YS-22-C`, todos con `modelo = 'EXTERNA'`) o del segundo
  bimotor.
- **Un archivo mal nombrado**: `447340064-Piper-Parts-Manual-761-589 PA44-200T.pdf` es el catálogo de
  partes del **Seneca II (PA-34-200T)**, no de un PA-44.
- **Dos ediciones del manual del Tomahawk**: `Maintenance manual PA-38.PDF` (revisión interina 2000,
  435 págs.) y `PA-38-112 AMM.pdf` (edición 2019, 712 págs.). **Sus páginas no coinciden.**
- **Dos service manuals del Cherokee**: el de fichas (`service manual 140-200R`, 912 págs.) y la
  edición 2021 (`SM-753-586`, 1,013 págs.).
- `PA-28-151 AMM` (Warrior) no corresponde a ningún avión de la flota por modelo.

### Dónde están las inspecciones (según los marcadores)

| Manual | Sección | Pág. del PDF |
|---|---|---|
| PA-38-112 AMM (2019) | `5-20-00 Scheduled Maintenance` → `Annual / 100 Hour Inspection Procedure` | 43 / 46 |
| Maintenance manual PA-38 (2000) | `Periodic inspections` | 20 |
| Cessna 152 MM | `Inspection requirements` → `100 hour/annual` | 52 |
| SM-753-586 PA-28 (2021) | `7. Annual / 100 hour inspection procedure` | 154 |
| service manual 140-200R | `Section III Inspection` | 126 |

Los rangos exactos se verifican leyendo las páginas en la implementación, no solo el índice.

---

## 3. Las decisiones de Daniel

| | |
|---|---|
| ¿Solo paquetes fijos? | **No: también páginas por orden puntual.** Y aunque la orden sea de un mantenimiento programado, se le pueden agregar más hojas si aparece algo que arreglar |
| ¿Quién agrega páginas a una orden? | **El jefe y el mecánico de esa orden.** Queda constancia de qué datos técnicos se usaron. Los paquetes fijos siguen siendo solo del jefe |
| ¿Cómo se imprime? | **Tal cual**: solo las páginas del manual, sin portada ni pie |
| Revisión nueva de un manual | **Los paquetes siguen con la revisión vieja y avisan** hasta que el jefe los actualice. El mecánico los sigue viendo, con aviso |
| Enfoque | **Visor propio dentro de la app + recorte de páginas en el servidor** |

---

## 4. Modelo de datos

Migración aditiva. Todo `creado_en` lleva **la zona fijada en el DEFAULT**
(`DEFAULT (NOW() AT TIME ZONE 'America/El_Salvador')`), por la lección de §35.A.

```sql
CREATE TABLE taller_manual (
  id_manual             SERIAL PRIMARY KEY,
  titulo                VARCHAR(200) NOT NULL,
  categoria             VARCHAR(20)  NOT NULL CHECK (categoria IN
                          ('MANTENIMIENTO','PARTES','OVERHAUL','OPERACION','BOLETINES','NORMATIVA','CATALOGO')),
  fabricante            VARCHAR(80),
  numero_parte          VARCHAR(40),              -- '761-660'
  revision              VARCHAR(80),              -- texto libre: 'Oct 31, 2019'
  paginas               INTEGER NOT NULL CHECK (paginas > 0),
  tamano_bytes          BIGINT  NOT NULL,
  sha256                CHAR(64) NOT NULL UNIQUE,
  archivo_path          TEXT NOT NULL,            -- ruta dentro del bucket
  es_general            BOOLEAN NOT NULL DEFAULT false,   -- aplica a toda la flota
  estado                VARCHAR(12) NOT NULL DEFAULT 'VIGENTE'
                          CHECK (estado IN ('VIGENTE','REEMPLAZADO','ARCHIVADO')),
  id_reemplazado_por    INTEGER NULL REFERENCES taller_manual(id_manual),
  necesita_confirmacion BOOLEAN NOT NULL DEFAULT false,   -- asignación deducida por el sistema
  nota_confirmacion     TEXT,
  origen                VARCHAR(40),              -- 'ZIP_2026-09-20' | 'SUBIDA'
  subido_por            INTEGER NULL REFERENCES usuario(id_usuario),
  creado_en             TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/El_Salvador')
);

-- Un manual sirve a varios aviones (el service manual del Cherokee aplica al 270, al 155 y al 127).
CREATE TABLE taller_manual_aeronave (
  id_manual   INTEGER NOT NULL REFERENCES taller_manual(id_manual) ON DELETE CASCADE,
  id_aeronave INTEGER NOT NULL REFERENCES aeronave(id_aeronave),
  PRIMARY KEY (id_manual, id_aeronave)
);

CREATE TABLE taller_paquete_manual (
  id_paquete         SERIAL PRIMARY KEY,
  id_aeronave        INTEGER NOT NULL REFERENCES aeronave(id_aeronave),
  tipo_mantenimiento VARCHAR(10) NOT NULL CHECK (tipo_mantenimiento IN ('25HR','50HR','100HR','ANUAL')),
  estado             VARCHAR(12) NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR','CONFIRMADO')),
  confirmado_por     INTEGER NULL REFERENCES usuario(id_usuario),
  confirmado_en      TIMESTAMP,
  actualizado_por    INTEGER NULL REFERENCES usuario(id_usuario),
  actualizado_en     TIMESTAMP,
  UNIQUE (id_aeronave, tipo_mantenimiento)
);

-- Un renglón = manual + rango de páginas. Pertenece a un paquete O a una orden, nunca a los dos:
-- así el armado del PDF es el mismo en los dos casos.
CREATE TABLE taller_extracto_manual (
  id_extracto  SERIAL PRIMARY KEY,
  id_paquete   INTEGER NULL REFERENCES taller_paquete_manual(id_paquete) ON DELETE CASCADE,
  id_orden     INTEGER NULL REFERENCES orden_trabajo(id_orden),
  id_manual    INTEGER NOT NULL REFERENCES taller_manual(id_manual),   -- sin cascade: bloquea el borrado
  pagina_desde INTEGER NOT NULL CHECK (pagina_desde >= 1),
  pagina_hasta INTEGER NOT NULL,
  titulo       VARCHAR(200),                 -- '5-20-00 Scheduled Maintenance'
  orden        SMALLINT NOT NULL DEFAULT 0,
  origen       VARCHAR(10) NOT NULL CHECK (origen IN ('MANUAL','SUGERIDO','PAQUETE')),
  agregado_por INTEGER NULL REFERENCES usuario(id_usuario),
  creado_en    TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/El_Salvador'),
  CHECK ((id_paquete IS NULL) <> (id_orden IS NULL)),
  CHECK (pagina_hasta >= pagina_desde)
);
```

`origen`:

| | |
|---|---|
| `MANUAL` | lo agregó una persona (en un paquete o en una orden) |
| `SUGERIDO` | lo propuso la carga inicial; vive en un paquete `BORRADOR` |
| `PAQUETE` | copia **congelada** del paquete, hecha al firmar la orden (§7) |

`pagina_hasta <= taller_manual.paginas` cruza tablas: lo valida el controller.

---

## 5. Almacenamiento

- **Bucket privado nuevo `manuales-taller`** en Supabase Storage, sin tope propio por archivo ni lista
  de tipos (el global del plan manda). Rutas:
  - `manuales/<id_manual>-<slug>.pdf` — el manual completo, una sola vez.
  - `extractos/<hash>.pdf` — los PDF recortados, reutilizables (§6).
- **Hoy el Storage está casi vacío** (medido por SQL sobre `storage.objects`: 4 objetos, ~0 MB).
- ⚠️ **Plan de Supabase.** Si es el gratuito: **1 GB total y 50 MB por archivo**. Los manuales ocupan
  ~630 MB (63% del total) y **dos pasan de 50 MB** (T303 AMM y T303 parts). La carga inicial lo
  detecta al subir: si el plan limita, esos dos se parten en **dos tomos** cada uno (dos manuales,
  "Tomo 1/2" y "Tomo 2/2"). No es para decidirlo a ciegas: se verifica.

---

## 6. Armado del PDF

**Entrada:** una lista ordenada de `(id_manual, desde, hasta)`.
**Salida:** una URL firmada (1 h) de un PDF con **solo esas páginas, en ese orden, tal cual**.

1. **Llave del resultado:** `sha256` del JSON `[(manual.sha256, desde, hasta), …]`. Si
   `extractos/<hash>.pdf` ya existe, se devuelve su URL y listo. Mientras nadie cambie el paquete,
   nunca se regenera.
2. Si no existe: por cada manual distinto se baja **una vez** de Storage, se cargan las páginas con
   **`pdf-lib`** (MIT, sin binarios nuevos en Railway) y se copian al documento de salida.
3. Se sube a `extractos/<hash>.pdf` y se devuelve la URL.

🚨 **Antes de copiar, a cada página se le quitan `/Annots` y `/Thumb`.** Medido: los links internos
de los manuales apuntan a otras páginas, y `pdf-lib` los sigue y **arrastra el manual entero**. 20
páginas del service manual del Cherokee pesaban **14.8 MB**; quitando las anotaciones, **0.84 MB**
(PyMuPDF da 0.88 MB con las mismas páginas, así que ese es el tamaño real). En un PDF para imprimir
los links no sirven de nada.

**Medido en la máquina local** (20 páginas):

| Manual | Carga | Memoria |
|---|---|---|
| T303 AMM, 72 MB, 1,533 págs. | 1.9 s | 236 MB |
| service manual 140-200R, 40 MB | 6.9 s | 341 MB |
| T303 parts, 60 MB | 0.7 s | 194 MB |

Para no apilar picos de memoria, **se arma un PDF a la vez** (cola en el proceso). Si dos personas
piden el mismo a la vez, el segundo espera y recibe el mismo archivo.

**Si falla la bajada o el armado**, el endpoint responde con un error claro y la pantalla ofrece
"Reintentar". Nunca se entrega un PDF vacío.

**Caché que nadie usa:** los `extractos/*.pdf` viejos quedan en Storage. Pesan poco (una inspección
completa ronda 1 MB) y no se limpian en esta versión.

---

## 7. Qué páginas tiene una orden

**Inspección de la orden** = `mantenimiento_aeronave.tipo` del mantenimiento enlazado
(`orden_trabajo.id_mantenimiento`). Si no tiene, se usa `reporte_inspeccion.tipo_inspeccion`, pero solo
si es uno de `25HR/50HR/100HR/ANUAL`. Si no hay ninguno, es un correctivo: **no hay paquete**.

| Estado de la orden | Lo que se muestra y se imprime |
|---|---|
| `ABIERTA` | paquete **confirmado** de (avión, inspección), en vivo · **más** los extractos de la orden (`origen='MANUAL'`) |
| `FIRMADA`, `APROBADA`, `CERRADA` | solo los extractos de la orden: los `PAQUETE` congelados + los `MANUAL` |
| `ANULADA` | lo mismo, solo lectura |

**Congelar al firmar.** En la misma transacción de `firmarOrden`:
`DELETE … WHERE id_orden = $1 AND origen = 'PAQUETE'` y luego se copia el paquete confirmado vigente
con `origen = 'PAQUETE'`. Borrar antes de copiar hace que **una devolución del jefe y una segunda firma
no dupliquen** las páginas. Si el jefe cambia el paquete después, la orden conserva las páginas que se
usaron, igual que los stickers congelados (§37).

Un paquete **en borrador no se muestra al mecánico**. Si la orden es de inspección y el paquete no
está confirmado, **al jefe** se le avisa: *"el paquete 100 h de este avión no está confirmado"*.

---

## 8. Revisiones

- **"Subir revisión nueva"** desde un manual crea **otro** `taller_manual` y marca el viejo
  `REEMPLAZADO` con `id_reemplazado_por`. El archivo viejo **no se borra**: sigue legible y archivado.
- Los extractos **siguen apuntando a la revisión vieja**: sus números de página siguen siendo
  correctos para ese archivo. **Nada se corre en silencio.**
- El jefe ve *"N paquetes usan una revisión reemplazada"* (en la tabla de paquetes y en el manual).
  Al actualizar, cambia cada extracto al manual nuevo con sus páginas nuevas.
- El mecánico ve esos extractos con el aviso *"de la revisión anterior"*.
- **Borrar** un manual solo se puede si ningún extracto lo usa; si no, **409** con la sugerencia de
  archivarlo (`ARCHIVADO`).

---

## 9. Pantallas

### 9.1 Menú

Ítem nuevo **"Manuales"** (`/taller/manuales`) en `TallerSidebar` **y** en la sección Taller de
`AdminSidebar`, en el mismo orden (regla de §39.F: la referencia es el menú del taller; el ADMIN
agrega, nunca quita). Sub-pestañas con el patrón `inv-tabs` de Inventario:

- **Biblioteca** — todos los roles del taller.
- **Paquetes** — solo el jefe (`TALLER`) y `ADMIN`.

### 9.2 Visor (un solo componente)

`pdfjs-dist`, **cargado solo al abrir el visor** (import dinámico), para no engordar el bundle.

- Abre el manual por **URL firmada con peticiones por rango** (`disableAutoFetch`, `disableStream`):
  el visor pide **solo las páginas que se miran**. Abrir el manual de 72 MB no baja 72 MB.
- **Índice** a un lado, sacado de los marcadores del PDF (`getOutline`). Tocar una entrada salta a su
  página.
- **Búsqueda de texto** dentro del manual, página por página, con progreso y botón para cancelar.
  Buscar en un manual grande termina bajando buena parte de él: es para el jefe en su computadora; la
  navegación normal es por el índice.
- Página actual, anterior/siguiente, ir a página, zoom.
- **Modos** (solo cambian los botones):

| Modo | Dónde | Botones extra |
|---|---|---|
| `lectura` | Biblioteca | "Imprimir páginas…" (rango → PDF de §6) |
| `paquete` | Configurador | "Desde aquí" / "Hasta aquí" → título → "Agregar al paquete" |
| `orden` | Orden de trabajo | "Desde aquí" / "Hasta aquí" → título → "Agregar a la orden CAAA/2026-…" |

### 9.3 Biblioteca

Filtros por avión (fichas con la matrícula), **"Generales"** y **"Sin asignar"**, búsqueda por título.
Cada manual muestra categoría, número de parte, revisión, páginas y, si corresponde:

- *Por confirmar*: la asignación la dedujo el sistema.
- *Reemplazado por …*.

El jefe tiene además:

- **Subir manual** y **Subir revisión nueva**.
- **Editar**: metadatos, aviones, general, confirmar la asignación.
- **Archivar**.

### 9.4 Paquetes (configurador del jefe)

- **Tabla**: aviones (flota propia, sin simulador; los externos también, porque la OMA les da
  mantenimiento) × **25 h · 50 h · 100 h · Anual**. Cada celda: *vacío · borrador · confirmado ·
  ⚠ usa revisión reemplazada*.
- **Editor** de una celda:
  - A la izquierda, la lista de extractos: reordenar, editar título, quitar, vista previa.
  - A la derecha, el visor en modo `paquete`, con el selector de manual limitado a los del avión y los
    generales, más "ver todos".
  - **"Copiar de…"** trae los extractos de otro avión o de otra inspección.
  - **Guardar** y **Confirmar**. Guardar un paquete confirmado lo mantiene confirmado: el borrador
    existe solo para lo que propuso el sistema.

### 9.5 En la orden

Botón **"Manuales de este trabajo (N)"** en la tarjeta del trabajo de **Mi taller** y en
**`OrdenDetalleModal`**. Abre un modal con:

- **Del paquete** (título, páginas) y **Agregadas en este trabajo** (quién y cuándo).
- **"Abrir e imprimir todo (N págs.)"** → un solo PDF (§6). En el celular abre el visor del
  teléfono, que ya permite imprimir o compartir.
- **"Agregar páginas de un manual"** → el visor en modo `orden`.
- Quitar una página **agregada**, mientras la orden esté abierta. **Las del paquete no se quitan desde
  la orden**: son del jefe.
- Avisos: *"de la revisión anterior"*; al jefe, *"el paquete no está confirmado"*.

El configurador está pensado para computadora. El modal de la orden, para el celular (375 px).

---

## 10. API (`/api/taller`)

| Método y ruta | Roles | Qué hace |
|---|---|---|
| `GET /manuales` | READ | lista (filtros `aeronave`, `q`, `incluir_reemplazados`) + cuántos extractos lo usan |
| `GET /manuales/:id` | READ | detalle + aviones + cadena de revisiones |
| `GET /manuales/:id/url` | READ | URL firmada (1 h) para el visor |
| `POST /manuales/subida` | JEFE | reserva una ruta y devuelve un **permiso de subida directa** (`createSignedUploadUrl`) |
| `POST /manuales` | JEFE | registra el manual ya subido (el servidor verifica que el objeto exista y su tamaño) |
| `POST /manuales/:id/revision` | JEFE | igual que el anterior, y marca el viejo `REEMPLAZADO` |
| `PATCH /manuales/:id` | JEFE | metadatos, aviones, general, confirmar asignación, archivar |
| `DELETE /manuales/:id` | JEFE | 409 si algún extracto lo usa |
| `POST /manuales/pdf` | READ | `{extractos:[…]}` → URL del PDF recortado (imprimir desde la biblioteca) |
| `GET /paquetes-manuales` | READ | la tabla aviones × inspecciones con su estado |
| `GET /paquetes-manuales/:id_aeronave/:tipo` | READ | el paquete con sus extractos |
| `PUT /paquetes-manuales/:id_aeronave/:tipo` | JEFE | **reemplaza el set completo** de extractos (reordenar = mandar el orden nuevo), opcional `confirmar` |
| `GET /ordenes/:id/manuales` | READ | lo de §7 + avisos |
| `POST /ordenes/:id/manuales` | JEFE o mecánico de la orden | agrega un extracto (orden `ABIERTA`) |
| `DELETE /ordenes/:id/manuales/:id_extracto` | JEFE o mecánico de la orden | solo `origen='MANUAL'`, orden `ABIERTA` |
| `POST /ordenes/:id/manuales/pdf` | READ | URL del PDF de la orden |

`READ` y `JEFE` son los grupos que ya existen en `tallerRoutes.js` (`READ = TALLER, TECNICO, ADMIN`;
`JEFE = TALLER, ADMIN`). **Mecánico de la orden** = `id_mecanico_asignado = uid OR creado_por = uid`, el
mismo criterio de "lo mío" que `asignadas=true` (§36).

**La subida no pasa por Railway**: el navegador sube directo a Storage con el permiso temporal. El
`sha256` y la cantidad de páginas los calcula el navegador (`crypto.subtle` y `pdfjs`) antes de
registrar. Así 70 MB no cruzan el backend, que tiene `express.json` a 10 MB y `multer` en memoria.

Todos los controllers nuevos con `try/catch` (lección de §15.D) y parámetros casteados.

---

## 11. Carga inicial del ZIP

Script en `supabase/dump/manuales_taller/`, con el mismo patrón de `inventario_oma/` y
`aeronavegabilidad/`: un paso en Python y otro en Node, con `--dry-run` y reporte.

1. **`preparar.py`** — lee el ZIP **en memoria** (sin descomprimirlo a disco):
   - Une los 144 pedazos del Azteca en orden de nombre. Verificado: `1A1-1A10`, `1A11-1A20`,
     `1A21-1A30`, `330060003` … `330060143` siguen la numeración de fichas, de `1A1` a `5L20`.
   - Descarta los 2 duplicados (antes, compara texto de varias páginas para confirmar que son el mismo
     contenido).
   - Saca título, número de parte, revisión, páginas y `sha256`.
   - Escribe un **catálogo JSON** con la categoría y la asignación propuesta. Este archivo se revisa a
     mano antes de cargar.
2. **`cargar.js`** — sube con **`railway run`**: la llave de Storage llega por el entorno y **no se
   imprime ni se guarda local**. Es idempotente por `sha256` (volver a correrlo no duplica). Marca
   `origen = 'ZIP_2026-09-20'`.

### Asignación propuesta (todo con `necesita_confirmacion = true`)

| Avión | Manuales |
|---|---|
| `YS-334-PE` Tomahawk | PA-38 AMM (las dos ediciones), catálogo PA-38, POH PA-38, Lycoming O-235 (partes y operador), overhaul Lycoming |
| `YS-333-PE` C152 | C152 MM + revisión temporal 5, POH, catálogo, Lycoming O-235, overhaul Lycoming |
| `YS-270-PE`, `YS-155-PE`, `YS-127-P` | service manuals PA-28 (los dos), catálogos PA-28, overhaul Lycoming; POH 180E al Cherokee y POH Arrow al 127 |
| **Generales** | AC 43.13-1B, Champion, Slick (overhaul y aplicaciones), Rapco (frenos y bomba), índice de boletines Piper 762-332, Continental M-0 |
| **Sin asignar** | T303 (AMM, partes, motor), Seneca II (SM, partes, motor), Azteca, Navajo, PA-28-151 |

### Paquetes sugeridos (en borrador)

**100 h y Anual** para cada avión con manual de mantenimiento, con `origen = 'SUGERIDO'`, a partir de
las secciones del §2. **Antes de proponer un rango se leen las páginas reales**: el índice dice dónde
empieza la sección, no dónde termina. Cuando hay dos ediciones, se sugiere sobre la más nueva y se
anota. **25 h y 50 h quedan vacíos**: los fabricantes no los definen y el jefe sabe qué lleva cada uno.
**El mecánico no ve nada hasta que el jefe confirme.**

### Preguntas que quedan anotadas para el jefe

En `nota_confirmacion` de cada manual, y en el reporte de la carga:

1. ¿Cuál edición del Tomahawk es la vigente (2000 o 2019)?
2. ¿Cuál service manual del Cherokee es el vigente?
3. ¿Dónde está el manual del Cessna 310?
4. ¿De qué aviones son los manuales sin asignar?

---

## 12. Cuenta de demostraciones

- Las cuatro tablas nuevas entran al esquema `demo`: después de la migración se **regenera** (§39,
  runbook).
- El catálogo de manuales se copia al demo: son documentos **del fabricante**, no datos de CAAA, así
  que el demo usa los mismos archivos del bucket. Las asignaciones se remapean a las aeronaves
  disfrazadas por id (el disfraz cambia nombres, nunca ids).
- Los paquetes sugeridos también: no tienen nada sensible.

---

## 13. Pruebas

**Primero, antes de construir el visor:** que `pdfjs` con peticiones por rango funcione contra una URL
firmada de Supabase (CORS con `Range` permitido y `Content-Range` expuesto). Si no funcionara, cambia
el plan del visor, así que va en la primera tarea.

**De punta a punta contra Supabase real**, con limpieza total al terminar (patrón de siempre):

- El PDF tiene **exactamente** las páginas pedidas y en el orden pedido. El tamaño queda acotado: un
  control de que las anotaciones se quitaron.
- La segunda vez **reutiliza** el archivo (no regenera).
- Orden abierta = paquete confirmado + agregadas. Paquete en borrador = el mecánico no lo ve.
- Al firmar se congela; devolver y volver a firmar **no duplica**; cambiar el paquete después no toca
  la orden firmada.
- Revisión nueva: los extractos siguen en la vieja y aparece el aviso con la cuenta correcta.
- Borrar un manual en uso → 409.
- Permisos:
  - El mecánico no edita paquetes (403).
  - El mecánico no agrega a la orden de otro (403) ni a una firmada.
  - Se comprueba **el mensaje**, no solo el código (§33: dos gates pueden compartir el 403).
- Validaciones: `desde > hasta`, `hasta > paginas`, extracto en paquete y orden a la vez.

**En el navegador:** visor con un manual real (índice, búsqueda, desde/hasta), configurador completo y
el modal de la orden a **375 px**. Contraste medido de verdad (§35).

**En producción:** que los 43 manuales quedaron (conteo y tamaño en `storage.objects` por SQL) y que
un PDF de paquete se genera y se abre.

---

## 14. Riesgos

| | |
|---|---|
| Plan gratuito de Supabase | se detecta al subir; tomos para los dos archivos >50 MB; 63% del GB total |
| Rango + CORS en Supabase | se prueba primero (§13) |
| Memoria en Railway | ~350 MB de pico por armado; cola de uno en uno |
| `pdf-lib` arrastra páginas por los links | quitar `/Annots` y `/Thumb` es obligatorio; la prueba acota el tamaño |
| Manuales escaneados sin texto | la búsqueda no encuentra nada en esos tres; se navega por índice y página |

---

## 15. Fuera de alcance

- Portada o pie en las páginas impresas (decisión de Daniel: tal cual).
- Buscar en todos los manuales a la vez (enfoque C descartado).
- OCR de los manuales escaneados.
- Historial de cambios de un paquete (quién movió qué rango y cuándo).
- Limpieza automática de los PDF recortados viejos.
- Los números de página impresos del manual (`2-15`, fichas `1A11`): se trabaja con la página del PDF
  y el título del extracto dice qué es.
