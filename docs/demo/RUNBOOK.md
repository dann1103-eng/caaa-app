# Runbook: armar el entorno de demo

Cómo levantar una copia **independiente** del sistema para mostrárselo a otras
escuelas, sin ninguna conexión con los datos de CAAA.

Sirve igual para **entregarle su instalación a una escuela que compre**: es el
mismo procedimiento, cambiando la marca y sin cargar el escenario de demo.

> **Tiempo estimado:** una hora la primera vez.
> **Lo que hace falta:** cuentas de GitHub, Supabase, Railway y Vercel.

---

## 0. Antes de empezar: lo que NUNCA se copia

| | Por qué |
|---|---|
| Datos de alumnos, saldos, vuelos | Son datos reales de personas. El demo se siembra solo. |
| Documentos subidos (Supabase Storage) | Idem. |
| `JWT_SECRET` de CAAA | Un token del demo abriría sesión en CAAA. |
| `PROYECCION_KEY` de CAAA | El link de proyección del demo entraría a CAAA. |
| Llaves `VAPID_*` | Las notificaciones del demo llegarían a los teléfonos de CAAA. |
| `SUPABASE_SERVICE_KEY` | Acceso total a la base de CAAA. |

**Todas esas se GENERAN nuevas.** Más abajo dice cómo.

---

## 1. El repositorio

El demo es un **fork** del repo de CAAA. La única diferencia entre los dos es
`marca.json` y los datos, así que se mantiene al día con:

```bash
git remote add caaa https://github.com/dann1103-eng/caaa-app.git
git fetch caaa && git merge caaa/master
```

> Eso funciona **porque la marca está centralizada**. Antes de eso, un merge
> chocaba en ~70 lugares. Si algún día alguien vuelve a escribir el nombre de la
> escuela a mano en un archivo, rompe esta propiedad.

---

## 2. La base de datos (Supabase)

1. Crear un proyecto nuevo. Anotar la contraseña de la base.
2. **Usar siempre el pooler de sesión**, no el host directo: el directo es solo
   IPv6 y no funciona ni desde tu máquina ni desde Railway.
   `aws-1-us-east-2.pooler.supabase.com:5432`, usuario `postgres.<ref-del-proyecto>`.
3. Correr las migraciones **en orden alfabético**:

```bash
cd legacy/CAA-backend
for f in ../../supabase/migrations/*.sql; do node run-sql.js "$f"; done
```

4. Sembrar el catálogo: licencias, bloques horarios, cursos y la flota. Los
   archivos de `supabase/migrations/*seeds*` ya traen lo básico; la flota se da
   de alta desde **Aeronaves** en la app, una vez que haya un usuario ADMIN.

### 2.1 🚨 Marcar la base como desechable

**Este paso es el que habilita el botón de reinicio.** Sin él, el botón existe
pero se niega a correr.

```sql
CREATE TABLE IF NOT EXISTS demo_sentinela (
  id            boolean PRIMARY KEY DEFAULT true CHECK (id),
  confirmacion  text NOT NULL,
  creada_en     timestamptz NOT NULL DEFAULT now()
);
INSERT INTO demo_sentinela (confirmacion) VALUES ('ESTA BASE ES DESECHABLE')
  ON CONFLICT (id) DO NOTHING;
```

> **Por qué una tabla y no el nombre de la base:** toda instalación de Supabase
> llama `postgres` a su base, así que comprobar el nombre no distingue nada. El
> centinela es una fila que alguien tuvo que crear a propósito.
>
> **Esta tabla NO va nunca en la base de CAAA.**

---

## 3. El backend (Railway)

Proyecto nuevo, conectado al fork, **Root Directory `legacy/CAA-backend`**.

### Variables

| Variable | Valor |
|---|---|
| `DB_HOST` | el pooler de **tu** Supabase |
| `DB_PORT` | `5432` |
| `DB_USER` | `postgres.<ref-del-proyecto>` |
| `DB_PASSWORD` | la de tu proyecto |
| `DB_NAME` | `postgres` |
| `DB_SSL` | `true` |
| `JWT_SECRET` | **generar nueva** (abajo) |
| `PROYECCION_KEY` | **generar nueva** |
| `ALLOWED_ORIGINS` | la URL de tu Vercel |
| `MAIL_ENABLED` | `false` |
| **`DEMO_MODE`** | **`true`** ← habilita el botón de reinicio |

Para generar las llaves:

```bash
node -e "console.log('JWT_SECRET     =', require('crypto').randomBytes(48).toString('base64url')); console.log('PROYECCION_KEY =', require('crypto').randomBytes(24).toString('hex'))"
```

Y las de push, si se quieren notificaciones:

```bash
cd legacy/CAA-backend && npx web-push generate-vapid-keys
```

⚠️ **`DEMO_MODE` no existe ni debe existir en el proyecto de CAAA.** Es lo único
que hace que las rutas de `/api/demo` se registren.

---

## 4. El frontend (Vercel)

Proyecto nuevo, conectado al fork, **Root Directory `CAA-frontend`**.

| Variable | Valor |
|---|---|
| `VITE_API_URL` | la URL de tu Railway |
| `VITE_PROYECCION_KEY` | **la misma** que pusiste en Railway |

⚠️ Si `VITE_PROYECCION_KEY` no coincide con `PROYECCION_KEY` del backend, la
pantalla de Proyección da 401.

---

## 5. La marca

Todo vive en **`marca.json`**, en la raíz del repo. No se toca código.

```json
{ "activa": "caaa", "marcas": { "caaa": { ... }, "molde": { ... } } }
```

Para el demo se agrega una marca nueva —o se usa `molde`— y se pone su nombre en
`activa`. Campos:

| Campo | Dónde se ve |
|---|---|
| `nombre` | topbar, login, encabezado de todos los PDF |
| `nombre_legal` | facturas, recibos, loadsheet |
| `nombre_completo` | título del navegador, pie del login |
| `acento_h` / `acento_c` | el color de acento de toda la app (OKLCH: matiz y saturación) |
| `logo`, `logo_mark`, `iso_navy`, `iso_blanco`, `favicon`, `login_bg` | nombres de archivo |
| `telefonos`, `correo`, `direccion` | encabezado de los PDF |
| `codigo_oma`, `aeropuerto_base` | formularios del taller, METAR |

### Las imágenes

Van en **dos lugares** (el frontend las sirve, el backend las mete en los PDF):

```
CAA-frontend/public/          logo · logo_mark · iso_navy · iso_blanco · favicon · login_bg
legacy/CAA-backend/assets/    logo · logo_mark · iso_navy
```

| Archivo | Tamaño | Notas |
|---|---|---|
| `logo` | ~720×240 | horizontal, fondo transparente |
| `logo_mark` | 256×256 | cuadrado; **de acá sale el logo de los PDF de pdfmake** |
| `iso_navy` | 256×256 | isotipo oscuro, transparente (fondos claros) |
| `iso_blanco` | 256×256 | isotipo blanco, transparente (topbars navy) |
| `favicon` | 128×128 | con fondo, no transparente |
| `login_bg` | ≥1600×1200 | foto del panel del login |

Y aparte, sin pasar por `marca.json`: `icon-192.png`, `icon-512.png`,
`apple-touch-icon.png` y `manifest.json` (los íconos de la app instalada).

### El modo "tu marca"

Poniendo `"activa": "molde"` la app entera pasa a **TU ESCUELA** con logos
neutros. Sirve para mostrarle a un prospecto, en vivo, cómo se vería con lo suyo:
se cambia el valor, se hace deploy y aparece su nombre.

---

## 6. Cargar el escenario la primera vez

Con la app arriba y un usuario ADMIN creado a mano, desde la máquina:

```bash
cd legacy/CAA-backend && node -e "require('./demo/reset').reiniciar({log:console.log}).then(r=>console.log(r))"
```

De ahí en adelante **no volvés a usar la terminal**: el botón *Reiniciar demo*
del dashboard de Administración hace lo mismo.

---

## 7. El botón de reinicio

En **Administración → Dashboard**, arriba a la derecha. Devuelve la base al punto
de partida en unos segundos: sirve para rehacer una demostración delante del
cliente si alguien se perdió.

**Borra:** alumnos, instructores, vuelos, voucheras, solicitudes, movimientos de
cuenta, y todo lo operativo.
**No toca:** flota, cursos, licencias, bloques horarios, config fiscal,
plantillas de peso y balance, formularios del taller. Eso ES el punto de partida.

### Los cuatro candados

1. `DEMO_MODE=true` en el entorno. Sin eso las rutas **no existen** (404, no 403).
2. El centinela en la base (§2.1).
3. Rol ADMIN.
4. Escribir la frase `ESTA BASE ES DESECHABLE`, no apretar "sí".

Verificado contra la base real de CAAA: con `DEMO_MODE=true` apuntando a
producción —el error que de verdad puede pasar— el reinicio se **frena en el
centinela** y no se mueve una fila.

---

## 8. Qué revisar antes de una demo

- [ ] Entrar con `admin` / `demo123` y ver el dashboard con datos.
- [ ] **Programación**: hay solicitudes de la semana próxima esperando aprobación.
- [ ] **Turno**: hay vuelos de hoy en distintas etapas del día.
- [ ] Cerrar uno y llenar su vouchera: el saldo del alumno baja.
- [ ] **Reiniciar demo** y comprobar que todo vuelve al punto de partida.

Usuarios sembrados, todos con `demo123`: `admin`, `turno`, `conta`, `taller`,
`r.flores` (instructor), y los alumnos por nombre (`a.zavala`, `g.mena`…).

---

## 9. Si algo falla

| Síntoma | Causa casi segura |
|---|---|
| Login da 401 para todos | `JWT_SECRET` cambió después de emitir tokens: cerrar sesión y volver a entrar |
| Todo da 404 | Railway no tomó el Root Directory `legacy/CAA-backend` |
| La pantalla carga pero no hay datos | `VITE_API_URL` mal, o `ALLOWED_ORIGINS` sin la URL de Vercel (CORS) |
| Proyección da 401 | `VITE_PROYECCION_KEY` ≠ `PROYECCION_KEY` |
| El botón de reinicio no aparece | Falta `DEMO_MODE=true`, o falta el centinela, o no sos ADMIN |
| El reinicio dice "no está marcada como desechable" | Falta el paso §2.1 — **o estás apuntando a la base equivocada** |
| Los logos no cargan | Faltan las imágenes en `public/` o en `assets/`, o el nombre no coincide con `marca.json` |

**Diagnóstico rápido de backend**, el mismo que usamos siempre:
`curl <url>/api/<ruta>` → **404** = el código no llegó · **401** = la ruta existe
y pide sesión (está bien).
