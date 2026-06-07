# Design

> Carril: **aviónica de precisión** (ForeFlight / Garmin / Jeppesen × admin fintech).
> Sistema **white-label**: cada academia cambia su logo + un color de acento. CAAA = rojo.
> Fuente única de verdad en código: `CAA-frontend/src/styles/tokens.css`.

## Theme

**Light por default** para todo el trabajo denso (Administración, Admin, Alumno, Instructor, Login).
**Dark solo para la sala de operaciones / proyección** (tablero tipo MFD, legible a distancia).

**Escena física:** contadora frente a un monitor de 24" en oficina con luz natural lateral; alumno en celular bajo sol fuerte en el estacionamiento del aeropuerto; instructor con iPad en hangar de luz mixta → **light gana**. La excepción es la pantalla de operaciones en una TV/proyector de la sala de turno en penumbra → **dark gana**.

> **Alcance:** la pantalla de **Operaciones/Proyección en modo oscuro NO se rediseña** (decisión del usuario: se queda como ya está). Los tokens dark existen para coherencia futura, no para tocar esa pantalla ahora.

## Color

Estrategia: **Restrained**. Arquitectura neutra tintada a navy + **un solo acento** (el de la academia, ≤10% de la superficie) + verde de éxito y ámbar/rojo semánticos.

OKLCH para toda la paleta. Croma reducido en extremos. **Sin `#000` ni `#fff`.**

### White-label: lo único que cambia por academia

```css
:root {
  /* ════ CAMBIAR SOLO ESTO POR ACADEMIA ════
     El acento (botón primario, nav activo, "en vivo") sale de un hue + croma.
     El logo se cambia en el componente <Brand/>. Nada más. */
  --academy-accent-h: 25;       /* CAAA: rojo del logo (#C9242E) */
  --academy-accent-c: 0.205;
}
```

### Paleta (derivada — no editar por academia)

```css
:root {
  /* Neutros tintados a navy (hue 262) */
  --c-ink-1:    oklch(22% 0.020 262);   /* Texto principal */
  --c-ink-2:    oklch(38% 0.016 262);   /* Texto secundario */
  --c-ink-3:    oklch(54% 0.012 262);   /* Terciario, labels */
  --c-ink-4:    oklch(70% 0.009 262);   /* Deshabilitado, placeholder */

  --c-line-1:   oklch(92% 0.008 262);   /* Hairline interno */
  --c-line-2:   oklch(88% 0.010 262);   /* Borde default */
  --c-line-3:   oklch(80% 0.012 262);   /* Borde énfasis */

  --c-surface-0: oklch(99.2% 0.003 262); /* Background base */
  --c-surface-1: oklch(98.4% 0.004 262); /* Cards, panels */
  --c-surface-2: oklch(96.5% 0.007 262); /* Hover, header de tabla */
  --c-surface-3: oklch(94% 0.009 262);   /* Activo, seleccionado */

  /* Marca CAAA — NAVY (estructura: sidebars, login, headers de instrumento).
     No es el acento; es el color "casa", igual para toda academia. */
  --c-brand-50:  oklch(96% 0.020 262);
  --c-brand-100: oklch(90% 0.040 262);
  --c-brand-300: oklch(68% 0.080 262);
  --c-brand-500: oklch(45% 0.110 262);
  --c-brand-700: oklch(34% 0.095 262);   /* Navy del logo */
  --c-brand-900: oklch(24% 0.065 262);   /* Header/sidebar profundo */

  /* PRIMARY — el ACENTO de la academia (CAAA = rojo). Acción primaria,
     nav activo, indicador "en vivo". Sale del bloque white-label. */
  --c-primary-50:  oklch(96% 0.020 var(--academy-accent-h));
  --c-primary-100: oklch(90% 0.055 var(--academy-accent-h));
  --c-primary-300: oklch(72% 0.140 var(--academy-accent-h));
  --c-primary-500: oklch(54% var(--academy-accent-c) var(--academy-accent-h)); /* Acento */
  --c-primary-600: oklch(48% 0.200 var(--academy-accent-h));  /* Hover */
  --c-primary-700: oklch(42% 0.180 var(--academy-accent-h));  /* Active */

  /* SUCCESS — verde "luz de pista" (saldo a favor, OK, completado, pagado).
     Era el viejo --c-accent-*; se conserva ese nombre como alias por compat. */
  --c-success-50:  oklch(95% 0.035 155);
  --c-success-100: oklch(88% 0.080 155);
  --c-success-500: oklch(55% 0.150 155);
  --c-success-700: oklch(40% 0.130 155);
  --c-accent-50:  var(--c-success-50);   /* alias legacy */
  --c-accent-100: var(--c-success-100);
  --c-accent-300: oklch(70% 0.130 155);
  --c-accent-500: var(--c-success-500);
  --c-accent-700: var(--c-success-700);

  /* Semánticos */
  --c-danger-50:  oklch(95% 0.030 25);   /* familia roja como el acento */
  --c-danger-100: oklch(88% 0.070 25);
  --c-danger-500: oklch(52% 0.200 25);
  --c-danger-700: oklch(40% 0.175 25);

  --c-warn-50:    oklch(96% 0.040 75);
  --c-warn-100:   oklch(90% 0.080 75);
  --c-warn-500:   oklch(72% 0.150 75);   /* ámbar mantenimiento */
  --c-warn-700:   oklch(50% 0.140 65);

  --c-info-50:    oklch(96% 0.030 230);
  --c-info-100:   oklch(90% 0.065 230);
  --c-info-500:   oklch(58% 0.140 230);
  --c-info-700:   oklch(42% 0.130 230);
}
```

### Dark (solo operaciones/proyección — NO rediseñar ahora)

```css
[data-theme="dark"] {
  --c-surface-0: oklch(20% 0.020 262);
  --c-surface-1: oklch(24% 0.022 262);
  --c-surface-2: oklch(28% 0.024 262);
  --c-surface-3: oklch(33% 0.026 262);
  --c-ink-1: oklch(96% 0.006 262);
  --c-ink-2: oklch(82% 0.010 262);
  --c-ink-3: oklch(66% 0.012 262);
  --c-line-1: oklch(34% 0.018 262);
  --c-line-2: oklch(40% 0.020 262);
}
```

### Reglas de uso

- Texto principal: `--c-ink-1` sobre `--c-surface-0` (contraste >12:1, AAA holgado).
- **Botón primario** = `--c-brand-700` (navy CAAA), hover `--c-brand-900`. Es la acción principal: **una sola por superficie visible**. (Decisión: navy primario, rojo solo acento.)
- **Acento rojo** (`--c-primary-500`, el color temeable de la academia) = ESCASO: indicador de nav/tab activa, badge "en vivo", alertas, y el detalle de marca (línea del horizonte en el login). Vive en **≤10%** de cada pantalla; su rareza lo hace decisivo.
- **Destructivo** = rojo en estilo distinto al acento sólido: outline/ghost rojo (`--c-danger-700` texto + borde, hover `--c-danger-50`) + icono + confirmación.
- **Positivo/verde** (`--c-success-500`) solo para "OK / completado / depósito a favor / pagar". No es el botón default.
- **Navy** (`--c-brand-*`) para acción primaria y estructura: botones primarios, sidebar, topbar, panel de login, encabezados de instrumento.
- Bordes hairline: `--c-line-1` subdivisiones internas, `--c-line-2` default.

## Typography

```css
--font-sans: "Inter", "Inter Variable", system-ui, -apple-system, sans-serif;
--font-mono: "JetBrains Mono", "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace;
```

> Se **retiran** Exo 2 y Outfit del producto. Una sola sans (Inter) lleva títulos, botones, labels, body y data. Mono solo para números/correlativos.

**Mono (tabular) intencional para:** correlativos de factura/recibo (`#174759`), matrículas (`YS-334-PE`, `SIM-1`), montos en tablas, H.V./H.T. del vuelo, saldos en resúmenes, fechas cortas en tablas (`07/07/25`), IDs y referencias. `font-variant-numeric: tabular-nums` en **toda** tabla con números: no es opcional.

Escala fija en rem-equivalente (px), ratio ~1.25 (producto, no fluida):
`--text-xs 11` · `sm 13` · `base 14` · `md 16` · `lg 18` · `xl 22` · `2xl 28` · `3xl 36` · `4xl 48`.
Pesos: 400 body, 500 énfasis, 600 botones/labels, 700 títulos, 800 números grandes. Nunca 900.

## Spacing

Base 4px: 4-8-12-16-20-24-32-40-56-72-96-128. **Densidad por superficie** (no estandarizar):
- Admin financiero: filas de tabla 36px, inputs 8/10px. Vive ahí 8h.
- Alumno mobile-first: contenedores 16px, tarjetas 20px, items táctiles ≥56px.
- Cards: padding 20-24px. **Nunca cards anidados.**

## Radius

`--radius-xs 4` (inputs, chips) · `sm 6` (botones) · `md 10` (cards, paneles) · `lg 14` (hero cards, modales) · `pill 999`.
`border-radius: 50%` solo para avatares, nunca para iconos de fondo en grids.

## Elevation

Planas en reposo. Separación por **borde + diferencia de surface**, no por sombra.
```css
--shadow-sm: 0 1px 0 oklch(22% 0.02 262 / 0.04);
--shadow-md: 0 1px 2px oklch(22% 0.02 262 / 0.06), 0 0 0 1px var(--c-line-1);
--shadow-lg: 0 8px 24px oklch(22% 0.02 262 / 0.08), 0 0 0 1px var(--c-line-2);
--shadow-focus: 0 0 0 3px oklch(54% 0.205 25 / 0.22);   /* anillo en acento */
```

## Motion

Ease-out cuartil. Sin bounce/elastic/spring. Solo `transform`/`opacity`/`color`/`background-color`; nunca `width`/`height`/`top`/`left`/`padding`.
`--ease-out: cubic-bezier(0.22,1,0.36,1)` · `--ease-out-soft: cubic-bezier(0.16,1,0.3,1)`. `--dur-fast 120` · `med 220` · `slow 380`. `prefers-reduced-motion` desactiva todo menos fade.

## Components (primitivos compartidos)

Se extraen 6 primitivos reutilizables (hoy hay ~40 variantes duplicadas en 46 CSS): **Button, Card, Input, Modal, Badge, Table**. Mismo vocabulario en toda la app.

### Button
- **Primary** (`--c-brand-700` navy, texto claro): acción principal. Una por superficie. Hover `--c-brand-900`.
- **Secondary** (bg transparente, borde `--c-line-2`, texto `--c-ink-1`): soporte. Hover `--c-surface-2`.
- **Ghost** (transparente, hover `--c-surface-2`): terciario (icon-only, "Volver").
- **Success** (`--c-success-500`): solo "Aprobar / Pagar / Completar".
- **Destructive** (borde + texto `--c-danger-700`, hover fondo `--c-danger-50`): destrucción explícita + confirmación.
- El acento rojo (`--c-primary-500`) NO se usa como relleno de botón; es indicador de estado activo/en-vivo.
- Padding: 8/14 sm · 10/16 md · 12/20 lg. Altura mín 36px desktop, 44px mobile. Radius `sm`. Estados completos: default/hover/focus/active/disabled/loading.

### Table
Header `--c-surface-2`, label uppercase `--text-xs` tracking +0.5, `--c-ink-3`, padding 10/14. Fila 36px, padding 8/14, border-bottom `--c-line-1`, hover `--c-surface-1` (120ms). Números `tabular-nums`, alineados a la derecha. **Sin zebra stripes.**

### Forms / Input
Label `--text-xs` uppercase tracking +0.5 `--c-ink-3`, mb 6px. Input borde `--c-line-2`, radius `sm`, padding 10/12. Focus borde `--c-primary-500` + ring `--shadow-focus`. Sin iconos dentro salvo que aporten (búsqueda, moneda).

### Card
Surface `--c-surface-1`, borde `--c-line-1`, radius `md`, padding 20-24px. Sin sombra default (solo hover si es navegable). **Prohibido:** card en card; **prohibido** side-stripe (borde lateral grueso coloreado) → usar heading + accent dot o full border tintado.

### Badge / Status pill
Fondo `--c-{color}-50`/`-100`, texto `--c-{color}-700`. Padding 3/10, `--text-xs`, weight 600, tracking +0.3. Semántica de cabina: rojo=activo/alerta, verde=disponible/ok, ámbar=mantenimiento, info=programado.

### Modal
Overlay `oklch(22% 0.02 262 / 0.5)`. Panel `--c-surface-0`, radius `lg`, `--shadow-lg`, max-width según contenido (no full-bleed). Header con título + cerrar (×, ghost). Cuerpo con scroll propio si excede. Footer: primario a la derecha, "Cancelar" como ghost/texto a su izquierda. Cierre por backdrop y por Esc. Foco atrapado. Mismo chasis para los ~35 modales (dedicados e inline).

## Layout

- Max-width body 1280px (admin) / 1000px (alumno). Sidebar fija 244px desktop, oculta-on-toggle <1024px. Gutters 24/16/12.
- Topbar `--c-brand-900` (navy), sidebar navy con item activo marcado por indicador `--c-primary-500` (rojo). Grids con `gap`, auto-fit `minmax()`. Espacios vacíos son mensaje, no relleno.

## Brand slot (Login y momentos de marca)

El panel izquierdo del Login es un **slot intercambiable** (`<BrandPanel/>`): por default muestra el motivo "horizonte artificial + retícula técnica" sobre navy, pero está hecho para reemplazarse luego por una imagen o animación sin tocar el formulario. El sello técnico se usa con mesura (login, estados vacíos, portadas), nunca como decoración invasiva ni como silueta de avión de adorno.

## Iconography

Bootstrap Icons (ya en uso). Inline 14-16px, sidebar/nav 18px, featured 24px máx. Sin iconos circulares con fondo de color (trampa de template).

## Prohibiciones del proyecto

1. **Side-stripe borders** en cards (`border-left: 4px solid …`) → heading + accent dot o full border.
2. **`background-clip: text` con gradiente** sobre títulos.
3. **Gradientes diagonales en headers de página** → color sólido `--c-brand-900` o tono sutil.
4. **`#000` / `#fff`** literales → tokens.
5. **KPI hero-template** (número gigante + label + flecha) → dar contexto y comparación.
6. **Cliché aviación** (cielos, alas doradas, aviones decorativos). El carácter vive en mono, hairlines, semántica de cabina y el sello técnico sutil.
7. **Exo 2 / Outfit** → Inter.
8. **El acento (rojo) como relleno en algo que no sea acción primaria/activo/en-vivo.** Si se pasa del 10%, sobra.

---

## Estilo "Core Admin" (módulo Administración/Contabilidad)

Para todas las pantallas nuevas del módulo admin (Contabilidad, Nómina, Usuarios,
fichas…) seguir la referencia en **`design-mockups/admin-ui-reference/`**
(`contabilidad-nomina.html` + `README.md`): tarjetas con sombra sutil y esquinas
redondeadas, acordeones con chip de ícono + subtítulo azul y animación suave,
tablas de cabecera tenue con badges tipo píldora, **botones de solo ícono**
(`.adf-icon-btn`) para acciones en filas, notas informativas azules (`.adf-note`),
y modales de edición limpios (sin fondos saturados) que abren centrados sobre la
posición actual. Implementado en las clases `adf-*` de `AdministracionLayout.css`.
