
export function plantillaToAC(plantilla, reg, model) {
  const fuelLbGal = parseFloat(plantilla.fuel_lb_gal) || 6.0
  const allEstaciones = plantilla.estaciones ?? []

  const oilEst = allEstaciones.find(s => s.is_oil === true || s.is_fixed === true)
  const oil = oilEst
    ? {
        label:  oilEst.nombre,
        arm:    parseFloat(oilEst.arm),
        weight: parseFloat(oilEst.fixed_weight ?? oilEst.max_weight ?? 0),
      }
    : null

  const fuelCapGal  = parseFloat(plantilla.fuel_capacity_gal) || null
  const fuelUsable  = parseFloat(plantilla.fuel_usable_gal)  || null

  function fuelLabel(stationNombre) {
    if (fuelCapGal && fuelUsable && fuelCapGal !== fuelUsable)
      return `Fuel (${fuelCapGal} gal cap, ${fuelUsable} usable)`
    if (fuelUsable)
      return `Fuel (${fuelUsable} gal)`
    return stationNombre
  }

  const stations = allEstaciones
    .filter(s => !s.is_oil && !s.is_fixed)
    .map(s => {
      const id     = toSlug(s.nombre)
      const isFuel = s.is_fuel === true

      const maxGal = isFuel
        ? (s.max_gal ?? (s.max_weight ? s.max_weight / fuelLbGal : undefined))
        : undefined

      return {
        id,
        label:   isFuel ? fuelLabel(s.nombre) : s.nombre,
        nombre:  s.nombre,
        arm:     parseFloat(s.arm),
        max:     !isFuel && s.max_weight != null ? parseFloat(s.max_weight) : undefined,
        max_gal: maxGal,
        is_fuel: isFuel,
      }
    })

  return {
    reg,
    model: model || reg,

    empty_weight:  parseFloat(plantilla.empty_weight),
    empty_arm:     parseFloat(plantilla.empty_weight_arm),
    empty_moment:  parseFloat(plantilla.empty_weight_moment),
    max_gross:     parseFloat(plantilla.max_takeoff_weight),
    max_landing:   parseFloat(plantilla.max_landing_weight ?? plantilla.max_takeoff_weight),

    fuel_lb_gal:       fuelLbGal,
    fuel_capacity_gal: fuelCapGal,
    fuel_usable_gal:   fuelUsable,
    fuel_burn_gal_hr:  parseFloat(plantilla.fuel_burn_gal_hr) || null,
    fuel_burn_note:    plantilla.fuel_burn_note ?? null,

    moment_div1000: plantilla.moment_div1000 === true,

    oil,

    stations,

    limits_normal:  plantilla.limits_normal  ?? [],
    limits_utility: plantilla.limits_utility ?? null,
  }
}

function toSlug(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

export function buildPesosPayload(wbInputs, stations) {
  const pesos = {}
  for (const station of stations) {
    const raw = wbInputs[station.id]
    if (raw !== '' && raw != null) {
      const val = parseFloat(raw)
      if (!isNaN(val)) {
        pesos[station.nombre] = val
      }
    }
  }
  return pesos
}
