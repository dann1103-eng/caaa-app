# Entorno de demo white-label

**Fecha:** 2026-08-31
**Estado:** diseño aprobado
**Origen:** mostrar el sistema a otras escuelas de aviación sin exponer los datos de CAAA.

---

## 1. Qué se busca

Un ambiente para demos comerciales: **totalmente independiente de CAAA**, con marca y datos
propios, que se vea terminado y que se pueda **reiniciar en vivo** delante de un prospecto.

Decisión de Daniel: el demo es un **proyecto duplicado** — repo, base, Railway, Vercel y DNS
aparte. No hay multi-inquilino y no se toca la base de CAAA.

---

## 2. Las cinco decisiones

| # | Decisión | Motivo |
|---|---|---|
| 1 | **Centralizar la marca en CAAA primero**, y recién después clonar | El demo es un fork: si la marca queda en 148 lugares, cada `git merge` futuro choca en 148 puntos y el demo se congela en la versión de hoy |
| 2 | **Escuela ficticia por defecto + un modo "tu marca"** que se activa cambiando un valor | Se puede mostrar la ficticia y, si el cliente pregunta si se puede poner lo suyo, cambiarlo **en vivo delante de él** |
| 3 | Datos: **que se vea poblado**, no un año de historia | Decisión explícita de Daniel. Se asume que la cuenta corriente de un alumno se verá flaca si hurgan |
| 4 | Además de los datos, un **escenario operativo vivo**: solicitudes por aprobar, vuelos en curso a cerrar con su vouchera | Es lo que se demuestra en una reunión, y lo que alguien puede querer ver dos veces |
| 5 | El reinicio es **un botón dentro de la app**, no un script | Se usa en vivo con gente mirando; cambiar a una terminal rompe el momento |

---

## 3. Pieza 1 — Centralizar la marca (CAAA no cambia de aspecto)

**Es la única pieza que toca el sistema en producción.** Se hace y se verifica completa antes de
tocar infraestructura.

### El inventario, medido

| | |
|---|---|
| Texto visible ("CAAA", "CAAA, S.A. de C.V.", "Escuela: CAAA") | **148** apariciones |
| Rutas de imagen y el logo embebido en base64 | **21** |
| La llave de proyección escrita en el código | **4** |
| En comentarios (no se tocan) | 17 |

Concentración: **57 de las 148 están en `utils/pdfGenerator.js`**, y 10 más en `utils/pdfTaller.js`.

### El archivo

`marca.json` en la raíz del repo, con dos juegos de valores y un interruptor:

```json
{
  "activa": "caaa",
  "marcas": {
    "caaa": {
      "nombre": "CAAA",
      "nombre_legal": "CAAA, S.A. de C.V.",
      "nombre_completo": "Centro de Adiestramiento Aéreo Académico",
      "acento_h": 25, "acento_c": 0.205,
      "logo": "logo-caaa.png", "isotipo_navy": "iso-caaa-navy.png",
      "isotipo_blanco": "iso-caaa-white.png", "favicon": "favicon-caaa.png",
      "aeropuerto_base": "MSSS",
      "direccion": "Aeropuerto Internacional de Ilopango, Hangar 38B",
      "codigo_oma": "CO-OMA-CAAA-014"
    },
    "molde": { "nombre": "TU ESCUELA", "...": "..." }
  }
}
```

### Cómo lo leen los dos lados

- **Backend**: `legacy/CAA-backend/utils/marca.js` lo requiere directo.
- **Frontend**: se genera en el **prebuild**, siguiendo el patrón que ya existe —
  `CAA-frontend/scripts/generate-config.mjs` ya hace exactamente esto para la URL del API.

⚠️ Ese mismo prebuild **reescribe `public/config.js` en cada `npm run build`**. Ya mordió durante
la implementación de sobrecargo: se editaba a mano el archivo, se compilaba, y el build lo pisaba.
El generador de marca tiene que ser parte del prebuild, no un archivo editado a mano.

### La llave de proyección

Hoy `caaa_proyeccion_secret_2024` está **escrita en el frontend**. En el clon tiene que ser otra:
una llave copiada es una puerta abierta entre los dos sistemas. Sale a variable de entorno.

### Verificación — la parte que más importa

CAAA tiene que seguir viéndose **exactamente igual**:

1. Capturas de Login, panel de alumno, panel de instructor, Proyección, Administración y Taller,
   **antes y después**, comparadas.
2. **PDFs generados con los mismos datos**, antes y después: vouchera, factura, recibo de nómina,
   orden de trabajo y planilla. Si cambia el layout, el trabajo está mal hecho.
3. Barrido de que no quedó ninguna mención suelta fuera de comentarios.

---

## 4. Pieza 2 — El proyecto de demo

Repo nuevo, Supabase nueva, Railway nuevo, Vercel nuevo. **Cero conexión con producción.**

Lo único que difiere de CAAA es `marca.json` y los datos, así que un `git merge` desde CAAA lo
mantiene al día sin conflictos. Ésa es la razón de ser de la pieza 1.

### El escenario, sembrado relativo a HOY

⚠️ **Fechas relativas, nunca fijas.** Este proyecto ya pagó esa trampa: los vuelos sembrados con
fechas fijas obligaron a crear `reubicar_vuelos_semana_actual.sql` y a re-ejecutarlo sesión tras
sesión (CLAUDE.md §8). El escenario se siembra como "el lunes de esta semana", "hace dos horas",
"dentro de 40 minutos". Se resetea en marzo y funciona igual que en agosto.

Contenido:

- ~20 alumnos con sus programas, instructores y saldos.
- Un mes de vuelos ya cerrados, con sus voucheras y sus cargos a cuenta corriente.
- **Solicitudes de la semana próxima pendientes de aprobar** — para mostrar el flujo de
  programación.
- **Vuelos en curso**, en distintas etapas (salida de hangar, en progreso, por cerrar) — para
  mostrar el ciclo del día y el llenado de la vouchera.
- Algo de contabilidad, inventario de bodega y un par de órdenes de trabajo en el taller.
- Un alumno de un programa de tierra (sobrecargo), que ahora el sistema soporta.

---

## 5. Pieza 3 — El botón de reinicio

Devuelve la base al minuto cero del escenario. Se usa en vivo.

### 🚨 El gate, que es lo más importante de todo el spec

Un endpoint que borra la base entera es **lo más peligroso que tiene este sistema**. Reglas, todas
obligatorias:

1. Solo existe si la variable de entorno `DEMO_MODE` vale exactamente `"true"`. **Esa variable no
   existe ni va a existir en CAAA.**
2. Sin ella, el endpoint **no se registra**: responde 404, no 403. Una ruta que no existe no se
   puede forzar.
3. El botón en el frontend solo se dibuja con la misma condición, y además exige rol ADMIN.
4. El endpoint **verifica el nombre de la base** antes de borrar: si no coincide con el de demo,
   aborta. Es la red por si alguien copia las variables de entorno equivocadas.
5. Pide confirmación escribiendo una palabra, no un "¿estás seguro?" de un clic.

La siembra inicial —la primera vez, cuando se arma el proyecto— es un paso del runbook. De ahí en
adelante, el botón.

---

## 6. Pieza 4 — El runbook

`docs/demo/RUNBOOK.md`, en dos mitades.

**Infraestructura:** crear la Supabase y correr las migraciones en orden · variables de Railway ·
proyecto de Vercel con su Root Directory · DNS · y las llaves que hay que **regenerar, nunca
copiar**: `JWT_SECRET`, `VAPID_*`, la llave de proyección y la service key de Supabase.

**Marca:** el `marca.json`, las 12 imágenes con sus tamaños, y el acento de color.

**Y una lista explícita de lo que NUNCA se copia:** datos de alumnos reales, saldos, documentos
subidos, y cualquier credencial de CAAA.

---

## 7. Verificación

- **Pieza 1:** capturas y PDFs antes/después idénticos (§3).
- **Pieza 2:** el escenario se ve completo en las pantallas principales, sin ninguna vacía.
- **Pieza 3:** el endpoint responde **404** sin `DEMO_MODE`; el botón no se dibuja; con la variable
  puesta, el reinicio devuelve la base al punto de partida y el escenario vuelve a estar completo.
  Y la prueba que no puede faltar: **con las variables de CAAA, el gate del nombre de base aborta.**
- **Pieza 4:** el runbook se sigue de punta a punta al armar el proyecto real. Si un paso no está
  escrito, se escribe ahí mismo.

---

## 8. Fuera de alcance

- **Multi-inquilino de verdad.** Si una escuela compra, se le arma su proyecto con este mismo
  runbook. Un `tenant_id` en todo el esquema es un proyecto aparte y no se hace sin un cliente que
  lo pague.
- **Un año de historia coherente** (decisión 3). Si en una demo se nota que la cuenta corriente
  queda flaca, se profundiza ese módulo puntual.
- **Renombrar la carpeta `CAA-frontend`** ni los nombres de proyecto de Railway y Vercel de CAAA.
