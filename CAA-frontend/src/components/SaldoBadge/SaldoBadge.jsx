import React from "react";

/**
 * Saldo monetario con estado visual sutil.
 * Cuatro rangos: negativo, crítico, advertencia, ok.
 * El color es informativo, no decorativo. Cero saturación adicional fuera de paleta.
 */
export default function SaldoBadge({ saldo, size = "md" }) {
  const value = Number(saldo || 0);

  let bg, color, ring, icon, label;
  if (value <= 0) {
    bg = "var(--c-danger-50)"; color = "var(--c-danger-700)"; ring = "oklch(85% 0.075 25)";
    icon = "bi-exclamation-octagon-fill"; label = "Negativo";
  } else if (value < 200) {
    bg = "var(--c-warn-50)"; color = "var(--c-warn-700)"; ring = "oklch(85% 0.080 75)";
    icon = "bi-exclamation-triangle-fill"; label = "Crítico";
  } else if (value < 1000) {
    bg = "var(--c-surface-2)"; color = "var(--c-ink-2)"; ring = "var(--c-line-2)";
    icon = "bi-circle-half"; label = "Bajo";
  } else {
    bg = "var(--c-accent-50)"; color = "var(--c-accent-700)"; ring = "oklch(85% 0.075 155)";
    icon = "bi-check-circle-fill"; label = "OK";
  }

  const sizes = {
    sm: { px: 8, py: 2,  fz: 11, gap: 4, icon: 11 },
    md: { px: 12, py: 4, fz: 13, gap: 6, icon: 12 },
    lg: { px: 16, py: 8, fz: 22, gap: 8, icon: 16 }
  };
  const s = sizes[size] || sizes.md;

  return (
    <span
      title={`Saldo ${label.toLowerCase()}: $${value.toFixed(2)}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: s.gap,
        padding: `${s.py}px ${s.px}px`,
        fontFamily: "var(--font-mono)",
        fontSize: `${s.fz}px`,
        fontWeight: 600,
        background: bg,
        color,
        borderRadius: "var(--radius-pill)",
        border: `1px solid ${ring}`,
        fontVariantNumeric: "tabular-nums",
        letterSpacing: "-0.005em",
        lineHeight: 1
      }}
    >
      <i className={`bi ${icon}`} style={{ fontSize: s.icon }}></i>
      ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}
