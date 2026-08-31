# La cuenta de demostraciones

Cómo funciona el usuario que ve **datos ficticios** para mostrarle el sistema a
otras escuelas, sin tocar los datos reales de CAAA.

> **No hay proyecto aparte.** Es el mismo despliegue, la misma base y el mismo
> código. La réplica se hace recién cuando una escuela compre (§6).

---

## 1. Cómo se usa

Entrás con **`demo.admin` / `demo123`** y ves un sistema completo con datos
inventados: 20 alumnos, un mes de vuelos cerrados, solicitudes esperando
aprobación y vuelos en curso.

Arriba a la derecha del dashboard de Administración aparece **Reiniciar demo**,
que devuelve todo al punto de partida en unos segundos. Sirve para rehacer una
demostración delante del cliente si alguien se perdió.

Todos los usuarios sembrados usan `demo123`:

| Usuario | Rol |
|---|---|
| `demo.admin` | ADMIN — es el único que ve el botón de reinicio |
| `demo.turno` | TURNO |
| `demo.conta` | ADMINISTRACION |
| `demo.taller` | TALLER |
| `demo.r.flores`, `demo.m.aguilar`, `demo.j.portillo` | instructores |
| `demo.a.zavala`, `demo.g.mena`, … | alumnos |
| `demo.a.reyes` | alumna de sobrecargo (programa de tierra) |

---

## 2. Cómo está aislado

Los datos ficticios viven en un **esquema aparte** de la misma base:
`demo`, con las mismas 87 tablas que `public` pero vacías.

Cuando entra una cuenta de demostración, su conexión a la base apunta a
`demo.*`; la de cualquier otro apunta a `public.*`. **No hay ningún filtro en las
consultas**, porque no hace falta: son objetos distintos.

Esa es la razón de fondo del diseño. La alternativa —una bandera `es_demo` en
cada fila y un filtro en cada consulta— son 87 tablas y unas 600 consultas, y un
solo filtro olvidado le mostraría a un prospecto el saldo real de un alumno.

### Cómo sabe el sistema a qué esquema mandar a cada quien

El login corre **antes** de saber quién es el usuario, así que no puede rutearse
solo. La tabla `public.demo_cuenta` —la única pieza compartida entre los dos
esquemas— dice qué nombres de usuario se autentican contra `demo`. De ahí en
adelante el esquema viaja **firmado dentro del token**, así que nadie se pasa a
demo, ni se sale, tocando la petición.

⚠️ **Por eso todos los usuarios de demostración llevan el prefijo `demo.`** El
ruteo se resuelve por nombre de usuario: si el escenario sembrara un nombre que
ya existe en CAAA —`r.flores`, que es una persona real— ese usuario quedaría
ruteado al esquema demo y perdería el acceso a sus propios datos. El prefijo hace
la colisión imposible.

---

## 3. 🔧 Después de cada migración

**El esquema `demo` no se migra: se REGENERA.** Sus datos son desechables, así
que en vez de aplicarle cada cambio se lo tira y se lo vuelve a clonar desde
`public`, que ya quedó migrado.

```bash
cd legacy/CAA-backend
node -e "require('dotenv').config();const db=require('./config/db');db.poolPublic.query('SELECT public.clonar_demo()').then(r=>{console.log(r.rows[0]);process.exit(0)})"
node -e "require('dotenv').config();require('./demo/catalogo').copiarCatalogo({log:console.log}).then(()=>require('./demo/reset').reiniciar({log:console.log})).then(r=>{console.log(r);process.exit(0)})"
```

El primer comando rehace la estructura; el segundo copia el catálogo y siembra el
escenario. **Mientras tanto la cuenta de demostraciones no funciona**, así que
conviene no hacerlo cinco minutos antes de una reunión.

> Intentar mantener los dos esquemas en paralelo a mano **no es viable**: las
> migraciones nombran `public.` explícitamente casi 100 veces, así que
> re-ejecutarlas no las llevaría a `demo`. Regenerar es más simple y hace que la
> deriva sea imposible por construcción.

---

## 4. Los candados del reinicio

El botón borra datos y corre en el mismo despliegue que producción, así que:

1. **El token tiene que decir `esquema: "demo"`.** Va firmado. Un ADMIN real de
   CAAA recibe **403** aunque llame al endpoint a mano — y el botón ni se le
   dibuja.
2. **Rol ADMIN** dentro de demo.
3. **Hay que escribir** `REINICIAR LA DEMOSTRACION`, no apretar "sí".
4. `demo/reset.js` **nombra el esquema en cada sentencia** y aborta si su
   conexión no está parada en `demo`.

**Qué borra:** alumnos, instructores, vuelos, voucheras, solicitudes y
movimientos — todo dentro de `demo`.
**Qué no toca:** el catálogo de demo (flota, cursos, licencias, bloques, config)
y, por supuesto, **nada de `public`**.

Verificado contra la base real: el admin de CAAA no puede reiniciar, la cuenta de
demo ve 20 alumnos ficticios, el admin real ve los 104 reales, y la intersección
entre las dos listas es vacía.

---

## 5. Cambiar la marca en la demostración

La identidad vive en **`marca.json`**, en la raíz del repo, con dos juegos de
valores y un interruptor:

```json
{ "activa": "caaa", "marcas": { "caaa": { ... }, "molde": { ... } } }
```

Poniendo `"activa": "molde"` toda la app pasa a **TU ESCUELA**, con logos neutros
y otro color. Sirve para mostrarle a un prospecto cómo se vería con lo suyo.

⚠️ **El cambio es global**, no por usuario: afecta también a lo que ve CAAA. Es
para usarlo en una demostración puntual y volverlo atrás, no para dejarlo puesto.

Campos y tamaños de imagen: ver los comentarios dentro de `marca.json` y
`CAA-frontend/scripts/generate-marca.mjs`.

---

## 6. Cuando una escuela compre

Ahí sí se replica el proyecto: fork del repo, su propia Supabase, su Railway, su
Vercel y su DNS. **La marca ya está centralizada**, así que la única diferencia
entre los dos repos es `marca.json` — y la copia se mantiene al día con
`git merge` desde este repo, sin conflictos.

Lo que se genera nuevo y **nunca se copia**: `JWT_SECRET`, `PROYECCION_KEY`, las
llaves `VAPID_*` y la service key de Supabase. Y ningún dato de personas.

```bash
node -e "console.log('JWT_SECRET     =', require('crypto').randomBytes(48).toString('base64url')); console.log('PROYECCION_KEY =', require('crypto').randomBytes(24).toString('hex'))"
```

---

## 7. Si algo falla

| Síntoma | Causa casi segura |
|---|---|
| `demo.admin` entra pero no ve datos | Falta sembrar: correr los comandos de §3 |
| Una consulta falla con "relation does not exist" | El esquema `demo` quedó viejo tras una migración: regenerarlo (§3) |
| Un usuario REAL dejó de ver sus datos | Su nombre entró en `public.demo_cuenta`. Borrar esa fila: `DELETE FROM demo_cuenta WHERE username = '...'` |
| El botón de reinicio no aparece | No estás con una cuenta `demo.` con rol ADMIN |
| El reinicio dice que la conexión no está en `demo` | El pool de demo perdió su `search_path`: reiniciar el backend |

**Diagnóstico rápido de backend**, el de siempre: `curl <url>/api/<ruta>` →
**404** = el código no llegó · **401** = la ruta existe y pide sesión.
