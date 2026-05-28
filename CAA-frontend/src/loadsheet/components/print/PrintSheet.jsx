import { useMemo, Fragment } from 'react'
import { useLoadSheet } from '../../context/LoadSheetContext'
import { AIRCRAFT } from '../../data/aircraft'
import { fmtMoment, calcWB } from '../../utils/wbCalc'
import { calcFuel } from '../../utils/fuelCalc'
import { renderEnvelopeToDataUrl } from '../../utils/drawEnvelope'

export default function PrintSheet() {
  const { state } = useLoadSheet()
  const ac = AIRCRAFT[state.currentAC]
  const wb = state.wbResults

  const toEnvelopeUrl = useMemo(() => renderEnvelopeToDataUrl({
    gw: wb.totalW, cg: wb.cg,
    limitsNormal: ac?.limits_normal, limitsUtility: ac?.limits_utility,
    showPoint: wb.totalW > (ac?.empty_weight || 0),
  }), [wb.totalW, wb.cg, wb.ldgW, ac])

  const ldgEnvelopeUrl = useMemo(() => renderEnvelopeToDataUrl({
    gw: wb.ldgW || 0, cg: wb.ldgCG || 0,
    limitsNormal: ac?.limits_normal, limitsUtility: ac?.limits_utility,
    showPoint: (wb.ldgW || 0) > 0,
  }), [wb.ldgW, wb.ldgCG, ac])

  if (!ac) return null

  const { totalW, totalM, cg } = calcWB(ac, state.wbInputs)
  const fd = state.fuelData
  const tfobGal = parseFloat(state.wbInputs['fuel']) || 0
  const fuel = calcFuel({
    flowGal: fd.flowGal, flowKg: fd.flowKg,
    taxiMin: fd.taxiMin, tripMin: fd.tripMin,
    rarMin: fd.rarMin, alt1Min: fd.alt1Min, alt2Min: fd.alt2Min,
    reserveMin: fd.reserveMin, minReqMin: fd.minReqMin, tfobGal,
  })
  const fmtG = (v) => (v != null && v !== 0) ? v.toFixed(2) : ''
  const fmtK = (v) => (v != null && v !== 0) ? v.toFixed(1) : ''
  const fmtMin = (v) => (v != null && v !== 0) ? String(Math.round(v)) : ''

  const momentHeader = ac.moment_div1000 ? 'Momento (lb·in/1000)' : 'Momento (lb·in)'

  // Fuel burn for W&B print table
  const fuelStation = ac.stations.find(s => s.is_fuel)
  const burnGal = parseFloat(state.fuelBurn) || 0
  const burnW = burnGal * ac.fuel_lb_gal

  // Nav table calculations
  const navRows = state.navRows
  const totalNM = parseFloat(navRows.reduce((s, r) => s + (parseFloat(r.nm) || 0), 0).toFixed(2))
  const totalFuelReq = parseFloat(navRows.reduce((s, r) => s + (parseFloat(r['fuel-req']) || 0), 0).toFixed(2))
  const fuelActCalc = []
  navRows.forEach((r, i) => {
    if (i === 0) {
      fuelActCalc.push(r['fuel-act'] || '')
    } else {
      const prev = parseFloat(fuelActCalc[i - 1]) || 0
      const req = parseFloat(r['fuel-req']) || 0
      fuelActCalc.push(fuelActCalc[i - 1] !== '' ? (prev - req).toFixed(2) : '')
    }
  })

  return (
    <div id="print-area" translate="no" className="notranslate print-sheet bg-white text-[10px] leading-tight text-gray-800 max-w-[1000px] mx-auto px-1">
      {/* 1. Header */}
      <div className="flex items-center justify-between border-b-2 border-[#1a3a5c] pb-0.5 mb-1">
        <div>
          <div className="text-sm font-bold text-[#1a3a5c]">CAAA, S.A. de C.V.</div>
          <div className="text-[9px] text-gray-500">Centro de Adiestramiento Aereo Academico</div>
        </div>
        <div className="text-center">
          <div className="text-xs font-bold text-[#1a3a5c] uppercase tracking-wider">Load Sheet</div>
          <div className="text-[9px] text-gray-600">{ac.sheet || ac.model}</div>
        </div>
        <div className={`px-3 py-1 rounded text-[10px] font-bold ${wb.allOk ? 'bg-green-100 text-green-800 border border-green-300' : 'bg-red-100 text-red-800 border border-red-300'}`}>
          {wb.allOk ? 'LISTO' : 'REQUIERE REVISION'}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {/* LEFT COLUMN */}
        <div className="space-y-1">
          {/* 2. W&B Table */}
          <table className="w-full border-collapse border border-gray-400 text-[9px]">
            <thead>
              <tr className="bg-[#1a3a5c] text-white">
                <th className="text-left px-1.5 py-px font-semibold">Estacion</th>
                <th className="text-right px-1.5 py-px font-semibold w-14">Peso (lb)</th>
                <th className="text-right px-1.5 py-px font-semibold w-14">Brazo (in)</th>
                <th className="text-right px-1.5 py-px font-semibold w-16">{momentHeader}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-300">
                <td className="px-1.5 py-px">Empty Weight</td>
                <td className="px-1.5 py-px text-right font-mono">{ac.empty_weight.toLocaleString()}</td>
                <td className="px-1.5 py-px text-right font-mono">{ac.empty_arm}</td>
                <td className="px-1.5 py-px text-right font-mono">{fmtMoment(ac.empty_weight * ac.empty_arm, ac)}</td>
              </tr>
              {ac.oil && (
                <tr className="border-b border-gray-300">
                  <td className="px-1.5 py-px">{ac.oil.label}</td>
                  <td className="px-1.5 py-px text-right font-mono">{ac.oil.weight}</td>
                  <td className="px-1.5 py-px text-right font-mono">{ac.oil.arm}</td>
                  <td className="px-1.5 py-px text-right font-mono">{fmtMoment(ac.oil.weight * ac.oil.arm, ac)}</td>
                </tr>
              )}
              {ac.stations.map(s => {
                const raw = state.wbInputs[s.id]
                const val = parseFloat(raw) || 0
                const w = s.is_fuel ? val * ac.fuel_lb_gal : val
                return (
                  <Fragment key={s.id}>
                    <tr className="border-b border-gray-300">
                      <td className="px-1.5 py-px">{s.label}</td>
                      <td className="px-1.5 py-px text-right font-mono">{w ? (s.is_fuel ? `${val} gal = ${w.toFixed(1)}` : w) : ''}</td>
                      <td className="px-1.5 py-px text-right font-mono">{s.arm}</td>
                      <td className="px-1.5 py-px text-right font-mono">{w ? fmtMoment(w * s.arm, ac) : ''}</td>
                    </tr>
                    {s.is_fuel && state.fuelBurn && (
                      <tr className="border-b border-gray-300 bg-amber-50">
                        <td className="px-1.5 py-px pl-4 text-amber-700">↳ Consumo estimado</td>
                        <td className="px-1.5 py-px text-right font-mono text-amber-700">−{burnW.toFixed(1)}</td>
                        <td className="px-1.5 py-px text-right font-mono text-amber-700">{fuelStation?.arm || ''}</td>
                        <td className="px-1.5 py-px text-right font-mono text-amber-700">{fmtMoment(-(burnW * (fuelStation?.arm || 0)), ac)}</td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              <tr className="bg-[#e8f0f8] font-bold border-t-2 border-[#1a3a5c]">
                <td className="px-1.5 py-px text-[#1a3a5c]">TOTAL DESPEGUE</td>
                <td className="px-1.5 py-px text-right font-mono text-[#1a3a5c]">{totalW.toLocaleString()}</td>
                <td className="px-1.5 py-px text-right font-mono text-[#1a3a5c]">{cg.toFixed(2)}</td>
                <td className="px-1.5 py-px text-right font-mono text-[#1a3a5c]">{fmtMoment(totalM, ac)}</td>
              </tr>
              {wb.ldgW > 0 && (
                <tr className="bg-[#d4e8f8] font-bold border-t border-[#1a3a5c]">
                  <td className="px-1.5 py-px text-[#1a3a5c]">TOTAL ATERRIZAJE</td>
                  <td className="px-1.5 py-px text-right font-mono text-[#1a3a5c]">{Math.round(wb.ldgW).toLocaleString()}</td>
                  <td className="px-1.5 py-px text-right font-mono text-[#1a3a5c]">{(wb.ldgCG || 0).toFixed(2)}</td>
                  <td className="px-1.5 py-px text-right font-mono text-[#1a3a5c]">{fmtMoment(wb.ldgM || 0, ac)}</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* 3. Performance Limits */}
          <div className="border border-gray-400 rounded p-1">
            <div className="text-[9px] font-bold text-[#1a3a5c] uppercase mb-0.5">Limites de Rendimiento</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px]">
              <span className="text-gray-500">Max Takeoff Weight:</span><span className="font-mono">{ac.max_gross.toLocaleString()} lb</span>
              <span className="text-gray-500">Max Landing Weight:</span><span className="font-mono">{ac.max_landing.toLocaleString()} lb</span>
              {ac.max_useful_load && <><span className="text-gray-500">Max Useful Load:</span><span className="font-mono">{ac.max_useful_load.toLocaleString()} lb</span></>}
              <span className="text-gray-500">Fuel Capacity:</span><span className="font-mono">{ac.fuel_cap_gal} gal ({ac.fuel_usable_gal} usable)</span>
              <span className="text-gray-500">Fuel Burn:</span><span className="font-mono">{ac.fuel_burn_note}</span>
            </div>
          </div>

          {/* 4. Identification */}
          <div className="border border-gray-400 rounded p-1">
            <div className="text-[9px] font-bold text-[#1a3a5c] uppercase mb-0.5">Identificacion</div>
            <div className="grid grid-cols-4 gap-x-2 gap-y-1 text-[9px]">
              {[
                ['DEP', state.identification.dep], ['DEST', state.identification.dest],
                ['DATE', state.identification.date || state.flightData.date], ['REG', ac.reg],
                ['TYPE', ac.model], ['PIC', state.flightData.instructor],
                ['Alumno', state.identification.student || state.flightData.student],
                ['Lic. Alumno', state.flightData.license],
                ['Instructor', state.flightData.instructor],
                ['Lic. Inst.', state.flightData.instructorLicense],
                ['SIGN', state.identification.sign],
              ].map(([l, v]) => (
                <div key={l}><span className="text-gray-500 text-[8px]">{l}: </span><span className="font-semibold">{v}</span></div>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-x-2 mt-0.5 text-[9px]">
              <div><span className="text-gray-500 text-[8px]">TOM: </span><span className="font-mono font-semibold">{Math.round(totalW)} lb</span></div>
              <div><span className="text-gray-500 text-[8px]">LM: </span><span className="font-mono font-semibold">{Math.round(wb.ldgW || 0)} lb</span></div>
              <div><span className="text-gray-500 text-[8px]">TCG: </span><span className="font-mono font-semibold">{cg.toFixed(2)} in</span></div>
              <div><span className="text-gray-500 text-[8px]">LCG: </span><span className="font-mono font-semibold">{(wb.ldgCG || 0).toFixed(2)} in</span></div>
            </div>
          </div>

          {/* 6. Nav table compact */}
          {navRows.some(r => r.waypoint || r.nm) && (
            <div>
              <div className="text-[9px] font-bold text-[#1a3a5c] uppercase mb-0.5">Plan de Navegacion</div>
              <table className="w-full border-collapse border border-gray-400 text-[8px]">
                <thead>
                  <tr className="bg-[#1a3a5c] text-white">
                    <th className="px-1 py-px">WPT</th><th className="px-1 py-px">ALT</th>
                    <th className="px-1 py-px">TC</th><th className="px-1 py-px">MH</th>
                    <th className="px-1 py-px">TAS</th><th className="px-1 py-px">GS</th>
                    <th className="px-1 py-px">NM</th><th className="px-1 py-px">ACUM</th>
                    <th className="px-1 py-px">ETE</th>
                    <th className="px-1 py-px">ETA</th>
                    <th className="px-1 py-px">REQ</th>
                    <th className="px-1 py-px">REM</th>
                  </tr>
                </thead>
                <tbody>
                  {navRows.map((r, i) => {
                    const acumVal = navRows.slice(0, i + 1).reduce((s, row) => s + (parseFloat(row.nm) || 0), 0)
                    return (
                      <tr key={i} className="border-b border-gray-300">
                        <td className="px-1 py-px">{r.waypoint || ''}</td>
                        <td className="px-1 py-px text-center">{r.altfl || ''}</td>
                        <td className="px-1 py-px text-center">{r.tc || ''}</td>
                        <td className="px-1 py-px text-center">{r.mh || ''}</td>
                        <td className="px-1 py-px text-center">{r.tas || ''}</td>
                        <td className="px-1 py-px text-center">{r.gs || ''}</td>
                        <td className="px-1 py-px text-center">{r.nm || ''}</td>
                        <td className="px-1 py-px text-center">{acumVal || ''}</td>
                        <td className="px-1 py-px text-center">{r['ete-h'] && r['ete-m'] ? `${r['ete-h']}:${r['ete-m']}` : r['ete-h'] || r['ete-m'] || ''}</td>
                        <td className="px-1 py-px text-center">{r['eta-h'] && r['eta-m'] ? `${r['eta-h']}:${r['eta-m']}` : ''}</td>
                        <td className="px-1 py-px text-center">{r['fuel-req'] || ''}</td>
                        <td className="px-1 py-px text-center">{fuelActCalc[i]}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-[#e8f0f8] font-bold border-t-2 border-[#1a3a5c]">
                    <td className="px-1 py-px text-[#1a3a5c]" colSpan={6}>TOTAL</td>
                    <td className="px-1 py-px text-center font-mono text-[#1a3a5c]">{totalNM || ''}</td>
                    <td className="px-1 py-px text-center font-mono text-[#1a3a5c]">{totalNM || ''}</td>
                    <td></td>
                    <td></td>
                    <td className="px-1 py-px text-center font-mono text-[#1a3a5c]">{totalFuelReq || ''}</td>
                    <td className="px-1 py-px text-center font-mono text-[#1a3a5c]">{fuelActCalc[fuelActCalc.length - 1] || ''}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-1">
          {/* 5. Envelope charts */}
          <div className="grid grid-cols-2 gap-1.5">
            <div className="border border-gray-400 rounded p-1">
              <div className="text-[8px] font-bold text-gray-500 uppercase mb-0.5">Envolvente — Despegue</div>
              <img src={toEnvelopeUrl} alt="Envolvente Despegue" style={{ width: '100%', height: 'auto', display: 'block' }} />
            </div>
            <div className="border border-gray-400 rounded p-1">
              <div className="text-[8px] font-bold text-gray-500 uppercase mb-0.5">Envolvente — Aterrizaje</div>
              <img src={ldgEnvelopeUrl} alt="Envolvente Aterrizaje" style={{ width: '100%', height: 'auto', display: 'block' }} />
            </div>
          </div>

          {/* 10. Operations */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: 'dep', title: 'Salida' },
              { key: 'dest', title: 'Destino' },
              { key: 'alt', title: 'Alternado' },
            ].map(sec => (
              <div key={sec.key} className="border border-gray-400 rounded overflow-hidden">
                <div className="bg-[#1a3a5c] text-white px-1.5 py-px text-[8px] font-bold uppercase">{sec.title}</div>
                <div className="p-1">
                  {[['AP', 'ap'], ['RWY', 'rwy'], ['APPR', 'appr'], ['VIS', 'vis'], ['CEIL', 'ceil']].map(([l, f]) => (
                    <div key={f} className="flex justify-between py-px border-b border-dashed border-gray-200 last:border-0 text-[8px]">
                      <span className="text-gray-500">{l}</span>
                      <span className="font-semibold">{state.opsData[sec.key][f] || ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {state.opsData.remarks && (
            <div className="text-[8px] text-gray-700 border border-gray-300 rounded px-2 py-1 mt-1">
              <span className="font-bold text-gray-500 uppercase">Ruta: </span>{state.opsData.remarks}
            </div>
          )}

          {/* 7. Fuel table */}
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <div className="text-[9px] font-bold text-[#1a3a5c] uppercase">Combustible</div>
              <div className="text-[7px] text-gray-500">
                {fd.power && <span className="mr-2">PWR: {fd.power}%</span>}
                {fd.flowGal && <span className="mr-2">FLOW: {fd.flowGal} gal/h</span>}
                {fd.flowKg && <span>({fd.flowKg} KG/h)</span>}
              </div>
            </div>
            <table className="w-full border-collapse border border-gray-400 text-[8px]">
              <thead>
                <tr className="bg-[#1a3a5c] text-white">
                  <th className="text-left px-1 py-px">Desc.</th>
                  <th className="text-right px-1 py-px w-12">US gal</th>
                  <th className="text-right px-1 py-px w-10">KG</th>
                  <th className="text-right px-1 py-px w-10">TIME</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['TAXI',    fmtG(fuel.taxiGal),    fmtK(fuel.taxiKg),    fd.taxiMin || ''],
                  ['TRIP',    fmtG(fuel.tripGal),    fmtK(fuel.tripKg),    fd.tripMin || ''],
                  ['R/R 5%',  fmtG(fuel.rarGal),     fmtK(fuel.rarKg),     fd.rarMin || ''],
                  ['ALT 1',   fmtG(fuel.alt1Gal),    fmtK(fuel.alt1Kg),    fd.alt1Min || ''],
                  ['ALT 2',   fmtG(fuel.alt2Gal),    fmtK(fuel.alt2Kg),    fd.alt2Min || ''],
                  ['RESERVE', fmtG(fuel.reserveGal), fmtK(fuel.reserveKg), fd.reserveMin || ''],
                  ['MIN REQ', fmtG(fuel.minReqGal),  fmtK(fuel.minReqKg),  fmtMin(fuel.minReqMin)],
                  ['EXTRA',   fmtG(fuel.extraGal),   fmtK(fuel.extraKg),   fmtMin(fuel.extraMin)],
                  ['TFOB',    fmtG(fuel.tfobGal),    fmtK(fuel.tfobKg),    fmtMin(fuel.tfobMin)],
                ].map(([label, gal, kg, time], i) => (
                  <tr key={i} className={`border-b border-gray-300 ${label === 'MIN REQ' || label === 'TFOB' ? 'font-bold bg-[#e8f0f8]' : ''} ${label === 'EXTRA' ? 'font-bold' : ''}`}>
                    <td className="px-1 py-px">{label}</td>
                    <td className="px-1 py-px text-right font-mono">{gal}</td>
                    <td className="px-1 py-px text-right font-mono">{kg}</td>
                    <td className="px-1 py-px text-right font-mono">{time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 8. Times */}
          <div>
            <div className="text-[9px] font-bold text-[#1a3a5c] uppercase mb-0.5">Tiempos</div>
            <div className="grid grid-cols-4 gap-1 text-[9px]">
              {[['TOD', 'tod'], ['LD', 'ld'], ['ETD', 'etd'], ['ATD', 'atd'], ['ETA', 'eta'], ['ATA', 'ata'], ['EET', 'eet'], ['TOTAL', 'total']].map(([l, f]) => (
                <div key={f} className="border border-gray-300 rounded px-1.5 py-px">
                  <span className="text-gray-500 text-[8px]">{l}: </span>
                  <span className="font-mono font-semibold">{state.timesData[f] || '—'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 9. ATIS */}
          <div className="grid grid-cols-2 gap-2 text-[9px]">
            <div className="border border-gray-300 rounded px-1.5 py-px">
              <span className="text-gray-500 text-[8px]">DEP ATIS: </span><span className="font-semibold">{state.depAtis || '—'}</span>
            </div>
            <div className="border border-gray-300 rounded px-1.5 py-px">
              <span className="text-gray-500 text-[8px]">ARR ATIS: </span><span className="font-semibold">{state.arrAtis || '—'}</span>
            </div>
          </div>

          {/* 11. Notes */}
          {state.notes && (
            <div className="border border-gray-300 rounded p-1.5 text-[9px]">
              <span className="text-gray-500 text-[8px] font-bold uppercase">Notas: </span>
              <span>{state.notes}</span>
            </div>
          )}
        </div>
      </div>

      {/* 12. Signature footer */}
      <div className="grid grid-cols-3 gap-6 mt-1 pt-1 border-t border-gray-400">
        {[
          ['Firma del Alumno', state.flightData.student, state.flightData.license],
          ['Firma del Instructor', state.flightData.instructor, state.flightData.instructorLicense],
          ['Flight Dispatch (Turno)', '', ''],
        ].map(([label, name, lic]) => (
          <div key={label} className="text-center">
            <div className="border-b border-black mb-0.5 h-5"></div>
            <div className="text-[9px] text-gray-600 font-semibold">{label}</div>
            {name && <div className="text-[8px] text-gray-500">{name}{lic ? ` · Lic: ${lic}` : ''}</div>}
            {!name && <div className="text-[8px] text-gray-400">Nombre: ________________________</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
