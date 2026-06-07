# Estilo "Core Admin" — Referencia de UI para el módulo Administración/Contabilidad

Mockup de referencia: [`contabilidad-nomina.html`](./contabilidad-nomina.html) (provisto por el usuario, jun-2026).
**Mantener este look & feel en todas las pantallas nuevas del módulo admin** (Contabilidad,
Nómina, Usuarios, fichas, etc.). Implementado en las clases `adf-*` de
`CAA-frontend/src/components/AdministracionLayout/AdministracionLayout.css`.

## Principios (suave, limpio, poco "tosco")
- **Tarjetas**: fondo claro, borde hairline, esquinas `rounded-lg`, **sombra sutil**
  (`shadow-sm`). Nada de bordes gruesos ni fondos saturados (no más amarillo fuerte en
  modo edición → usar cabecera tonal).
- **Acordeones**: header con **chip de ícono** (cuadro tonal redondeado) + título en
  negrita + **subtítulo pequeño en azul** (ej. "Desde 2024-01-01") + chevron que rota.
  Apertura con animación suave de altura/opacidad.
- **Tablas**: `thead` tenue (fondo `surface-2`, texto xs en mayúsculas, gris), filas con
  separador fino y **hover**, padding generoso (`px-6 py-4` aprox). Números en `tabular-nums`/mono.
- **Badges de estado**: **píldoras** (`rounded-full`) con fondo suave + texto del mismo
  tono (verde=pagada/ok, azul=info/aprobada, ámbar=borrador, gris=anulada).
- **Botones**:
  - Primario: navy sólido, `rounded`, **sombra suave**, hover más oscuro.
  - Secundario: blanco con borde hairline, hover gris muy claro.
  - Destructivo: contorno/ícono **rojo** (acento, ≤10%).
  - **Acciones en filas = botones de solo ícono** (`.adf-icon-btn`): gris que vira a navy
    en hover (o a rojo si es anular). Evitar botones "small secondary" con texto en cada fila.
- **Notas informativas**: caja azul muy clara (`.adf-note`) con ícono + texto pequeño.
- **Inputs**: borde hairline, `rounded`, foco navy. Labels xs en mayúsculas, gris.
- **Tipografía**: Inter; datos/monto en `tabular-nums`.
- **Color de acento**: el navy de marca (token `--c-brand-*`, equivalente al `#25478a` del
  mockup). Rojo solo para acciones destructivas/alertas.

## Clases utilitarias disponibles (ya en AdministracionLayout.css)
- `adf-card`, `adf-acc` / `adf-acc__head` / `adf-acc__title` / `adf-acc__count` / `adf-acc__body`
- `adf-table` (+ `.amount .pos .neg`), `adf-tag` (`.green .blue .amber` y neutro)
- `adf-btn` (+ `.secondary`, `.small`), `adf-icon-btn` (+ `.danger`), `adf-note`
- `adf-edit-head` / `adf-edit-head__chip` (cabecera de modal de edición)
- `adf-modal-backdrop` / `adf-modal-card` (modal centrado que no salta a la posición superior)

## Reglas de interacción
- Los modales de edición abren **centrados sobre la posición actual** (no saltan arriba).
- Listas largas dentro de un editor → **acordeones colapsados** por defecto + buscador.
- Confirmaciones destructivas (anular) piden motivo.
