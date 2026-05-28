// Format moment value based on aircraft type
export function fmtMoment(value, ac) {
  if (ac.moment_div1000) {
    return (value / 1000).toFixed(1)
  }
  if (value !== Math.round(value)) {
    return value.toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }
  return Math.round(value).toLocaleString('en-US')
}

// Calculate W&B totals from inputs
export function calcWB(ac, inputs) {
  let totalW = ac.empty_weight
  let totalM = ac.empty_weight * ac.empty_arm

  // Oil (only PA-28 variants)
  if (ac.oil) {
    totalW += ac.oil.weight
    totalM += ac.oil.weight * ac.oil.arm
  }

  // Variable stations
  ac.stations.forEach(s => {
    const raw = inputs[s.id]
    if (raw === '' || raw == null) return
    const w = s.is_fuel
      ? parseFloat(raw) * ac.fuel_lb_gal
      : parseFloat(raw)
    if (!isNaN(w)) {
      totalW += w
      totalM += w * s.arm
    }
  })

  const cg = totalW > 0 ? totalM / totalW : 0
  return { totalW, totalM, cg }
}

// Check if point is inside envelope using linear interpolation
export function checkCGInEnvelope(weight, cg, limits) {
  if (!limits || limits.length < 2) return { inside: true, fwd: 0, aft: 0 }
  const sorted = [...limits].sort((a, b) => a.w - b.w)
  for (let i = 0; i < sorted.length - 1; i++) {
    if (weight >= sorted[i].w && weight <= sorted[i + 1].w) {
      const t = (weight - sorted[i].w) / (sorted[i + 1].w - sorted[i].w)
      const fwd = sorted[i].fwd + t * (sorted[i + 1].fwd - sorted[i].fwd)
      const aft = sorted[i].aft + t * (sorted[i + 1].aft - sorted[i].aft)
      return { inside: cg >= fwd && cg <= aft, fwd, aft }
    }
  }
  if (weight <= sorted[0].w) {
    return { inside: cg >= sorted[0].fwd && cg <= sorted[0].aft, fwd: sorted[0].fwd, aft: sorted[0].aft }
  }
  const last = sorted[sorted.length - 1]
  return { inside: cg >= last.fwd && cg <= last.aft, fwd: last.fwd, aft: last.aft }
}

// Get forward CG limit at given weight
export function getForwardLimit(w, limits) {
  const s = [...limits].sort((a, b) => a.w - b.w)
  for (let i = 0; i < s.length - 1; i++) {
    if (w >= s[i].w && w <= s[i + 1].w) {
      const t = (w - s[i].w) / (s[i + 1].w - s[i].w)
      return s[i].fwd + t * (s[i + 1].fwd - s[i].fwd)
    }
  }
  if (w <= s[0].w) return s[0].fwd
  return s[s.length - 1].fwd
}

// Get aft CG limit at given weight
export function getAftLimit(w, limits) {
  const s = [...limits].sort((a, b) => a.w - b.w)
  for (let i = 0; i < s.length - 1; i++) {
    if (w >= s[i].w && w <= s[i + 1].w) {
      const t = (w - s[i].w) / (s[i + 1].w - s[i].w)
      return s[i].aft + t * (s[i + 1].aft - s[i].aft)
    }
  }
  if (w <= s[0].w) return s[0].aft
  return s[s.length - 1].aft
}
