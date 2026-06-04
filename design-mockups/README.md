# CAAA — Rediseño visual (entrega de capturas)

Rediseño visual integral del frontend CAAA. Carril **aviónica de precisión**, sistema **white-label** (cada academia cambia logo + un color de acento), **navy primario + rojo acento**. Solo cambios visuales: ninguna lógica, ruta ni comportamiento se modificó.

## Cómo ver la galería

Abre **`final/index.html`** en el navegador: galería de las 34 capturas organizadas por rol, con datos reales.

## Estructura

- **`final/`** — capturas finales por rol (la entrega):
  - `00-publico/` — Login
  - `alumno/` — dashboard, agendar, aula virtual, loadsheet, perfil
  - `instructor/` — dashboard, aula virtual
  - `programacion/` — dashboard, agendar
  - `turno/` — dashboard operativo
  - `admin-sistema/` — dashboard/calendario, mantenimiento (+ modal), alumnos, perfiles, auditoría, cancelaciones
  - `administracion/` — dashboard, cuentas, cuenta-detalle (+ modal abono), ficha de alumno, usuarios (+ modal), contabilidad (ingresos/egresos/nómina/tarifas), cursos, documentación, médicos, aula virtual, reportes
  - `index.html` — galería navegable
- **`base/`, `base-shell/`, `review/`** — capturas intermedias del proceso (iteración).
- Imágenes sueltas `01-login.png`, `02-admin-modal.png`, `03-operaciones-dark.png` — mockups de dirección iniciales (concepto aviónica aprobado).

## Qué cambió, en resumen

- **Identidad:** paleta OKLCH navy + rojo (del logo CAAA) + verde éxito, en `tokens.css` (fuente única, temeable por academia con una variable). Retirados Exo 2 y Outfit → **Inter** (UI) + **JetBrains Mono** (datos: matrículas, horas, montos, fechas, correlativos).
- **Shell:** Header, Footer, layouts y sidebars (Admin y Administración) reconstruidos; **nav activa marcada con indicador rojo**.
- **Botones:** primario **navy**; destructivo **rojo en contorno**; positivo **verde** (aprobar/pagar/completar). Acento rojo escaso (≤10%): activo, "en vivo", alertas.
- **Limpieza:** eliminados side-stripes de color en cards, gradientes en headers, glassmorphism y emojis decorativos (→ Bootstrap Icons). Tablas con `tabular-nums`, sin zebra, hairlines.
- **Excluido a propósito:** la pantalla de **Operaciones/Proyección en modo oscuro** se dejó como estaba.

## Notas técnicas (andamiaje DEV-only)

Para capturar con datos reales sin CORS se usó un proxy de Vite (`vite.config.js`) hacia el backend de Railway y scripts de Playwright (`capture.mjs`, `capture-all.mjs`, `gen-index.mjs`). `public/config.js` quedó apuntando a la URL de producción tras el build. Antes de fusionar a master conviene revisar/quitar el proxy dev de `vite.config.js` (no afecta producción, pero es andamiaje).

El contexto de diseño vive en `PRODUCT.md` y `DESIGN.md` (raíz del repo).
