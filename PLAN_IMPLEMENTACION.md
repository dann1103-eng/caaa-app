# Plan de Implementación — Módulo Administración / Contabilidad + Aula Virtual

**Proyecto:** CAA (Centro de Adiestramiento Aéreo Académico)
**Rama base:** `dani` (tanto en `CAA-backend` como en `CAA-frontend`)
**Documento dirigido a:** desarrollador que implementará estos cambios en la app original
**Versión:** 1.0
**Fecha:** mayo 2026

---

## Tabla de contenido

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Stack técnico y dependencias](#2-stack-técnico-y-dependencias)
3. [Roles y matriz de permisos](#3-roles-y-matriz-de-permisos)
4. [Fase 0 — Base de datos (5 migraciones)](#4-fase-0--base-de-datos)
5. [Fase 1 — Backend](#5-fase-1--backend)
6. [Fase 2 — Frontend](#6-fase-2--frontend)
7. [Fase 3 — Integraciones cruzadas (modificación de código existente)](#7-fase-3--integraciones-cruzadas)
8. [Fase 4 — Configuración local y arranque](#8-fase-4--configuración-local-y-arranque)
9. [Fase 5 — Verificación end-to-end](#9-fase-5--verificación-end-to-end)
10. [Apéndice A — Inventario completo de archivos](#10-apéndice-a)
11. [Apéndice B — Decisiones y gotchas](#11-apéndice-b)

---

## 1. Resumen ejecutivo

Se agregaron tres áreas funcionales nuevas a la aplicación CAAA:

1. **Módulo Administración / Contabilidad** — gestión financiera de la escuela:
   - Cuenta corriente prepagada por alumno (réplica digital de la hoja azul física)
   - Recibos de pago + Facturas con numeración correlativa única
   - Emisión manual o automática de facturas (al firmar reporte de vuelo)
   - PDF descargable de facturas y recibos
   - Egresos (combustible, mantenimiento, nómina, servicios)
   - Nómina de instructores con tres modalidades de pago: mensual fijo, por hora (vuelo + teoría), mixto
   - Reportes financieros y KPIs
   - Bloqueo de agendamiento por saldo insuficiente

2. **Catálogos de la CAAA 2026:**
   - Tarifario oficial por aeronave con historial por fecha
   - 5 cursos formales (PP, IFR, CPL, MULTI, INST) con componentes prácticos editables
   - 14 documentos requeridos (CAAA + AAC) con alertas de vencimiento
   - 11 médicos autorizados por la AAC

3. **Aula Virtual:**
   - Unidades teóricas por curso (38 unidades seed según licencia OACI)
   - Progreso del alumno por unidad (No iniciada / En progreso / Completada / Reprobada)
   - Evaluaciones (Examen / Quiz / Tarea / Práctica / Final) con notas
   - Vista personal del alumno con barra circular de avance global

**Nuevo rol:** `ADMINISTRACION` (separado de `ADMIN`). `ADMIN` mantiene acceso de **solo lectura** al módulo financiero; `ADMINISTRACION` tiene control completo.

**Decisiones clave tomadas con el cliente:**
- Factura interna en esta fase (sin integración DTE/Hacienda — queda para Fase 12)
- Moneda: USD
- Modelo financiero: **prepago** (alumno deposita, se debita por vuelo)
- Tarifa por hora **según aeronave**, con versionado por fecha
- Bloqueo estricto: si `saldo_actual < costo_estimado_vuelo` → HTTP 403
- Migración de datos: borrón y cuenta nueva con saldo inicial provisional de $10,000 USD por alumno (luego se reconcilia)
- IVA: por defecto NO se aplica (servicios educativos exentos)

---

## 2. Stack técnico y dependencias

### Backend (`CAA-backend`)

Sin cambios de versión en el stack base:

| Paquete | Versión | Uso |
|---|---|---|
| express | ^4.21.2 | Framework HTTP |
| pg | ^8.16.3 | Cliente PostgreSQL |
| jsonwebtoken | ^9.0.3 | JWT auth |
| bcrypt | ^6.0.0 | Hash passwords |
| socket.io | ^4.8.3 | WebSockets (eventos en tiempo real) |
| multer | ^2.0.2 | Upload archivos |
| luxon | ^3.7.2 | Manejo de timezone (America/El_Salvador) |
| helmet | ^8.1.0 | Headers de seguridad |
| express-rate-limit | ^8.4.1 | Rate limit login |

**Dependencia NUEVA agregada:**

```bash
npm install pdfkit
```

`pdfkit` se usa en `utils/pdfGenerator.js` para generar PDFs reales de facturas y recibos.

### Frontend (`CAA-frontend`)

Sin nuevas dependencias. Todo el módulo usa lo que ya estaba:

- React 19, Vite 7, React Router 7
- Axios (con interceptores JWT existentes)
- Bootstrap 5 + Bootstrap Icons
- Sonner para toasts
- Socket.io-client

No se instala Recharts ni Chart.js. Los gráficos se renderizan con `<div>` + CSS (barras horizontales coloreadas) y SVG inline para el círculo de progreso del aula virtual. Esto evita aumentar el bundle.

### PostgreSQL

- Versión: PostgreSQL 17 (o superior)
- Timezone configurado: `America/El_Salvador`
- Base de datos: `CAAA`

---

## 3. Roles y matriz de permisos

| Rol | Módulo Op (existente) | Módulo Administración | Aula Virtual |
|---|---|---|---|
| `ADMIN` | Total | **Solo lectura** (GET en todos los endpoints; sin POST/PUT/PATCH) | Lectura + gestión |
| `ADMINISTRACION` | Sin acceso | **Total** (lectura + escritura) | Lectura + gestión |
| `PROGRAMACION` | Total en agendamiento | Sin acceso | Sin acceso |
| `TURNO` | Total en turno | Sin acceso | Sin acceso |
| `INSTRUCTOR` | Reportes de vuelo, checklist | Solo médicos autorizados | Lectura + gestión |
| `ALUMNO` | Agendar, reportes propios | Su cuenta corriente, su saldo, sus documentos | Su aula virtual personal |

**Implementación del control:** `middlewares/roleMiddleware.js`. Para endpoints lectura del módulo financiero, los routers usan `roleMiddleware(["ADMINISTRACION","ADMIN"])`. Para escritura, solo `roleMiddleware(["ADMINISTRACION"])`.

---

## 4. Fase 0 — Base de datos

> **CRÍTICO:** ejecutar las 5 migraciones **en orden**. Cada una está en `CAA-backend/migrations/`. Toda la fase está bajo `BEGIN; ... COMMIT;` para que un fallo deje la DB intacta.

### 4.1 Migración 001 — Módulo Administración

**Archivo:** `migrations/001_administracion_module.sql`

Crea:
- **Rol `ADMINISTRACION`** — alter del CHECK constraint en `usuario.rol`
- **Tarifas (2 tablas):** `aeronave_tarifa`, `instructor_tarifa` (con historial vía `vigente_desde` / `vigente_hasta`)
- **Cursos (3 tablas):** `curso`, `curso_componente_practico`, `inscripcion_curso`, `inscripcion_curso_avance`
- **Cuenta corriente (2 tablas):** `cuenta_corriente_alumno`, `movimiento_cuenta`
- **Facturación (3 tablas + 2 secuencias):** `recibo_pago`, `factura`, `factura_detalle`, `recibo_correlativo_seq`, `factura_correlativo_seq`
- **Egresos y nómina (4 tablas):** `egreso`, `nomina_periodo`, `nomina_detalle`, `nomina_detalle_vuelo`
- **Documentación (3 tablas):** `documento_requerido_catalogo`, `documento_alumno`, `medico_autorizado`

**Seeds incluidos:**
- 7 tarifas de aeronave 2026 (Cessna 152: $135, Cherokee 180: $200, Cherokee Arrow: $220, Bimotor: $600, BATD II: $90, BATD II Bimotor: $105, Tomahawk: $135)
- 3 tarifas históricas 2025 ($130 Cessna/Tomahawk, $85 BATD II) con `vigente_hasta = '2025-12-31'`
- 5 cursos CAAA (PP, IFR, CPL, MULTI, INST) con sus componentes prácticos exactos
- 14 documentos del catálogo CAAA + AAC con flags `aplica_a_menores` y `aplica_a_extranjeros`
- 11 médicos autorizados AAC (cardiólogos, otorrinos, oftalmólogos)
- Saldo provisional de $10,000 USD para todos los alumnos existentes (con movimiento `AJUSTE_HABER` justificado)
- Usuario seed `u_admin_fin` con rol `ADMINISTRACION` (detecta dinámicamente columnas NOT NULL extra del schema y las completa con valores razonables — esto evita errores en esquemas diferentes)

**Cómo ejecutar:**
```bash
PGPASSWORD=tu_password psql -h localhost -p 5432 -U postgres -d CAAA \
  -f CAA-backend/migrations/001_administracion_module.sql
```

**Verificación post-migración:**
```sql
SELECT COUNT(*) FROM curso;                            -- 5
SELECT COUNT(*) FROM aeronave_tarifa;                  -- 10 (7 vigentes + 3 históricas)
SELECT COUNT(*) FROM medico_autorizado;                -- 11
SELECT COUNT(*) FROM documento_requerido_catalogo;     -- 14
SELECT COUNT(*) FROM cuenta_corriente_alumno;          -- == número de alumnos existentes
```

### 4.2 Migración 002 — Columnas estilo hoja azul

**Archivo:** `migrations/002_movimiento_columnas_hoja_azul.sql`

Agrega a `movimiento_cuenta`:
- `instructor_nombre VARCHAR(120)` — nombre del instructor del vuelo
- `avion_codigo VARCHAR(40)` — matrícula (YS-334PE, etc.)
- `horas_vuelo NUMERIC(5,2)` — H.V. del día
- `horas_totales NUMERIC(7,2)` — H.T. acumuladas
- `editado_en TIMESTAMP NULL` — bandera de auditoría
- `editado_por INTEGER NULL`
- `motivo_edicion TEXT NULL`

Ejecuta también un `UPDATE` best-effort que pobla `instructor_nombre` y `avion_codigo` para movimientos existentes vinculados a vuelos.

### 4.3 Migración 003 — Nómina dual de pago

**Archivo:** `migrations/003_nomina_dual_pago.sql`

Agrega a `instructor_tarifa`:
- `tipo_pago VARCHAR(20)` CHECK ('MENSUAL_FIJO','POR_HORA','MIXTO'), default 'POR_HORA'
- `salario_mensual_fijo NUMERIC(10,2)` default 0
- `tarifa_hora_vuelo NUMERIC(10,2)` default 0
- `tarifa_hora_teoria NUMERIC(10,2)` default 0

Agrega a `nomina_detalle`:
- `tipo_pago VARCHAR(20)`
- `horas_teoricas NUMERIC(7,2)`, `tarifa_hora_teoria NUMERIC(10,2)`, `monto_teorico NUMERIC(12,2)`
- `monto_vuelo NUMERIC(12,2)`
- `salario_mensual NUMERIC(12,2)`
- `observaciones TEXT`

Migra datos legacy: si `tarifa_hora_usd > 0`, copia su valor a `tarifa_hora_vuelo`.

### 4.4 Migración 004 — Aula Virtual

**Archivo:** `migrations/004_aula_virtual.sql`

Crea 4 tablas:
- `unidad_teorica` — catálogo de unidades por curso (id_curso, numero, nombre, descripcion, horas_estimadas, orden, recursos_url)
- `progreso_unidad_alumno` — estado por alumno+unidad con UNIQUE constraint
- `evaluacion` — definiciones de evaluaciones (EXAMEN, QUIZ, TAREA, PRACTICA, FINAL) con `puntos_max`, `nota_aprobacion`
- `evaluacion_alumno` — resultado individual con UNIQUE en (id_evaluacion, id_alumno)

**Seeds incluidos: 38 unidades** distribuidas:
- PP: 10 unidades (estándar OACI)
- IFR: 8 unidades
- CPL: 8 unidades
- MULTI: 4 unidades
- INST: 8 unidades

### 4.5 Migración 005 — Historial demo (opcional)

**Archivo:** `migrations/005_seed_historial_cuentas.sql`

Pobla movimientos realistas para los 3 alumnos seed (u4, u5, u7) replicando el patrón de la hoja azul física. **No ejecutar en producción** — solo para staging/demo.

---

## 5. Fase 1 — Backend

### 5.1 Modificación de archivos existentes

#### `middlewares/roleMiddleware.js`
Agregar `ADMINISTRACION` al array `VALID_ROLES`. Exportar el array como propiedad.

```js
const VALID_ROLES = ['ADMIN','PROGRAMACION','TURNO','ALUMNO','INSTRUCTOR','ADMINISTRACION'];
// ... resto del middleware igual
module.exports.VALID_ROLES = VALID_ROLES;
```

#### `server.js`
Solo agregar registro de las nuevas rutas:

```js
// imports cerca del top
const administracionRoutes = require("./routes/administracionRoutes");

// app.use cerca del final
app.use("/api/administracion", administracionRoutes);
```

**Patch defensivo del cron de auto-reanudación** — si tu DB no tiene la columna `estado_operaciones.bloques_suspendidos`, agregar antes del `setInterval` un `checkAutoReanudacionEnabled()` que detecta la columna una sola vez al arrancar. Si no existe, deshabilita el cron y emite un warning. Esto evita logs spam y posibles caídas del proceso.

#### `controllers/agendarController.js`
Agregar al inicio: `const { verificarSaldoSuficiente } = require("../utils/saldoHelper");`

Dentro de `exports.guardarSolicitud`, justo después de obtener `id_alumno` (línea ~141), agregar bloque try/catch con `verificarSaldoSuficiente(id_alumno, vuelos)`. Si retorna `ok: false`, devolver HTTP 403 con `{ message, saldo_insuficiente: true, saldo, costo_estimado }`. El try/catch es defensivo: si el módulo Administración no está instalado, no debe bloquear el agendamiento.

#### `controllers/instructor/instructorReporteController.js`
En `exports.firmarReporteVuelo`, dentro de la transacción, después de `UPDATE vuelo SET estado = 'COMPLETADO'` y antes del `COMMIT`, agregar:

1. Si `!esInasistencia`, requerir `facturasController.emitirFacturaVueloDentroTx`:
   - Calcular `tacDiff = tacometro_llegada - tacometro_salida`
   - Buscar info del vuelo (id_alumno, id_aeronave, fecha, modelo aeronave)
   - Llamar `emitirFacturaVueloDentroTx(client, {...})` que genera la factura, debita la cuenta y registra el movimiento estilo hoja azul
2. Envolver en try/catch — si falla, loguear warning pero no abortar el cierre del vuelo

Después del COMMIT, si se generó cargo: `io.emit("cuenta_alumno_movimiento", { id_alumno, saldo })`.

#### `routes/alumnoRoutes.js`
Agregar al final de la sección dashboard:

```js
const alumnoCuenta = require("../controllers/alumno/alumnoCuentaController");
const aulaCtl = require("../controllers/administracion/aulaVirtualController");

router.get("/mi-cuenta",           alumnoAccess, alumnoCuenta.miCuenta);
router.get("/mi-cuenta/extracto",  alumnoAccess, alumnoCuenta.miExtracto);
router.get("/mi-avance-curso",     alumnoAccess, alumnoCuenta.miAvanceCurso);
router.get("/mis-documentos",      alumnoAccess, alumnoCuenta.misDocumentos);
router.get("/mi-aula-virtual",     alumnoAccess, aulaCtl.miAulaVirtual);
```

### 5.2 Archivos NUEVOS — backend

Crear estructura de carpetas:

```
CAA-backend/
├── controllers/
│   ├── administracion/         ← NUEVA carpeta
│   │   ├── tarifasController.js
│   │   ├── cursosController.js
│   │   ├── cuentaController.js
│   │   ├── recibosController.js
│   │   ├── facturasController.js
│   │   ├── egresosController.js
│   │   ├── nominaController.js
│   │   ├── documentosController.js
│   │   ├── medicosController.js
│   │   ├── reportesController.js
│   │   └── aulaVirtualController.js
│   └── alumno/
│       └── alumnoCuentaController.js    ← NUEVO
├── routes/
│   └── administracionRoutes.js          ← NUEVO
├── utils/
│   ├── saldoHelper.js                   ← NUEVO
│   └── pdfGenerator.js                  ← NUEVO (requiere pdfkit)
└── migrations/                          ← NUEVA carpeta
    ├── 001_administracion_module.sql
    ├── 002_movimiento_columnas_hoja_azul.sql
    ├── 003_nomina_dual_pago.sql
    ├── 004_aula_virtual.sql
    └── 005_seed_historial_cuentas.sql   (opcional)
```

#### `controllers/administracion/tarifasController.js`

Exporta:
- `listAeronaveTarifas` — GET, tarifas vigentes
- `historialAeronave` — GET histórico por modelo
- `upsertAeronaveTarifa` — PUT, cierra la anterior (`vigente_hasta = nueva - 1 día`) e inserta la nueva
- `listInstructorTarifas` — GET con campos tipo_pago, salario, tarifa_hora_vuelo, tarifa_hora_teoria
- `listInstructoresDisponibles` — GET para selector del frontend
- `upsertInstructorTarifa` — PUT con validación de tipo_pago (MENSUAL_FIJO / POR_HORA / MIXTO)

#### `controllers/administracion/cursosController.js`

Exporta `list`, `create`, `update`, `listInscripciones`, `crearInscripcion`, `finalizarInscripcion`. La función `update` debe soportar reemplazo completo de `componentes[]` (DELETE + INSERT dentro de transacción).

#### `controllers/administracion/cuentaController.js`

Exporta:
- `listAlumnosConSaldo`
- `getCuenta(id_alumno)`
- `getExtracto(id_alumno)` — ORDER BY fecha ASC (estilo hoja azul cronológico)
- `ajuste` — POST simple AJUSTE_DEBE / AJUSTE_HABER
- `cargoManual` — POST estilo hoja azul completo (fecha, instructor, factura_no, avion, h_v, h_t, debe O haber, descripcion). Valida que solo venga DEBE o HABER, no ambos.
- `editarMovimiento` — PATCH cualquier campo de un movimiento. Si cambia el monto, recalcula saldos en cascada de los movimientos posteriores y el saldo actual del alumno (con `SUM(monto_usd)` para garantizar consistencia). Exige `motivo_edicion` mínimo 3 caracteres.
- `anularMovimiento` — PATCH crea movimiento `ANULACION` con monto opuesto, marca `anulado = TRUE`.

#### `controllers/administracion/recibosController.js`

Exporta `list`, `create`, `anular`, `pdf`. `create` ejecuta dentro de transacción:
1. Genera `nextval('recibo_correlativo_seq')`
2. INSERT en `recibo_pago`
3. Bloquea (`FOR UPDATE`) y actualiza `cuenta_corriente_alumno.saldo_actual_usd += monto`
4. INSERT en `movimiento_cuenta` tipo `DEPOSITO`
5. Emit Socket.IO `cuenta_alumno_movimiento`

`pdf` retorna PDF binario usando `generarReciboPDF` de `utils/pdfGenerator.js`.

#### `controllers/administracion/facturasController.js`

Exporta:
- `emitirFacturaVueloDentroTx(client, params)` — **helper interno**, recibe el cliente PG dentro de una transacción ya abierta. Lo usa `instructorReporteController` al firmar reporte final. Genera factura, factura_detalle, debita cuenta, crea movimiento_cuenta `CARGO_VUELO`, actualiza avance del curso.
- `emitirManual` — POST endpoint para emisión manual desde Administración. Recibe `id_alumno`, `concepto`, `lineas[]`, `iva_usd`. Calcula totales, genera correlativo, transacción completa.
- `list`, `anular`, `pdf` (PDF real usando `generarFacturaPDF`)

#### `controllers/administracion/egresosController.js`

CRUD simple. Sin transacciones complejas.

#### `controllers/administracion/nominaController.js`

Exporta:
- `listPeriodos`, `detallesPeriodo`
- `calcular(periodo_inicio, periodo_fin)` — **lógica dual**:
  - Para cada instructor con tarifa vigente al final del periodo, ramificar según `tipo_pago`:
    - **MENSUAL_FIJO**: `subtotal = salario_mensual_fijo`. Horas voladas se importan como referencia pero no afectan el monto.
    - **POR_HORA**: `subtotal = horas_vuelo × tarifa_hora_vuelo + horas_teoricas × tarifa_hora_teoria`. Horas teóricas inician en 0, se editan manualmente luego.
    - **MIXTO**: `subtotal = salario + montos por hora`
  - Las horas voladas se calculan de `SUM(reporte_vuelo.tacometro_llegada - tacometro_salida)` para vuelos COMPLETADOS en el periodo.
  - Si la tarifa vuelo > 0 y hay horas, también poblar `nomina_detalle_vuelo` para trazabilidad por vuelo.
- `editarDetalle(idDet)` — PATCH cualquier componente. Verifica que el periodo no esté PAGADA. Recalcula `monto_vuelo`, `monto_teorico`, `subtotal`, `total = subtotal + bonos - descuentos`.
- `aprobar`, `pagar` (al pagar, crea egreso categoría NOMINA con el total)

#### `controllers/administracion/documentosController.js`

`catalogo`, `documentosAlumno`, `subirDocumento` (con Multer), `revisar`, `alertasVencimiento` (vencimientos próximos a 60 días).

#### `controllers/administracion/medicosController.js`

CRUD simple. El endpoint GET es accesible para todos los roles autenticados (no solo admin).

#### `controllers/administracion/reportesController.js`

KPIs agregados: `ingresos` (por mes), `egresos` (por categoría), `pyl`, `morosos`, `kpisDashboard` (resumen mes actual).

#### `controllers/administracion/aulaVirtualController.js`

Tres áreas funcionales en un solo archivo:
- **Unidades:** `listUnidades`, `crearUnidad`, `actualizarUnidad`, `eliminarUnidad` (soft delete con `activo = FALSE`)
- **Progreso:** `progresoAlumno`, `actualizarProgreso` (INSERT ON CONFLICT DO UPDATE, idempotente)
- **Evaluaciones:** `listEvaluaciones`, `crearEvaluacion` (con flag `inscribir_alumnos` que inscribe automáticamente a todos los alumnos activos del curso con estado PENDIENTE), `listEvaluacionAlumnos`, `registrarNota`
- **Personal:** `miAulaVirtual` — devuelve cursos + unidades + evaluaciones del alumno autenticado, todo en un solo paquete

#### `controllers/alumno/alumnoCuentaController.js`

Funciones que resuelven `id_alumno` desde `req.user.id_usuario`, luego retornan datos filtrados solo del propio alumno:
- `miCuenta`, `miExtracto`, `miAvanceCurso`, `misDocumentos`

#### `utils/saldoHelper.js`

Tres funciones:
- `getSaldoAlumno(id_alumno, client?)` — retorna saldo, `null` si la tabla no existe (modo defensivo)
- `estimarCostoVuelos(vuelos, fecha, client?)` — calcula costo estimado sumando duración × tarifa de cada aeronave
- `verificarSaldoSuficiente(id_alumno, vuelos, client?)` — retorna `{ ok, saldo, costo_estimado, mensaje }`. Si la tabla `cuenta_corriente_alumno` no existe, retorna `ok: true, saldo: null` para no bloquear.

#### `utils/pdfGenerator.js`

Usa `pdfkit`. Dos funciones públicas:
- `generarFacturaPDF({ factura, detalle, alumno })` — retorna stream pipeable a `res`. Plantilla CAAA con header azul institucional, número correlativo grande, datos del cliente, tabla de detalle con filas alternadas, totales, caja verde con TOTAL, sello "ANULADA" rojo si aplica.
- `generarReciboPDF({ recibo, alumno })` — plantilla CAAA con caja verde del monto, método y referencia.

Helpers internos: `drawHeader`, `drawFooter`.

### 5.3 `routes/administracionRoutes.js`

Estructura del router:

```js
const READ_ROLES  = ["ADMINISTRACION", "ADMIN"];
const WRITE_ROLES = ["ADMINISTRACION"];
const AULA_READ   = ["ADMINISTRACION", "ADMIN", "INSTRUCTOR"];
const AULA_WRITE  = ["ADMINISTRACION", "ADMIN", "INSTRUCTOR"];

router.use(authMiddleware);

// Tarifas
router.get   ("/tarifas/aeronaves",                   roleMiddleware(READ_ROLES),  tarifas.listAeronaveTarifas);
router.get   ("/tarifas/aeronaves/historial",         roleMiddleware(READ_ROLES),  tarifas.historialAeronave);
router.put   ("/tarifas/aeronaves",                   roleMiddleware(WRITE_ROLES), tarifas.upsertAeronaveTarifa);
router.get   ("/tarifas/instructores",                roleMiddleware(READ_ROLES),  tarifas.listInstructorTarifas);
router.get   ("/tarifas/instructores/disponibles",    roleMiddleware(READ_ROLES),  tarifas.listInstructoresDisponibles);
router.put   ("/tarifas/instructores",                roleMiddleware(WRITE_ROLES), tarifas.upsertInstructorTarifa);

// Cursos
router.get   ("/cursos",                              roleMiddleware(READ_ROLES),  cursos.list);
router.post  ("/cursos",                              roleMiddleware(WRITE_ROLES), cursos.create);
router.patch ("/cursos/:id",                          roleMiddleware(WRITE_ROLES), cursos.update);
router.get   ("/inscripciones",                       roleMiddleware(READ_ROLES),  cursos.listInscripciones);
router.post  ("/inscripciones",                       roleMiddleware(WRITE_ROLES), cursos.crearInscripcion);
router.patch ("/inscripciones/:id/finalizar",         roleMiddleware(WRITE_ROLES), cursos.finalizarInscripcion);

// Cuenta corriente
router.get   ("/cuentas",                             roleMiddleware(READ_ROLES),  cuenta.listAlumnosConSaldo);
router.get   ("/cuenta/:id_alumno",                   roleMiddleware(READ_ROLES),  cuenta.getCuenta);
router.get   ("/cuenta/:id_alumno/extracto",          roleMiddleware(READ_ROLES),  cuenta.getExtracto);
router.post  ("/cuenta/:id_alumno/ajuste",            roleMiddleware(WRITE_ROLES), cuenta.ajuste);
router.post  ("/cuenta/:id_alumno/cargo-manual",      roleMiddleware(WRITE_ROLES), cuenta.cargoManual);
router.patch ("/movimientos/:id",                     roleMiddleware(WRITE_ROLES), cuenta.editarMovimiento);
router.patch ("/movimientos/:id/anular",              roleMiddleware(WRITE_ROLES), cuenta.anularMovimiento);

// Recibos
router.get   ("/recibos",                             roleMiddleware(READ_ROLES),  recibos.list);
router.post  ("/recibos",                             roleMiddleware(WRITE_ROLES), recibos.create);
router.get   ("/recibos/:id/pdf",                     roleMiddleware(READ_ROLES),  recibos.pdf);
router.patch ("/recibos/:id/anular",                  roleMiddleware(WRITE_ROLES), recibos.anular);

// Facturas
router.get   ("/facturas",                            roleMiddleware(READ_ROLES),  facturas.list);
router.post  ("/facturas",                            roleMiddleware(WRITE_ROLES), facturas.emitirManual);
router.get   ("/facturas/:id/pdf",                    roleMiddleware(READ_ROLES),  facturas.pdf);
router.patch ("/facturas/:id/anular",                 roleMiddleware(WRITE_ROLES), facturas.anular);

// Egresos
router.get   ("/egresos",                             roleMiddleware(READ_ROLES),  egresos.list);
router.post  ("/egresos",                             roleMiddleware(WRITE_ROLES), egresos.create);
router.patch ("/egresos/:id",                         roleMiddleware(WRITE_ROLES), egresos.update);

// Nómina
router.get   ("/nomina/periodos",                     roleMiddleware(READ_ROLES),  nomina.listPeriodos);
router.get   ("/nomina/periodos/:id/detalles",        roleMiddleware(READ_ROLES),  nomina.detallesPeriodo);
router.post  ("/nomina/calcular",                     roleMiddleware(WRITE_ROLES), nomina.calcular);
router.patch ("/nomina/detalles/:idDet",              roleMiddleware(WRITE_ROLES), nomina.editarDetalle);
router.patch ("/nomina/:id/aprobar",                  roleMiddleware(WRITE_ROLES), nomina.aprobar);
router.patch ("/nomina/:id/pagar",                    roleMiddleware(WRITE_ROLES), nomina.pagar);

// Documentación
router.get   ("/documentos/catalogo",                 roleMiddleware(READ_ROLES),  documentos.catalogo);
router.get   ("/documentos/alumno/:id_alumno",        roleMiddleware(READ_ROLES),  documentos.documentosAlumno);
router.post  ("/documentos/alumno/:id_alumno",        roleMiddleware(WRITE_ROLES), upload.single("archivo"), documentos.subirDocumento);
router.patch ("/documentos/:id",                      roleMiddleware(WRITE_ROLES), documentos.revisar);
router.get   ("/documentos/alertas",                  roleMiddleware(READ_ROLES),  documentos.alertasVencimiento);

// Médicos (lectura amplia)
router.get   ("/medicos",                             roleMiddleware(["ADMINISTRACION","ADMIN","ALUMNO","INSTRUCTOR","PROGRAMACION","TURNO"]), medicos.list);
router.post  ("/medicos",                             roleMiddleware(WRITE_ROLES), medicos.create);
router.patch ("/medicos/:id",                         roleMiddleware(WRITE_ROLES), medicos.update);

// Aula Virtual (Admin/Instructor)
router.get   ("/aula/unidades",                       roleMiddleware(AULA_READ),   aula.listUnidades);
router.post  ("/aula/unidades",                       roleMiddleware(AULA_WRITE),  aula.crearUnidad);
router.patch ("/aula/unidades/:id",                   roleMiddleware(AULA_WRITE),  aula.actualizarUnidad);
router.delete("/aula/unidades/:id",                   roleMiddleware(AULA_WRITE),  aula.eliminarUnidad);
router.get   ("/aula/alumnos/:id_alumno/progreso",    roleMiddleware(AULA_READ),   aula.progresoAlumno);
router.post  ("/aula/progreso",                       roleMiddleware(AULA_WRITE),  aula.actualizarProgreso);
router.get   ("/aula/evaluaciones",                                roleMiddleware(AULA_READ),  aula.listEvaluaciones);
router.post  ("/aula/evaluaciones",                                roleMiddleware(AULA_WRITE), aula.crearEvaluacion);
router.get   ("/aula/evaluaciones/:id_evaluacion/alumnos",         roleMiddleware(AULA_READ),  aula.listEvaluacionAlumnos);
router.patch ("/aula/evaluacion-alumno/:id",                       roleMiddleware(AULA_WRITE), aula.registrarNota);

// Reportes
router.get   ("/reportes/ingresos",                   roleMiddleware(READ_ROLES),  reportes.ingresos);
router.get   ("/reportes/egresos",                    roleMiddleware(READ_ROLES),  reportes.egresos);
router.get   ("/reportes/pyl",                        roleMiddleware(READ_ROLES),  reportes.pyl);
router.get   ("/reportes/morosos",                    roleMiddleware(READ_ROLES),  reportes.morosos);
router.get   ("/reportes/kpis-dashboard",             roleMiddleware(READ_ROLES),  reportes.kpisDashboard);
```

Multer config: directorio `uploads/documentos/` con storage on-disk, límite 20MB.

### 5.4 Patrones a seguir en backend

- **Transacciones explícitas:** todos los flujos que afectan saldo usan `BEGIN/COMMIT/ROLLBACK` con `client.query` (no `db.query`).
- **`FOR UPDATE`** al leer `cuenta_corriente_alumno` para evitar race conditions cuando dos cargos concurrentes afectan el mismo alumno.
- **Secuencias correlativas:** `nextval('factura_correlativo_seq')` y `nextval('recibo_correlativo_seq')` para garantizar unicidad sin huecos.
- **Inmutabilidad:** anulaciones NUNCA hacen DELETE. Insertan un movimiento opuesto con tipo `ANULACION` y marcan el original con `anulado = TRUE`.
- **Auditoría:** edición de movimientos guarda `editado_en`, `editado_por`, `motivo_edicion`.
- **Socket.IO:** evento `cuenta_alumno_movimiento` con `{ id_alumno, saldo }` se emite tras cada movimiento que afecte el saldo.

---

## 6. Fase 2 — Frontend

### 6.1 Configuración Vite

**`vite.config.js`** — agregar bloque `server` para forzar puerto 3000:

```js
export default defineConfig({
  plugins: [react()],
  base: "/",
  server: {
    port: 3000,
    host: true,
    strictPort: false
  }
});
```

### 6.2 Modificación de archivos existentes — frontend

#### `src/App.jsx`

Agregar imports al inicio:

```jsx
import AulaVirtual from "./pages/Alumno/AulaVirtual";

import AdministracionLayout from "./components/AdministracionLayout/AdministracionLayout";
import ProtectedAdministracion from "./components/routes/ProtectedAdministracion";
import AdmDashboard      from "./pages/Administracion/Dashboard";
import AdmCuentas        from "./pages/Administracion/Cuentas";
import AdmCuentaDetalle  from "./pages/Administracion/CuentaDetalle";
import AdmRecibos        from "./pages/Administracion/Recibos";
import AdmFacturas       from "./pages/Administracion/Facturas";
import AdmTarifas        from "./pages/Administracion/Tarifas";
import AdmCursos         from "./pages/Administracion/Cursos";
import AdmEgresos        from "./pages/Administracion/Egresos";
import AdmNomina         from "./pages/Administracion/Nomina";
import AdmDocumentacion  from "./pages/Administracion/Documentacion";
import AdmMedicos        from "./pages/Administracion/Medicos";
import AdmReportes       from "./pages/Administracion/Reportes";
import AdmAulaVirtual    from "./pages/Administracion/AulaVirtual";
```

Agregar rutas dentro del `<Routes>`:

```jsx
{/* Aula Virtual del alumno */}
<Route path="/alumno/aula-virtual" element={
  <ProtectedAlumno><AulaVirtual /></ProtectedAlumno>
} />

{/* Módulo Administración */}
<Route path="/administracion" element={<Navigate to="/administracion/dashboard" replace />} />
<Route path="/administracion/dashboard"     element={<ProtectedAdministracion><AdministracionLayout><AdmDashboard /></AdministracionLayout></ProtectedAdministracion>} />
<Route path="/administracion/cuentas"       element={<ProtectedAdministracion><AdministracionLayout><AdmCuentas /></AdministracionLayout></ProtectedAdministracion>} />
<Route path="/administracion/cuentas/:id"   element={<ProtectedAdministracion><AdministracionLayout><AdmCuentaDetalle /></AdministracionLayout></ProtectedAdministracion>} />
{/* ... resto de rutas idénticas para recibos, facturas, tarifas, cursos, egresos, nomina, documentacion, medicos, aula-virtual, reportes */}
```

#### `src/pages/Login/Login.jsx`

En el `handleSubmit`, agregar redirección por rol `ADMINISTRACION`:

```jsx
if (user.rol === "ALUMNO") navigate("/alumno/dashboard");
else if (user.rol === "PROGRAMACION") navigate("/programacion/dashboard");
else if (user.rol === "ADMIN") navigate("/admin/dashboard");
else if (user.rol === "TURNO") navigate("/turno");
else if (user.rol === "INSTRUCTOR") navigate("/instructor");
else if (user.rol === "ADMINISTRACION") navigate("/administracion/dashboard");  // NUEVO
```

#### `src/services/alumnoApi.js`

Agregar al final:

```js
export const getMiCuenta       = async () => (await axios.get(`${API_URL}/alumno/mi-cuenta`)).data;
export const getMiExtracto     = async () => (await axios.get(`${API_URL}/alumno/mi-cuenta/extracto`)).data;
export const getMiAvanceCurso  = async () => (await axios.get(`${API_URL}/alumno/mi-avance-curso`)).data;
export const getMisDocumentos  = async () => (await axios.get(`${API_URL}/alumno/mis-documentos`)).data;
export const getMiAulaVirtual  = async () => (await axios.get(`${API_URL}/alumno/mi-aula-virtual`)).data;
```

### 6.3 Archivos NUEVOS — frontend

Estructura:

```
CAA-frontend/
├── public/
│   └── config.js                            ← NUEVO (config runtime)
├── src/
│   ├── api/  (existente — no se toca)
│   ├── components/
│   │   ├── AdministracionLayout/            ← NUEVA
│   │   │   ├── AdministracionLayout.jsx
│   │   │   └── AdministracionLayout.css
│   │   ├── AdministracionSidebar/           ← NUEVA
│   │   │   ├── AdministracionSidebar.jsx
│   │   │   └── AdministracionSidebar.css
│   │   ├── SaldoBadge/                      ← NUEVA
│   │   │   └── SaldoBadge.jsx
│   │   ├── MovimientoCuentaTable/           ← NUEVA
│   │   │   └── MovimientoCuentaTable.jsx
│   │   ├── AvanceCursoCard/                 ← NUEVA
│   │   │   └── AvanceCursoCard.jsx
│   │   └── routes/
│   │       └── ProtectedAdministracion.jsx  ← NUEVO
│   ├── pages/
│   │   ├── Administracion/                  ← NUEVA carpeta (13 archivos)
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Cuentas.jsx
│   │   │   ├── CuentaDetalle.jsx
│   │   │   ├── Recibos.jsx
│   │   │   ├── Facturas.jsx
│   │   │   ├── Tarifas.jsx
│   │   │   ├── Cursos.jsx
│   │   │   ├── Egresos.jsx
│   │   │   ├── Nomina.jsx
│   │   │   ├── Documentacion.jsx
│   │   │   ├── Medicos.jsx
│   │   │   ├── Reportes.jsx
│   │   │   └── AulaVirtual.jsx
│   │   └── Alumno/
│   │       ├── AulaVirtual.jsx              ← NUEVO
│   │       └── AulaVirtual.css              ← NUEVO
│   └── services/
│       └── administracionApi.js             ← NUEVO
```

### 6.4 Convenciones de UI

- **Layout verde diferenciado:** `AdministracionLayout` usa gradiente verde (`#0f5132` → `#157347`) en topbar para diferenciar del Admin operativo (azul `#1B365D`).
- **Sidebar propio:** clase prefijo `.adf-` (admin financiero) en lugar de `.adm-` (admin operativo).
- **CSS variables y patrones:** todas las clases prefijo `adf-` en `AdministracionLayout.css` (kpi-card, table, btn, form-field, tag, card, section-title). Tonos verdes para acciones positivas, rojos para negativas/cargos.
- **Iconos:** Bootstrap Icons (ya disponibles).
- **Mock data fallback:** **TODAS** las páginas tienen un constante `MOCK` con datos demo realistas. En el `useEffect` de carga, si la llamada al backend falla, se usa el mock y se muestra un tag amber "Datos demo" para indicar el modo. Esto permite revisar la UI antes de tener backend + DB operativos.

### 6.5 `src/services/administracionApi.js`

Estructura por dominio (50+ funciones). Patrón:

```js
import axios from "axios";
import { API_URL } from "../api/axiosConfig";
const BASE = `${API_URL}/administracion`;

// Tarifas
export const getAeronaveTarifas       = async () => (await axios.get(`${BASE}/tarifas/aeronaves`)).data;
export const upsertAeronaveTarifa     = async (payload) => (await axios.put(`${BASE}/tarifas/aeronaves`, payload)).data;
export const getInstructorTarifas     = async () => (await axios.get(`${BASE}/tarifas/instructores`)).data;
export const getInstructoresDisponibles = async () => (await axios.get(`${BASE}/tarifas/instructores/disponibles`)).data;
export const upsertInstructorTarifa   = async (payload) => (await axios.put(`${BASE}/tarifas/instructores`, payload)).data;

// ... (cuenta, recibos, facturas, egresos, nomina, documentos, medicos, aula, reportes)

// Helper especial para PDF descargable con JWT
export const descargarPdfFactura = async (id, filename) => {
  const res = await axios.get(`${BASE}/facturas/${id}/pdf`, { responseType: "blob" });
  const blob = new Blob([res.data], { type: "application/pdf" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => window.URL.revokeObjectURL(url), 5000);
};
// Análogo: descargarPdfRecibo
```

El helper de descarga PDF es necesario porque no se puede usar `<a download>` directo: el endpoint requiere el header Authorization que axios inyecta automáticamente.

### 6.6 Páginas — comportamiento clave

#### `pages/Administracion/Dashboard.jsx`
- 6 KPIs: ingresos mes, egresos mes, margen, saldo total alumnos, alumnos con saldo bajo, facturas emitidas mes
- Lista de alumnos morosos (link a su cuenta)
- Tablas de referencia: tarifas vigentes 2026, costos de cursos

#### `pages/Administracion/CuentaDetalle.jsx`
- Caja superior con saldo + 3 botones: "Registrar HABER (Depósito)", "Registrar DEBE (Cargo manual)", "Imprimir"
- **Cargo manual** abre formulario hoja azul completo: FECHA, INSTRUCTOR, FACTURA NO., AVION, H.V., H.T., DEBE, HABER, descripción. Bloquea DEBE si se llena HABER y viceversa.
- **Editar movimiento** abre formulario con todos los campos hoja azul + campo obligatorio "MOTIVO DE EDICIÓN" (auditoría)
- **Anular** pregunta motivo y crea movimiento `ANULACION` opuesto
- Tabla `MovimientoCuentaTable` ordenada cronológica ascendente

#### `pages/Administracion/Facturas.jsx`
- Botón "Emitir nueva factura" verde arriba a la derecha
- Formulario con: selector de alumno (carga desde endpoint real), concepto general, fecha emisión, **tabla dinámica de líneas** (cada línea: descripción, dropdown de aeronave que auto-rellena tarifa, horas, tarifa/h, subtotal), botón agregar/eliminar línea, IVA opcional, total consolidado
- Al emitir, automáticamente descarga el PDF
- Botón "PDF" en cada fila descarga el PDF real

#### `pages/Administracion/Tarifas.jsx`
- Pestañas: Aeronaves / Instructores
- Tab Aeronaves: lista + "Nueva tarifa" + "Cambiar tarifa" por fila (al cambiar, la anterior se cierra automáticamente con `vigente_hasta`)
- Tab Instructores: **selector de tipo de pago** (MENSUAL_FIJO / POR_HORA / MIXTO). Los campos se muestran/ocultan según la selección. Tags coloreados en la tabla.

#### `pages/Administracion/Nomina.jsx`
- Lista de periodos con estado (BORRADOR / APROBADA / PAGADA)
- "Calcular nuevo periodo" con fecha inicio/fin → crea periodo BORRADOR con cálculos automáticos
- Click "Ver detalle" muestra tabla con columnas: Instructor, Modalidad, Mensual, H. Vuelo, $/h V., H. Teoría, $/h T., Bonos, Descuentos, TOTAL
- Click ✏️ en una fila abre modal con campos condicionales según modalidad. Total en vivo mientras tipeas.
- Resumen por modalidad al final
- Aprobar / Marcar pagada (botones por estado)

#### `pages/Administracion/Cursos.jsx`
- Tarjetas por curso con código, total, costos fijos, componentes prácticos
- Botón "Nuevo curso" arriba; "Editar curso" en cada tarjeta
- Formulario: código (no editable en edit), nombre, descripción, gastos administrativos, costo teórico, horas teóricas; **tabla de componentes prácticos editable** (agregar/eliminar líneas)
- Total recalculado automáticamente con botón ⟳

#### `pages/Administracion/AulaVirtual.jsx`
- Selector de curso + 3 tabs: Unidades / Evaluaciones / Progreso por alumno
- Tab Unidades: CRUD con número, nombre, descripción, horas estimadas, orden, URL recursos
- Tab Evaluaciones: crear (inscribe automáticamente a todos los alumnos activos), calificar inline (tipear nota en input + cambiar estado dropdown)
- Tab Progreso: selector de alumno → cambiar estado de cada unidad con dropdown

#### `pages/Alumno/AulaVirtual.jsx`
- Header con curso activo + barra circular SVG con % global
- 4 KPIs: unidades completadas, promedio general, evaluaciones pendientes, en curso ahora
- Tab "Unidades teóricas": cards con borde de color según estado, barra de progreso
- Tab "Evaluaciones y notas": pendientes arriba (cards amber) + calificadas abajo (cards verde/rojo según aprobada)

### 6.7 Componentes reutilizables

#### `SaldoBadge.jsx`
Chip de saldo con color automático según monto: rojo (≤0), naranja (<200), amarillo (<1000), verde (≥1000). Icono según rango. Tres tamaños: `sm`, `md` (default), `lg`.

#### `MovimientoCuentaTable.jsx`
Tabla con 9 columnas exactas de la hoja azul: FECHA, INSTRUCTOR, FACTURA NO., AVION, H.V., H.T., DEBE, HABER, SALDO. Fuente monoespaciada (Courier New / Consolas) para alinear números. Filas alternadas con tinte sutil. Marca movimientos editados con icono lápiz amber. Props: `movimientos`, `onEditar`, `onAnular`, `showActions`.

#### `AvanceCursoCard.jsx`
Tarjeta con código de curso, nombre, lista de componentes con barra de progreso (horas acumuladas / horas requeridas), inversión total estimada.

---

## 7. Fase 3 — Integraciones cruzadas

Modificaciones a código existente para conectar el módulo nuevo con la operación.

### 7.1 Cargo automático al firmar reporte de vuelo

**Archivo:** `controllers/instructor/instructorReporteController.js`
**Función:** `exports.firmarReporteVuelo`

Después de `UPDATE vuelo SET estado = 'COMPLETADO'`, dentro de la transacción:

```js
let cargoAutomatico = null;
if (!esInasistencia) {
  try {
    const { emitirFacturaVueloDentroTx } = require("../administracion/facturasController");
    const tacDiff = parseFloat(tacometro_llegada) - parseFloat(tacometro_salida);
    const vueloInfo = await client.query(`
      SELECT v.id_vuelo, v.id_alumno, v.id_aeronave, v.fecha,
             COALESCE(a.modelo, a.tipo, 'Cessna 152') AS modelo_aeronave
      FROM vuelo v
      LEFT JOIN aeronave a ON a.id_aeronave = v.id_aeronave
      WHERE v.id_vuelo = $1
    `, [id]);
    if (vueloInfo.rows.length > 0 && vueloInfo.rows[0].id_alumno) {
      cargoAutomatico = await emitirFacturaVueloDentroTx(client, {
        id_vuelo, id_alumno: vueloInfo.rows[0].id_alumno,
        id_aeronave: vueloInfo.rows[0].id_aeronave,
        tacometro: tacDiff,
        modelo_aeronave: vueloInfo.rows[0].modelo_aeronave,
        fecha: vueloInfo.rows[0].fecha,
        emitida_por: req.user.id_usuario
      });
    }
  } catch (eFin) {
    console.warn("[admin] cargo automático falló:", eFin.message);
    // NO abortar el cierre del vuelo
  }
}
```

Después del COMMIT, emitir `cuenta_alumno_movimiento` por Socket.IO si hubo cargo.

### 7.2 Bloqueo de agendamiento por saldo

**Archivo:** `controllers/agendarController.js`
**Función:** `exports.guardarSolicitud`

Después de obtener `id_alumno`, antes de la lógica de apertura:

```js
try {
  const chk = await verificarSaldoSuficiente(id_alumno, vuelos);
  if (!chk.ok) {
    return res.status(403).json({
      message: chk.mensaje,
      saldo_insuficiente: true,
      saldo: chk.saldo,
      costo_estimado: chk.costo_estimado
    });
  }
} catch (e) {
  console.warn("[saldo] verificación falló:", e.message);
  // No abortar agendamiento por error en verificación
}
```

### 7.3 Egreso automático al completar mantenimiento

**Pendiente de implementar.** En `controllers/admin/adminMantenimientoController.js`, al completar un mantenimiento, INSERTAR en `egreso` categoría `MANTENIMIENTO` con el costo. Ver migración 001 — la tabla `egreso` ya tiene FK `id_mantenimiento` para esta trazabilidad.

---

## 8. Fase 4 — Configuración local y arranque

### 8.1 Backend `.env`

Archivo `CAA-backend/.env` (no commitear). Plantilla:

```
PORT=5000
NODE_ENV=development

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=<tu_password>
DB_NAME=CAAA
DB_SSL=false

# JWT
JWT_SECRET=<cambiar_en_produccion>
JWT_EXPIRES_IN=8h

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# Email (deshabilitado en dev)
MAIL_ENABLED=false
MAIL_HOST=
MAIL_PORT=587
MAIL_USER=
MAIL_PASSWORD=
MAIL_FROM=no-reply@caaa-sv.com

# Módulo Administración
SALDO_FACTOR_BLOQUEO=1.0
```

### 8.2 Frontend `public/config.js`

Archivo en `CAA-frontend/public/config.js` (es leído al cargar la SPA):

```js
window.__APP_CONFIG__ = {
  API_URL: "http://localhost:5000",
  LOADSHEET_URL: "http://localhost:5174"
};
```

### 8.3 Pasos de arranque

```bash
# 1) Instalar dependencias
cd CAA-backend
npm install

cd ../CAA-frontend
npm install

# 2) Ejecutar migraciones en orden
cd ../CAA-backend
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d CAAA -f migrations/001_administracion_module.sql
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d CAAA -f migrations/002_movimiento_columnas_hoja_azul.sql
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d CAAA -f migrations/003_nomina_dual_pago.sql
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d CAAA -f migrations/004_aula_virtual.sql
# Solo para staging/demo:
PGPASSWORD=postgres psql -h localhost -p 5432 -U postgres -d CAAA -f migrations/005_seed_historial_cuentas.sql

# 3) Arrancar backend
node server.js
# Debería imprimir: "Servidor corriendo en puerto 5000" y "Hora BD: ..."

# 4) Arrancar frontend (en otra terminal)
cd ../CAA-frontend
npm run dev
# Debería abrir Vite en http://localhost:3000
```

### 8.4 Configurar password real del usuario seed

La migración 001 crea `u_admin_fin` con un hash bcrypt placeholder. Para que el login funcione, generar un hash real:

```bash
cd CAA-backend
node -e "console.log(require('bcrypt').hashSync('tu_password_real', 10))"
# Copiar el output y ejecutar en psql:
# UPDATE usuario SET password_hash = '<el_hash>' WHERE username = 'u_admin_fin';
```

---

## 9. Fase 5 — Verificación end-to-end

### 9.1 Verificación DB

```sql
-- Estructura
\d aeronave_tarifa
\d cuenta_corriente_alumno
\d movimiento_cuenta
\d evaluacion

-- Conteos
SELECT 'cursos' AS t, COUNT(*) FROM curso UNION ALL
SELECT 'aeronave_tarifa', COUNT(*) FROM aeronave_tarifa UNION ALL
SELECT 'unidades', COUNT(*) FROM unidad_teorica UNION ALL
SELECT 'medicos', COUNT(*) FROM medico_autorizado;
```

### 9.2 Verificación Backend (curl)

```bash
# Health
curl http://localhost:5000/api/health
# {"ok":true,"db_time":"..."}

# Endpoints protegidos (deben dar 401 sin token)
curl -o /dev/null -w "%{http_code}\n" http://localhost:5000/api/administracion/cuentas        # 401
curl -o /dev/null -w "%{http_code}\n" http://localhost:5000/api/administracion/aula/unidades  # 401

# Con token JWT válido
TOKEN=$(node -e "require('dotenv').config(); console.log(require('jsonwebtoken').sign({id_usuario:999, username:'admin', rol:'ADMINISTRACION'}, process.env.JWT_SECRET, {expiresIn:'1h'}))")
curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/administracion/cuentas
```

### 9.3 Verificación Frontend

Casos de uso a validar manualmente:

**Como `ADMINISTRACION`:**
- [ ] Login redirige a `/administracion/dashboard`
- [ ] Sidebar muestra los 11 ítems del módulo
- [ ] Navegar a Cuentas → click un alumno → ver extracto formato hoja azul
- [ ] Registrar depósito (HABER) → saldo aumenta, recibo PDF descargable
- [ ] Registrar cargo manual (DEBE) → saldo disminuye, aparece en extracto
- [ ] Editar un movimiento con motivo → saldos posteriores se recalculan en cascada
- [ ] Anular un movimiento → línea tachada, movimiento `ANULACION` opuesto agregado
- [ ] Emitir factura manual → genera PDF descargable automáticamente
- [ ] Crear tarifa nueva de aeronave → la anterior queda con `vigente_hasta`
- [ ] Configurar instructor MENSUAL_FIJO + POR_HORA + MIXTO → guardar cada modalidad
- [ ] Calcular nómina → ver detalle dual, editar bonos/descuentos, aprobar, pagar (crea egreso)
- [ ] Crear curso nuevo con componentes prácticos → recalcular total
- [ ] Crear evaluación → todos los alumnos activos quedan PENDIENTE
- [ ] Calificar inline → estado pasa a CALIFICADA

**Como `ALUMNO`:**
- [ ] Login redirige al dashboard del alumno
- [ ] Navegar a `/alumno/aula-virtual` → ver curso, barra circular de progreso, KPIs
- [ ] Tab Unidades → cards con estado de cada unidad
- [ ] Tab Evaluaciones → pendientes arriba + notas obtenidas abajo

**Como `ADMIN`:**
- [ ] Acceso al módulo financiero solo en GET (no debería poder hacer POST)

**Pruebas de integración:**
- [ ] Firmar reporte de vuelo → automáticamente se genera factura + se debita saldo del alumno
- [ ] Alumno con saldo bajo intenta agendar vuelo → HTTP 403 con mensaje claro

---

## 10. Apéndice A — Inventario completo de archivos

### Archivos NUEVOS (43 archivos)

**Backend (16):**
```
CAA-backend/migrations/001_administracion_module.sql
CAA-backend/migrations/002_movimiento_columnas_hoja_azul.sql
CAA-backend/migrations/003_nomina_dual_pago.sql
CAA-backend/migrations/004_aula_virtual.sql
CAA-backend/migrations/005_seed_historial_cuentas.sql   (opcional)
CAA-backend/controllers/administracion/tarifasController.js
CAA-backend/controllers/administracion/cursosController.js
CAA-backend/controllers/administracion/cuentaController.js
CAA-backend/controllers/administracion/recibosController.js
CAA-backend/controllers/administracion/facturasController.js
CAA-backend/controllers/administracion/egresosController.js
CAA-backend/controllers/administracion/nominaController.js
CAA-backend/controllers/administracion/documentosController.js
CAA-backend/controllers/administracion/medicosController.js
CAA-backend/controllers/administracion/reportesController.js
CAA-backend/controllers/administracion/aulaVirtualController.js
CAA-backend/controllers/alumno/alumnoCuentaController.js
CAA-backend/routes/administracionRoutes.js
CAA-backend/utils/saldoHelper.js
CAA-backend/utils/pdfGenerator.js
```

**Frontend (27):**
```
CAA-frontend/public/config.js
CAA-frontend/src/components/AdministracionLayout/AdministracionLayout.jsx
CAA-frontend/src/components/AdministracionLayout/AdministracionLayout.css
CAA-frontend/src/components/AdministracionSidebar/AdministracionSidebar.jsx
CAA-frontend/src/components/AdministracionSidebar/AdministracionSidebar.css
CAA-frontend/src/components/SaldoBadge/SaldoBadge.jsx
CAA-frontend/src/components/MovimientoCuentaTable/MovimientoCuentaTable.jsx
CAA-frontend/src/components/AvanceCursoCard/AvanceCursoCard.jsx
CAA-frontend/src/components/routes/ProtectedAdministracion.jsx
CAA-frontend/src/services/administracionApi.js
CAA-frontend/src/pages/Alumno/AulaVirtual.jsx
CAA-frontend/src/pages/Alumno/AulaVirtual.css
CAA-frontend/src/pages/Administracion/Dashboard.jsx
CAA-frontend/src/pages/Administracion/Cuentas.jsx
CAA-frontend/src/pages/Administracion/CuentaDetalle.jsx
CAA-frontend/src/pages/Administracion/Recibos.jsx
CAA-frontend/src/pages/Administracion/Facturas.jsx
CAA-frontend/src/pages/Administracion/Tarifas.jsx
CAA-frontend/src/pages/Administracion/Cursos.jsx
CAA-frontend/src/pages/Administracion/Egresos.jsx
CAA-frontend/src/pages/Administracion/Nomina.jsx
CAA-frontend/src/pages/Administracion/Documentacion.jsx
CAA-frontend/src/pages/Administracion/Medicos.jsx
CAA-frontend/src/pages/Administracion/Reportes.jsx
CAA-frontend/src/pages/Administracion/AulaVirtual.jsx
```

### Archivos MODIFICADOS (7)

**Backend (4):**
- `CAA-backend/middlewares/roleMiddleware.js` — agregar `ADMINISTRACION` a `VALID_ROLES`
- `CAA-backend/server.js` — registrar `/api/administracion` y patch defensivo del cron
- `CAA-backend/controllers/agendarController.js` — bloqueo por saldo
- `CAA-backend/controllers/instructor/instructorReporteController.js` — cargo automático al firmar
- `CAA-backend/routes/alumnoRoutes.js` — endpoints `/mi-cuenta/*`, `/mi-aula-virtual`
- `CAA-backend/package.json` — agregar `pdfkit` a dependencies

**Frontend (3):**
- `CAA-frontend/src/App.jsx` — registrar rutas nuevas
- `CAA-frontend/src/pages/Login/Login.jsx` — redirect para `ADMINISTRACION`
- `CAA-frontend/src/services/alumnoApi.js` — extender con funciones de cuenta y aula
- `CAA-frontend/vite.config.js` — forzar puerto 3000

---

## 11. Apéndice B — Decisiones y gotchas

### 11.1 Por qué no Recharts/Chart.js

Para no inflar el bundle de producción, los gráficos se renderizan con `<div>` + CSS para barras horizontales y SVG inline para el círculo de progreso del aula virtual. El cliente puede agregar Recharts después si necesita visualizaciones complejas.

### 11.2 Numeración correlativa sin huecos

Las facturas y recibos usan secuencias PostgreSQL (`nextval()`). En Hacienda El Salvador, el correlativo no puede tener huecos. Si se anula una factura, no se reutiliza su número — se marca `estado = 'ANULADA'`. Esto cumple con la práctica fiscal estándar.

### 11.3 Concurrencia en cargos

Cuando dos instructores firman reportes simultáneamente del mismo alumno, hay race condition sobre `saldo_actual_usd`. Solución implementada: `SELECT * FROM cuenta_corriente_alumno WHERE id_alumno = $1 FOR UPDATE` antes de leer el saldo. Esto bloquea la fila hasta el COMMIT, garantizando consistencia.

### 11.4 Recalculo de saldos en cascada

Cuando Administración edita un movimiento histórico (ej. cambiar un cargo de $130 a $135), todos los movimientos posteriores tienen su `saldo_resultante_usd` desactualizado. La función `editarMovimiento` aplica:

```sql
UPDATE movimiento_cuenta
SET saldo_resultante_usd = saldo_resultante_usd + $diff
WHERE id_alumno = $id AND (fecha > $fecha OR (fecha = $fecha AND id >= $id_mov))
```

Y luego recalcula `cuenta_corriente_alumno.saldo_actual_usd = SUM(monto_usd)` para garantizar el saldo final correcto.

### 11.5 PDFs y autenticación

`<a download="...">` no inyecta headers de Authorization. Por eso el frontend usa axios con `responseType: "blob"`, crea un Blob, genera un object URL y dispara un `<a>` temporal con `download`. El PDF llega autenticado.

### 11.6 Mock data fallback

Cada página tiene una constante `MOCK_*` con datos demo. Si el backend está caído o responde error, la página renderea con esos datos y muestra una etiqueta amber "Datos demo". Esto permite hacer demos visuales sin tener DB conectada, y evita que la UI se rompa por un endpoint que falle.

### 11.7 Migración de datos productivos

La migración 001 inserta un movimiento `AJUSTE_HABER` de $10,000 para cada alumno existente. Esto NO refleja el saldo real — es un placeholder. Cuando la escuela proporcione los saldos reales (PDF o Excel), el equipo deberá:

1. Por cada alumno, registrar un `AJUSTE_DEBE` o `AJUSTE_HABER` que lleve el saldo a su valor real.
2. Documentar el motivo: "Reconciliación con saldo histórico al DD/MM/YYYY".

### 11.8 Tarifa histórica vs vigente

Cuando un alumno vuela en 2025, el cargo automático debe usar la tarifa $130 (histórica). Cuando vuela en 2026, $135 (vigente). La función `emitirFacturaVueloDentroTx` busca:

```sql
SELECT tarifa_hora_usd FROM aeronave_tarifa
WHERE modelo_aeronave = $1
  AND vigente_desde <= $2::date
  AND (vigente_hasta IS NULL OR vigente_hasta >= $2::date)
ORDER BY vigente_desde DESC LIMIT 1
```

donde `$2` es la fecha del vuelo (no la fecha actual). Esto garantiza histórico correcto.

### 11.9 Eventos Socket.IO

El evento `cuenta_alumno_movimiento` se emite con payload `{ id_alumno, saldo }` tras cada operación que afecte la cuenta corriente. El frontend del alumno escucha este evento para refrescar su vista en tiempo real (pendiente implementar el listener en `pages/Alumno/Dashboard.jsx`).

### 11.10 Issues pre-existentes que no se tocaron

Al implementar este módulo, se detectaron mismatches entre el esquema esperado por el código existente y el esquema real de algunas bases de datos:

- `controllers/admin/adminVueloController` (cron en server.js:161) busca `estado_operaciones.bloques_suspendidos` que puede no existir. Patch defensivo agregado: `checkAutoReanudacionEnabled` deshabilita el cron si la columna falta.
- `controllers/authController.js:21` busca `alumno.seguro_vida` que puede no existir. **No fixeado** — si la DB del cliente tiene esta columna, no hay problema; si no, el login fallará. El equipo debe revisar y ajustar la query si es necesario.

### 11.11 Integración DTE (Hacienda El Salvador) — futuro

Las facturas generadas actualmente son **internas** (sin valor fiscal). Para convertirlas en CCF/DTE oficial:

1. Agregar campos a `factura`: `dte_uuid`, `dte_sello_recepcion`, `dte_estado_hacienda`, `dte_xml_path`.
2. Crear servicio `services/dteService.js` que firme el JSON v3 con el certificado de Hacienda y lo envíe a la API oficial.
3. En `emitirFacturaVueloDentroTx`, después del INSERT, llamar `dteService.transmitir(factura)` y guardar el UUID retornado.
4. Manejar reintentos y estado pendiente si Hacienda no responde.

Esta integración tiene 10-15 días-persona de esfuerzo adicional.

---

## Resumen final

**Esfuerzo total estimado para replicar (un developer mid-senior):**

| Fase | Días |
|---|---|
| Fase 0 — DB | 1 |
| Fase 1 — Backend controllers/routes | 6-8 |
| Fase 2 — Frontend componentes y páginas | 8-10 |
| Fase 3 — Integraciones cruzadas | 2 |
| Fase 4 — Config local | 0.5 |
| Fase 5 — QA y ajustes | 2-3 |
| **Total** | **~20-25 días** |

Si el developer tiene acceso a este repo de referencia, el tiempo se reduce a **10-12 días** porque puede copiar archivos directamente y solo adaptar la integración.

**Orden recomendado de implementación:**

1. Migraciones 001, 002, 003, 004 en DB de staging
2. Verificar que el backend existente aún arranca con las nuevas tablas (sin tocar código todavía)
3. Crear los 11 controllers + 1 routes + 2 utils + agregar pdfkit
4. Modificar `roleMiddleware`, `server.js`, `agendarController`, `instructorReporteController`, `alumnoRoutes`
5. Probar backend con curl + JWT
6. Crear los 27 archivos frontend
7. Modificar `App.jsx`, `Login.jsx`, `alumnoApi.js`, `vite.config.js`
8. Demo completo con DB de staging
9. Migrar a producción con plan de rollback (las migraciones son aditivas, no destructivas)
10. Reconciliar saldos provisionales con datos reales

---

**Documento generado:** mayo 2026
**Autor original:** equipo desarrollo CAAA (rama `dani`)
**Para soporte:** contactar al equipo que implementó esta versión.
