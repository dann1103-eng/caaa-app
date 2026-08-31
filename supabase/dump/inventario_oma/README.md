# Carga del inventario de la bodega OMA

Pasa el Excel `INVENTARIO OMA CAAA-CONTADOR ACTUALIZADO.xlsx` al sistema.
Va en dos pasos porque en este repo **no hay módulo de Excel para Node** (lección de
la carga del programa semanal, CLAUDE.md §16): Python lee el Excel, Node carga a Supabase.

```bash
# 1 · Excel -> JSON normalizado (imprime los avisos de la extracción)
python extraer_excel.py "C:/Users/Daniel/Downloads/INVENTARIO OMA CAAA-CONTADOR ACTUALIZADO (1).xlsx" inventario_oma.json

# 2 · JSON -> Supabase. Primero SIEMPRE en seco:
node cargar.js --dry-run
node cargar.js            # aplica de verdad
```

`inventario_oma.json` queda commiteado: es el registro exacto de lo que se cargó
(el Excel de origen no está en el repo) y su lista `problemas` es lo que hay que
revisar con el mecánico.

## Banderas

| Bandera | Qué hace |
|---|---|
| `--dry-run` | Hace todo el trabajo, imprime el reporte y hace ROLLBACK. |
| `--limpiar-demo` | Borra los repuestos sin código (los 3 de demo de la migración 011). Solo hace falta la primera vez. |

## Es re-ejecutable

Lo cargado queda marcado `origen='EXCEL_2026'` y el script lo borra al empezar, así que
correrlo dos veces no duplica nada. Los ítems se hacen UPSERT por `codigo`.

## Lo que el script NO arregla solo

El stock **no se importa**: sale de sumar los movimientos. Al final el reporte compara
contra lo que decía el Excel y lista:

- **existencias en negativo** — entradas que nunca se digitaron;
- **diferencias contra el Excel** — el Excel cruzaba por descripción + n° de parte y por
  eso perdía movimientos mal tecleados; el sistema cruza por código.

Ninguna de las dos se corrige sola. El mecánico cuenta en bodega y se cierran con un
documento de ajuste (`AJ-001-2026 · Cuadre de migración`), que deja el rastro de por qué
cambió cada una.

Spec: `docs/superpowers/specs/2026-08-17-inventario-taller-design.md`
