# Design

## Theme

Light por default. Mode oscuro coherente como opción futura, no ahora.

**Escena física:** contadora frente a un monitor de 24" en oficina iluminada con luz natural lateral; o alumno en celular bajo sol fuerte en estacionamiento del aeropuerto; o instructor con iPad en hangar de luz mixta. Light wins.

## Color

Estrategia: **Restrained** para superficies de producto (Administración + Aula Virtual del alumno). Neutros tintados hacia el azul-cielo profundo, un acento verde-CAAA usado con propósito (<10% de la superficie), y rojos/ámbar para semantica.

OKLCH para toda la paleta. Croma reducido en extremos.

```css
:root {
  /* Neutros tintados hacia azul institucional (hue ~250) */
  --c-ink-1:    oklch(20% 0.020 250);   /* Texto principal */
  --c-ink-2:    oklch(38% 0.015 250);   /* Texto secundario */
  --c-ink-3:    oklch(55% 0.010 250);   /* Texto terciario, labels */
  --c-ink-4:    oklch(72% 0.008 250);   /* Texto deshabilitado, placeholders */

  --c-line-1:   oklch(92% 0.008 250);   /* Bordes sutiles */
  --c-line-2:   oklch(88% 0.010 250);   /* Bordes default */
  --c-line-3:   oklch(80% 0.012 250);   /* Bordes énfasis */

  --c-surface-0: oklch(99.2% 0.004 250); /* Background base (NO #fff) */
  --c-surface-1: oklch(98.5% 0.005 250); /* Cards, panels */
  --c-surface-2: oklch(96.5% 0.008 250); /* Hover, secciones */
  --c-surface-3: oklch(94% 0.010 250);   /* Selected, active states */

  /* Marca CAAA: azul institucional (cielo profundo, NO marino corporativo) */
  --c-brand-50:  oklch(96% 0.030 245);
  --c-brand-100: oklch(90% 0.060 245);
  --c-brand-300: oklch(70% 0.115 245);
  --c-brand-500: oklch(48% 0.155 245);  /* Principal */
  --c-brand-700: oklch(35% 0.140 245);  /* Hover oscuro */
  --c-brand-900: oklch(22% 0.080 245);  /* Headers, énfasis */

  /* Acento verde aeronáutico (luz verde de pista / OK) */
  --c-accent-50:  oklch(95% 0.035 155);
  --c-accent-300: oklch(70% 0.130 155);
  --c-accent-500: oklch(55% 0.170 155); /* Acento principal */
  --c-accent-700: oklch(40% 0.140 155);

  /* Semánticos */
  --c-danger-50:  oklch(95% 0.030 25);
  --c-danger-500: oklch(55% 0.190 25);
  --c-danger-700: oklch(40% 0.170 25);

  --c-warn-50:    oklch(96% 0.040 75);
  --c-warn-500:   oklch(70% 0.150 75);
  --c-warn-700:   oklch(50% 0.140 65);

  --c-info-50:    oklch(96% 0.030 230);
  --c-info-500:   oklch(58% 0.140 230);
}
```

Reglas de uso:
- Texto principal: `--c-ink-1` sobre `--c-surface-0` (contraste >12:1, AAA holgado).
- Botón primario: `--c-brand-500` fondo, blanco tintado al hover `--c-brand-700`.
- Botón positivo/confirmar: `--c-accent-500` solo cuando significa "OK / completado / depósito a favor". No es el botón default.
- Bordes: `--c-line-1` para subdivisiones internas, `--c-line-2` por defecto.
- **Sin `#000` ni `#fff`** en ningún archivo. Si aparece en una migración o componente, corregir.

## Typography

Dos familias, ambas variables, gratuitas:

```css
--font-sans: "Inter", "Inter Variable", system-ui, -apple-system, sans-serif;
--font-mono: "JetBrains Mono", "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace;
```

**Mono se usa intencionalmente para:**
- Correlativos de factura/recibo: `#174759`
- Matrículas: `YS-334PE`, `SIM-1`
- Cantidades monetarias en tablas (alineación tabular)
- H.V. / H.T. del vuelo
- Saldos en cards de resumen
- Fechas en formato corto en tablas (`07/07/25`)
- IDs y referencias técnicas

**Sans para todo lo demás.** Sin serifs decorativas. Sin display fonts.

Escala (1.25 ratio, con ajustes manuales en extremos):

```css
--text-xs:    11px;  /* Labels uppercase, meta */
--text-sm:    13px;  /* Body en tablas densas */
--text-base:  14px;  /* Body default productos */
--text-md:    16px;  /* Body alumno (mobile-first) */
--text-lg:    18px;  /* Subheaders */
--text-xl:    22px;  /* Section titles */
--text-2xl:   28px;  /* Page titles */
--text-3xl:   36px;  /* Saldos grandes, KPI values */
--text-4xl:   48px;  /* Hero numbers (curso card) */
```

Pesos: 400 body, 500 énfasis sutil, 600 botones/labels, 700 títulos, 800 números grandes. Nunca 900.

Tabular: `font-variant-numeric: tabular-nums` en TODA tabla con números. Esto no es opcional.

## Spacing

Base 4px, escala 4-8-12-16-20-24-32-40-56-72-96-128.

**Densidad por superficie:**
- Admin financiero: filas de tabla 36px alto, padding inputs 8px y/10px x.
- Alumno mobile-first: padding 16px contenedores, tarjetas con padding 20px, filas/items mínimo 56px de altura táctil.
- Cards: padding 20-24px, NUNCA cards anidados.

## Radius

```css
--radius-xs: 4px;   /* Inputs, chips, pequeños */
--radius-sm: 6px;   /* Botones */
--radius-md: 10px;  /* Cards, paneles */
--radius-lg: 14px;  /* Hero cards, modales */
```

No usar `border-radius: 50%` para iconos circulares en grids (anti-pattern Bootstrap). Solo para avatares.

## Elevation

Sin sombras pesadas. Las cards se separan por borde + ligera diferencia de surface, no por shadow.

```css
--shadow-sm: 0 1px 0 oklch(20% 0.020 250 / 0.04);                /* Línea inferior sutil */
--shadow-md: 0 1px 2px oklch(20% 0.020 250 / 0.06),
             0 0 0 1px var(--c-line-1);                          /* Card normal */
--shadow-lg: 0 8px 24px oklch(20% 0.020 250 / 0.08),
             0 0 0 1px var(--c-line-2);                          /* Popovers, modales */
```

## Motion

Curvas ease-out cuartil para todo. Sin bounce, sin elastic, sin spring exagerado.

```css
--ease-out: cubic-bezier(0.22, 1, 0.36, 1);      /* ease-out-quart */
--ease-out-soft: cubic-bezier(0.16, 1, 0.3, 1);  /* ease-out-expo */
--dur-fast: 120ms;
--dur-med:  220ms;
--dur-slow: 380ms;
```

Animaciones solo sobre `transform`, `opacity`, `color`, `background-color`. NUNCA sobre `width`, `height`, `top`, `left`, `padding`.

`prefers-reduced-motion: reduce` desactiva todas las transiciones excepto fade.

## Components

### Buttons
Tres niveles, no más:
- **Primary** (`--c-brand-500`): la acción principal de la página. Una sola por surface visible.
- **Secondary** (transparent bg, `--c-line-2` border): acciones de soporte.
- **Ghost** (transparent, hover muestra `--c-surface-2`): acciones terciarias (íconos solos, "Volver").

Botón destructivo (`--c-danger-500`) solo para confirmar destrucción explícita. Botón positivo verde solo para "Aprobar / Pagar / Completar".

Padding: 8px 14px sm, 10px 16px md, 12px 20px lg. Altura mínima 36px desktop, 44px mobile.

### Tables
- Header: `--c-surface-2` background, label uppercase `--text-xs`, tracking +0.5px, color `--c-ink-3`, padding 10px 14px.
- Body row: 36px alto, padding 8px 14px, border-bottom `--c-line-1`.
- Hover row: `--c-surface-1` fade 120ms.
- Números: `font-variant-numeric: tabular-nums`, alineación derecha.
- Sin zebra stripes (anti-Bootstrap). Subrayado de filas es suficiente.

### Forms
- Labels: `--text-xs` uppercase, tracking +0.5px, `--c-ink-3`, margin-bottom 6px.
- Inputs: borde 1px `--c-line-2`, radius `--radius-sm`, padding 10px 12px.
- Focus: borde `--c-brand-500` + ring 3px `--c-brand-500 / 0.15`.
- Sin íconos dentro del input por default. Solo cuando agreguen información (búsqueda, monedas).

### Cards
- Surface `--c-surface-1`, borde `--c-line-1`, radius `--radius-md`, padding 20-24px.
- Sin sombra default. Solo sombra al hover si la card es navegable.
- **Prohibido:** card dentro de card.
- **Prohibido:** side-stripe border (borde grueso lateral coloreado). Si una card es importante, eleva el contenido (heading + accent dot), no le agregues franja.

### Status pills / tags
Cápsulas con fondo en `--c-{color}-50` y texto en `--c-{color}-700`. Padding 3px 10px. `--text-xs`, font-weight 600, letter-spacing +0.3px.

## Layout

- Max-width body 1280px (admin) o 1000px (alumno).
- Sidebar fija 240px en desktop; oculta-on-toggle <1024px.
- Gutters: 24px desktop, 16px tablet, 12px mobile.
- Grids: usar `gap` no margins entre items. Auto-fit columns con `minmax()` para responsive natural.
- Espacios vacíos son mensaje, no descuido. No llenar con cards de relleno.

## Iconography

Bootstrap Icons (ya en uso) — coherente y suficiente. Tamaños:
- Inline texto: 14-16px
- Sidebar / nav: 18px
- KPI / featured: 24px máximo
- Sin íconos circulares de fondo de color (Bootstrap-template trap).

## Page archetypes y densidad

| Surface | Densidad | Tipo body | Tamaño body | Padding container |
|---|---|---|---|---|
| Admin tables | Alta | Inter | 13px | 24px |
| Admin dashboards | Media | Inter | 14px | 28px |
| Admin forms | Media | Inter | 14px | 24px |
| Alumno aula virtual | Baja, respirada | Inter | 16px | 20px (mobile) / 32px (desktop) |
| Alumno mi cuenta | Media | Inter | 14-15px | 20px (mobile) / 24px (desktop) |
| Login | Baja | Inter | 15px | centrado |

## Prohibiciones específicas del proyecto

1. **Side-stripe borders** en cards. Cualquier `border-left: 4px solid var(...)` o `border-left: 5px solid #xxx` debe reemplazarse por: heading con accent dot, badge superior, o full border tintado.
2. **`background-clip: text` con gradiente** sobre títulos.
3. **Gradientes degradados en headers de página.** El topbar verde del módulo admin actual con `linear-gradient(135deg, #0f5132 → #157347)` se reemplaza por color sólido `--c-brand-900` o un patron tonal sutil (no gradiente diagonal).
4. **`#000` y `#fff`** literales en CSS. Usar tokens.
5. **KPI hero-template** (número gigante + label genérico + flecha verde). Si un dato es importante, dale contexto y comparación.
