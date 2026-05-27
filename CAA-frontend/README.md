# CAA Frontend — Escuela de Aviación CAAA, S.A. de C.V.

Frontend web para el sistema de gestión de vuelos de la escuela de aviación CAAA. Construido con React 19 + Vite.

---

## Requisitos

- Node.js 18+
- Backend corriendo en `http://localhost:5000` (ver [CAA-backend](../CAA-backend))
- PostgreSQL 17 con la base de datos `CAAA`

---

## Configuración inicial

### 1. Instalar dependencias

```bash
npm install
```

### 2. Crear el archivo de configuración local

Crear el archivo `public/config.js` (está en `.gitignore`, cada dev lo crea localmente):

```js
window.__APP_CONFIG__ = {
  API_URL: "http://localhost:5000"
};
```

> Este archivo le dice al frontend dónde está el backend. Sin él, todas las peticiones fallarán.

### 3. Levantar el servidor de desarrollo

```bash
npm run dev
```

La app corre en `http://localhost:3000`.

---

## Usuarios de prueba

| Usuario | Contraseña | Rol |
|---|---|---|
| `u1` | `demo123` | Admin |
| `u2` | `demo123` | Programación |
| `u4` | `demo123` | Alumno (Carlos Quevedo) |
| `u5` | `demo123` | Alumno (Daniel Aguilar) |
| `u6` | `demo123` | Instructor (Ricardo Henríquez) |
| `u8` | *(contraseña bcrypt)* | Turno |

---

## Stack

| Tecnología | Uso |
|---|---|
| React 19 | UI |
| Vite 7 | Bundler / dev server |
| React Router 7 | Navegación SPA |
| Axios | Peticiones HTTP |
| Socket.IO Client | Actualizaciones en tiempo real |
| pdfmake | Generación de PDFs (reportes de vuelo) |
| jsPDF + html-to-image | PDFs de plan de vuelo / loadsheet |
| Bootstrap 5 + Bootstrap Icons | Estilos base |
| Tailwind CSS | Utilidades CSS adicionales |

---

## Estructura de páginas

| Ruta | Página | Rol requerido |
|---|---|---|
| `/login` | Login | — |
| `/alumno` | Dashboard alumno | ALUMNO |
| `/alumno/agendar` | Agendar vuelo | ALUMNO |
| `/instructor` | Dashboard instructor | INSTRUCTOR |
| `/admin` | Dashboard admin | ADMIN |
| `/admin/auditoria` | Auditoría | ADMIN |
| `/admin/mantenimiento` | Mantenimiento | ADMIN |
| `/programacion` | Dashboard programación | PROGRAMACION |
| `/turno` | Dashboard turno | TURNO |
| `/perfil` | Perfil de usuario | Todos |
| `/` | Página pública (calendario) | — |

---

## Componentes principales

### Nuevos (rama `dani`)

#### `SignaturePad`
Canvas de firma digital reutilizable.
- Dibuja con mouse y touch
- `forwardRef` con métodos: `clear()`, `toDataURL()`, `isEmpty()`
- Prop `disabled` + prop `value` para mostrar firma guardada (base64)
- Usado en ChecklistPostvueloModal y ReporteVueloModal

#### `ChecklistPostvueloModal`
Modal que el instructor debe completar obligatoriamente antes de marcar un vuelo como COMPLETADO.
- 19 ítems boolean de verificación post-vuelo
- Campo de comentarios libre
- Firma digital del piloto
- Validación: todos los ítems deben estar marcados y la firma dibujada
- Al confirmar: guarda el checklist → avanza el vuelo a COMPLETADO

#### `ReporteVueloModal`
Formulario digital dual (alumno + instructor) del reporte de vuelo.
- **Modo alumno**: llena tipo de vuelo, tacómetro, Hobbs, combustible y firma
- **Modo instructor**: revisa los datos y contrafirma
- Generación de PDF con ambas firmas embebidas (via `reporteVueloPdf.js`)
- Estados: `BORRADOR` → `PENDIENTE_INSTRUCTOR` → `COMPLETADO`

### Existentes relevantes

| Componente | Descripción |
|---|---|
| `FlightPrepModal` | Modal de preparación de vuelo (W&B, nav, loadsheet, ops) |
| `PlanVueloModal` | Plan de vuelo digital |
| `LoadsheetModal` | Loadsheet digital |
| `WeightBalanceModal` | Peso y balance |
| `CancelarVueloModal` | Solicitud de cancelación de vuelo |
| `MiHorarioList` | Lista de vuelos del alumno con acciones por estado |
| `AdminCalendar` | Calendario de vuelos para admin |
| `ProgramacionCalendar` | Calendario de programación |
| `MetarWidget` | Widget METAR en tiempo real |
| `EstadoOperacionesWidget` | Estado operacional del aeródromo |

---

## Flujo post-vuelo

```
Instructor avanza vuelo a FINALIZANDO
    → Instructor abre "Completar Vuelo"
    → ChecklistPostvueloModal (19 ítems + firma obligatoria)
    → Vuelo pasa a COMPLETADO

Alumno ve botón "Llenar Reporte de Vuelo" en vuelo COMPLETADO
    → ReporteVueloModal modo alumno
    → Llena tacómetro, Hobbs, combustible, tipo vuelo + firma
    → Estado: PENDIENTE_INSTRUCTOR

Instructor ve sección "Reportes pendientes de firma"
    → ReporteVueloModal modo instructor
    → Revisa datos y firma
    → PDF generado con ambas firmas → Estado: COMPLETADO
```

---

## Base de datos — Tablas nuevas

### `reporte_vuelo`

| Columna | Tipo | Descripción |
|---|---|---|
| `id_reporte` | SERIAL PK | — |
| `id_vuelo` | INTEGER FK UNIQUE | Referencia a `vuelo` (CASCADE) |
| `tipo_vuelo` | VARCHAR(20) | PASAJERO, CARGA, SOLO, DOBLE, FERRY, LOCAL |
| `tacometro_salida` | NUMERIC(10,2) | — |
| `tacometro_llegada` | NUMERIC(10,2) | — |
| `hobbs_salida` | NUMERIC(10,2) | — |
| `hobbs_llegada` | NUMERIC(10,2) | — |
| `combustible_salida` | NUMERIC(10,2) | — |
| `combustible_llegada` | NUMERIC(10,2) | — |
| `cantidad_combustible` | NUMERIC(10,2) | Combustible agregado |
| `firma_alumno` | TEXT | Base64 PNG de firma dibujada |
| `firma_instructor` | TEXT | Base64 PNG de firma dibujada |
| `estado` | VARCHAR(30) | BORRADOR / PENDIENTE_INSTRUCTOR / COMPLETADO |
| `archivo_pdf` | TEXT | Base64 del PDF generado |
| `creado_en` | TIMESTAMP | — |
| `actualizado_en` | TIMESTAMP | — |

### `checklist_postvuelo`

| Columna | Tipo | Descripción |
|---|---|---|
| `id_checklist` | SERIAL PK | — |
| `id_vuelo` | INTEGER FK UNIQUE | Referencia a `vuelo` (CASCADE) |
| `freno_parqueo` | BOOLEAN | Freno de parqueo aplicado |
| `mezcla_corte` | BOOLEAN | Mezcla en corte (Idle Cut-Off) |
| `magnetos_off` | BOOLEAN | Magnetos en OFF |
| `master_switch_off` | BOOLEAN | Master switch OFF |
| `llaves_removidas` | BOOLEAN | Llaves removidas |
| `calzos_colocados` | BOOLEAN | Calzos colocados / amarras |
| `fuselaje_sin_danos` | BOOLEAN | Fuselaje sin daños visibles |
| `bordes_ataque_sin_impactos` | BOOLEAN | Bordes de ataque sin impactos |
| `alerones_libres` | BOOLEAN | Alerones libres y sin holgura |
| `tapas_combustible` | BOOLEAN | Tapas de combustible aseguradas |
| `sin_fugas_combustible` | BOOLEAN | Sin fugas de combustible |
| `llantas_buen_estado` | BOOLEAN | Llantas en buen estado |
| `helice_sin_melladuras` | BOOLEAN | Hélice sin melladuras |
| `aceite_en_rango` | BOOLEAN | Nivel de aceite dentro de rango |
| `cowling_asegurado` | BOOLEAN | Cowling asegurado |
| `switches_breakers_off` | BOOLEAN | Switches y breakers en OFF |
| `horas_registradas` | BOOLEAN | Horas registradas (Hobbs/Tach) |
| `combustible_anotado` | BOOLEAN | Combustible remanente anotado |
| `discrepancias_reportadas` | BOOLEAN | Discrepancias reportadas |
| `comentarios` | TEXT | Observaciones libres |
| `firma_piloto` | TEXT | Base64 PNG de firma |
| `licencia_numero` | VARCHAR(20) | Número de licencia del piloto |
| `creado_en` | TIMESTAMP | — |

---

## Servicios API

### `alumnoApi.js`

| Función | Método | Endpoint |
|---|---|---|
| `getMiHorario(week)` | GET | `/alumno/mi-horario` |
| `getMiInfo()` | GET | `/alumno/mi-info` |
| `getMiLicencia()` | GET | `/alumno/licencia` |
| `cancelarVuelo(id, datos)` | PATCH | `/alumno/vuelos/:id/cancelar` |
| `getReporteVuelo(id)` | GET | `/alumno/vuelos/:id/reporte-vuelo` |
| `guardarReporteVuelo(id, datos)` | PUT | `/alumno/vuelos/:id/reporte-vuelo` |
| `enviarReporteVuelo(id, datos)` | PATCH | `/alumno/vuelos/:id/reporte-vuelo/enviar` |
| `getPlanVuelo(id)` | GET | `/alumno/vuelos/:id/plan-vuelo` |
| `getLoadsheet(id)` | GET | `/alumno/vuelos/:id/loadsheet` |
| `getWB(id)` | GET | `/alumno/vuelos/:id/weight-balance` |

### `instructorApi.js`

| Función | Método | Endpoint |
|---|---|---|
| `getVuelosHoy()` | GET | `/instructor/vuelos-hoy` |
| `getVuelosSemana()` | GET | `/instructor/vuelos-semana` |
| `getMisAlumnos()` | GET | `/instructor/mis-alumnos` |
| `avanzarEstadoVuelo(id, datos)` | POST | `/instructor/vuelos/:id/avanzar` |
| `getChecklistPostvuelo(id)` | GET | `/instructor/vuelos/:id/checklist-postvuelo` |
| `guardarChecklistPostvuelo(id, datos)` | POST | `/instructor/vuelos/:id/checklist-postvuelo` |
| `getReportesPendientes()` | GET | `/instructor/reportes-pendientes` |
| `getReporteVueloInstructor(id)` | GET | `/instructor/vuelos/:id/reporte-vuelo` |
| `firmarReporteVuelo(id, datos)` | PATCH | `/instructor/vuelos/:id/reporte-vuelo/firmar` |

---

## Autenticación

No usa JWT. El frontend guarda el objeto de usuario en `localStorage` bajo la clave `"user"` al hacer login. Cada petición al backend incluye el header `x-user: JSON.stringify(user)`.

```js
// Ejemplo en cualquier servicio
headers: { "x-user": JSON.stringify(JSON.parse(localStorage.getItem("user"))) }
```

---

## Changelog

### Rama `dani` — Abril 2026

#### Nuevas features
- **Checklist Post-Vuelo digital**: formulario de 19 ítems que el instructor completa obligatoriamente antes de poder marcar un vuelo como COMPLETADO
- **Reporte de Vuelo digital**: flujo completo alumno → instructor con generación de PDF con firmas embebidas
- **Firma digital**: componente `SignaturePad` reutilizable con canvas HTML5

#### Correcciones
- Dashboard alumno: la API devuelve `{ semana, vuelos }` — se corrigió para extraer `data.vuelos`
- `MiHorarioList`: `fecha_hora_vuelo` → `fecha_vuelo` en todos los usos
- `public/config.js`: documentado como paso de configuración obligatorio (no está en git)
