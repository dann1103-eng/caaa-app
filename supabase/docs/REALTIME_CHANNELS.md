# Realtime · reemplazo de Socket.IO

El backend Node usaba Socket.IO para 5 eventos. En Supabase los reemplazamos así:

| Evento Socket.IO (Node) | Supabase Realtime (Edge) | Cómo lo emite el server |
|---|---|---|
| `vuelo_estado_changed` | `postgres_changes` en `public.vuelo_estado_tiempo` (INSERT) | Automático al insertar la fila |
| `cuenta_alumno_movimiento` | `postgres_changes` en `public.movimiento_cuenta` (INSERT) + broadcast `cuenta:<id_alumno>` | Automático + broadcast desde Edge |
| `estado_operaciones_changed` | `postgres_changes` en `public.estado_operaciones` (UPDATE) | Automático |
| `bloque_iniciado` | broadcast canal `turno` evento `bloque_iniciado` | pg_cron + outbox + edge worker |
| `nuevo_ticker` | broadcast canal `turno` evento `nuevo_ticker` | igual |

## Patrón 1: postgres_changes (cambios en tabla)

**Server (backend Edge):** no hace nada extra. Cuando insertás/actualizás una fila en una tabla con Realtime habilitado, Supabase emite el evento automáticamente.

**Para habilitar la tabla**, en Dashboard de Supabase → Database → Replication, marcar las tablas: `vuelo_estado_tiempo`, `movimiento_cuenta`, `estado_operaciones`, `mensaje_turno`, `notificacion_outbox`.

**Cliente (frontend React) — suscripción:**

```js
// CAA-frontend/src/api/supabase.js (nuevo)
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

```jsx
// En cualquier componente que necesita escuchar:
import { useEffect } from "react";
import { supabase } from "../api/supabase";

useEffect(() => {
  const channel = supabase
    .channel("vuelos-cambios")
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "vuelo_estado_tiempo" },
      (payload) => {
        // payload.new.id_vuelo, payload.new.estado, payload.new.registrado_en
        console.log("Vuelo estado:", payload.new);
        // refresh UI...
      }
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}, []);
```

**Equivalencia Socket.IO antiguo:**
```js
socket.on("vuelo_estado_changed", (data) => { ... });
```
**→ ahora:**
```js
.on("postgres_changes",
    { event: "INSERT", schema: "public", table: "vuelo_estado_tiempo" },
    (payload) => { /* data.new = la fila insertada */ });
```

Toda la información que antes mandabas en el payload (`id_vuelo`, `estado`, `registrado_en`) ahora viene como `payload.new.<columna>`.

## Patrón 2: broadcast (eventos ad-hoc del server)

Para `bloque_iniciado` y `nuevo_ticker`, no hay tabla que cambie. Hay que hacer broadcast manual.

**Server (Edge):** ya implementado en [`_shared/realtime.ts`](../functions/_shared/realtime.ts).

```ts
import { broadcast } from "../_shared/realtime.ts";

await broadcast("turno", "bloque_iniciado", { id_bloque: 5, hora_inicio: "08:00" });
```

**Cliente:**

```js
const channel = supabase
  .channel("turno")
  .on("broadcast", { event: "bloque_iniciado" }, ({ payload }) => {
    console.log("Bloque inició:", payload);
  })
  .on("broadcast", { event: "nuevo_ticker" }, ({ payload }) => {
    console.log("Ticker:", payload);
  })
  .subscribe();
```

## Worker que drena el outbox de pg_cron

`pg_cron` no puede emitir broadcast directamente. Inserta en `notificacion_outbox`. Necesitás una Edge Function adicional que corra periódicamente y drene esa tabla.

Opciones:
1. **Scheduled Edge Function** con `supabase functions deploy outbox-worker --schedule "* * * * *"`. Cada minuto lee `notificacion_outbox WHERE procesado_en IS NULL`, hace `broadcast()`, marca procesado.
2. **Database webhook**: Supabase Pro permite triggers en INSERT que llaman a un endpoint HTTP. Dispara una Edge Function `outbox-process` por cada inserción.

Recomendación: **opción 2** (webhook) — más reactivo, sin polling.

Crear en Dashboard → Database → Webhooks → New webhook:
- Tabla: `notificacion_outbox`
- Eventos: INSERT
- Type: HTTP Request
- URL: `https://<project-ref>.supabase.co/functions/v1/outbox-process`
- HTTP headers: `Authorization: Bearer <SERVICE_ROLE_KEY>`

Edge function `outbox-process`:

```ts
// supabase/functions/outbox-process/index.ts
import { sql } from "../_shared/db.ts";
import { broadcast } from "../_shared/realtime.ts";

Deno.serve(async (req) => {
  const body = await req.json();
  const row = body.record;
  await broadcast(row.canal, row.evento, row.payload);
  await sql`UPDATE public.notificacion_outbox SET procesado_en = NOW() WHERE id = ${row.id}`;
  return new Response("ok");
});
```

## Suscripciones autenticadas

Si las tablas tienen RLS habilitado (que es nuestro caso), el cliente Realtime también respeta RLS. Cuando suscribís, debes pasar el JWT custom:

```js
// Setear el JWT antes de abrir channels
supabase.realtime.setAuth(yourCustomJwt);
```

Esto asegura que un alumno solo recibe eventos de SU `movimiento_cuenta`, no de los demás. ¡Importante!

## Tabla resumen para portar el frontend

| Archivo Node `io.emit(X)` | Frontend antes | Frontend después |
|---|---|---|
| `io.emit("vuelo_estado_changed", payload)` | `socket.on("vuelo_estado_changed", cb)` | `.on("postgres_changes", { event: "INSERT", table: "vuelo_estado_tiempo" }, cb)` |
| `io.emit("cuenta_alumno_movimiento", { id_alumno, saldo })` | `socket.on("cuenta_alumno_movimiento", cb)` | `.on("postgres_changes", { event: "*", table: "movimiento_cuenta" }, cb)` o `.on("broadcast", { event: "movimiento" }, ...)` con canal `cuenta:${id_alumno}` |
| `io.emit("estado_operaciones_changed", payload)` | `socket.on("estado_operaciones_changed", cb)` | `.on("postgres_changes", { event: "UPDATE", table: "estado_operaciones" }, cb)` |
| `io.emit("bloque_iniciado", payload)` | `socket.on("bloque_iniciado", cb)` | `.on("broadcast", { event: "bloque_iniciado" }, cb)` canal `turno` |
| `io.emit("nuevo_ticker", payload)` | `socket.on("nuevo_ticker", cb)` | `.on("broadcast", { event: "nuevo_ticker" }, cb)` canal `turno` |
| `io.emit("nueva_solicitud_cancelacion", payload)` | igual | broadcast canal `cancelaciones` |
| `io.emit("solicitud_cancelacion_resuelta", payload)` | igual | broadcast canal `cancelaciones` |
| `io.emit("solicitud_rechazada", payload)` | igual | broadcast canal `solicitudes` o por alumno |

## Setup mínimo del frontend

1. `npm install @supabase/supabase-js`
2. Crear `src/api/supabase.js` con `createClient`
3. En cada `useEffect` que tenía `socketIO(SOCKET_URL).on(...)`, reemplazar con `supabase.channel(...).on(...)` siguiendo la tabla.
4. En `axiosConfig.js`, tras un login exitoso, llamar `supabase.realtime.setAuth(token)`.

## Limitaciones honestas

- `postgres_changes` tiene un delay de ~100-500ms (vs Socket.IO ~5-30ms). Para CAAA es aceptable.
- Broadcast tiene throughput limitado por plan (Pro: 5M mensajes/mes). Suficiente para esta app.
- Si necesitás presence (saber quién está conectado), Realtime también lo soporta con `track()`. Tu app no lo usa hoy.
