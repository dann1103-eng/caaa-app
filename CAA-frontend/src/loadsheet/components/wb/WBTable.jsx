import { useEffect, Fragment } from 'react'
import { useLoadSheet } from '../../context/LoadSheetContext'
import { AIRCRAFT } from '../../data/aircraft'
import { fmtMoment, calcWB, checkCGInEnvelope } from '../../utils/wbCalc'

export default function WBTable() {
  const { state, dispatch } = useLoadSheet()
  const ac = AIRCRAFT[state.currentAC]
  if (!ac) return null

  const momentHeader = ac.moment_div1000 ? 'Momento (lb·in/1000)' : 'Momento (lb·in)'

  // Recalculate on every input change
  useEffect(() => {
    const { totalW, totalM, cg } = calcWB(ac, state.wbInputs)
    const overweight = totalW > ac.max_gross
    const envCheck = checkCGInEnvelope(totalW, cg, ac.limits_normal)
    const cgOk = envCheck.inside
    const allOk = !overweight && cgOk && totalW > ac.empty_weight

    // Landing CG
    const fuelStation = ac.stations.find(s => s.is_fuel)
    const burnGal = parseFloat(state.fuelBurn) || 0
    const burnW = burnGal * ac.fuel_lb_gal
    const ldgW = totalW - burnW
    const ldgM = totalM - (burnW * (fuelStation?.arm || 0))
    const ldgCG = ldgW > 0 ? ldgM / ldgW : 0
    const ldgEnv = checkCGInEnvelope(ldgW, ldgCG, ac.limits_normal)

    dispatch({
      type: 'SET_WB_RESULTS',
      payload: {
        totalW, totalM, cg,
        cgOk, overweight, allOk,
        fwd: envCheck.fwd, aft: envCheck.aft,
        ldgW, ldgM, ldgCG, ldgCgOk: ldgEnv.inside,
      }
    })
  }, [state.wbInputs, state.currentAC, state.fuelBurn])

  const { totalW, totalM, cg } = calcWB(ac, state.wbInputs)

  const fuelStation = ac.stations.find(s => s.is_fuel)
  const burnGal = parseFloat(state.fuelBurn) || 0
  const burnW = burnGal * ac.fuel_lb_gal

  const wb = state.wbResults

  return (
    <div className="overflow-x-auto mb-4">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-[#1a3a5c] text-white text-xs">
            <th className="text-left px-2 py-2 font-semibold">Estacion</th>
            <th className="text-right px-2 py-2 font-semibold w-20">Peso (lb)</th>
            <th className="text-right px-2 py-2 font-semibold w-20">Brazo (in)</th>
            <th className="text-right px-2 py-2 font-semibold w-24">{momentHeader}</th>
          </tr>
        </thead>
        <tbody>
          {/* Empty weight row */}
          <tr className="border-b border-gray-200 bg-gray-50">
            <td className="px-2 py-1.5 text-xs font-medium text-gray-600">Empty Weight</td>
            <td className="px-2 py-1.5 text-right text-xs font-mono">{ac.empty_weight.toLocaleString()}</td>
            <td className="px-2 py-1.5 text-right text-xs font-mono">{ac.empty_arm}</td>
            <td className="px-2 py-1.5 text-right text-xs font-mono">{fmtMoment(ac.empty_weight * ac.empty_arm, ac)}</td>
          </tr>

          {/* Oil row (only PA-28 variants) */}
          {ac.oil && (
            <tr className="border-b border-gray-200 bg-gray-50">
              <td className="px-2 py-1.5 text-xs font-medium text-gray-600">{ac.oil.label}</td>
              <td className="px-2 py-1.5 text-right text-xs font-mono">{ac.oil.weight}</td>
              <td className="px-2 py-1.5 text-right text-xs font-mono">{ac.oil.arm}</td>
              <td className="px-2 py-1.5 text-right text-xs font-mono">{fmtMoment(ac.oil.weight * ac.oil.arm, ac)}</td>
            </tr>
          )}

          {/* Variable station rows */}
          {ac.stations.map(s => {
            const rawVal = state.wbInputs[s.id] ?? ''
            const numVal = parseFloat(rawVal) || 0
            const weight = s.is_fuel ? numVal * ac.fuel_lb_gal : numVal
            const moment = weight * s.arm
            const maxVal = s.is_fuel ? s.max_gal : s.max
            const capVal = s.is_fuel ? ac.fuel_cap_gal : null
            const isOver = capVal ? numVal > capVal : (maxVal && numVal > maxVal)
            const isWarn = maxVal && !isOver && numVal > maxVal

            return (
              <Fragment key={s.id}>
                <tr className="border-b border-gray-200">
                  <td className="px-2 py-1.5 text-xs font-medium text-gray-600">{s.label}</td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="number"
                      min="0"
                      step={s.is_fuel ? '0.5' : '1'}
                      value={rawVal}
                      onChange={e => dispatch({ type: 'SET_WB_INPUT', id: s.id, value: e.target.value })}
                      placeholder={s.is_fuel ? 'gal' : 'lb'}
                      className={`w-20 px-1.5 py-1 border rounded text-xs text-right font-mono focus:outline-none focus:ring-1 ${
                        isOver ? 'border-red-500 bg-red-50 focus:ring-red-500' :
                        isWarn ? 'border-amber-500 bg-amber-50 focus:ring-amber-500' :
                        'border-gray-300 focus:border-[#1a3a5c] focus:ring-[#1a3a5c]'
                      }`}
                    />
                    {s.is_fuel && rawVal && <span className="text-[10px] text-gray-400 ml-1">= {weight.toFixed(1)} lb</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right text-xs font-mono text-gray-500">{s.arm}</td>
                  <td className="px-2 py-1.5 text-right text-xs font-mono">{rawVal ? fmtMoment(moment, ac) : ''}</td>
                </tr>

                {/* Combustible de quema estimada — right after fuel row */}
                {s.is_fuel && (
                  <tr className="border-b border-gray-200 bg-amber-50">
                    <td className="px-2 py-1.5 text-xs font-medium text-amber-700 pl-6">↳ Consumo estimado (gal)</td>
                    <td className="px-2 py-1.5 text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={state.fuelBurn}
                        onChange={e => dispatch({ type: 'SET_FUEL_BURN', payload: e.target.value })}
                        placeholder="gal"
                        className="w-20 px-1.5 py-1 border border-amber-300 rounded text-xs text-right font-mono focus:outline-none focus:ring-1 focus:border-amber-500 focus:ring-amber-400 bg-white"
                      />
                      {state.fuelBurn && <span className="text-[10px] text-amber-600 ml-1">= −{burnW.toFixed(1)} lb</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right text-xs font-mono text-amber-600">{fuelStation?.arm || ''}</td>
                    <td className="px-2 py-1.5 text-right text-xs font-mono text-amber-600">
                      {state.fuelBurn ? fmtMoment(-(burnW * (fuelStation?.arm || 0)), ac) : ''}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}

          {/* TOTAL DESPEGUE */}
          <tr className="bg-[#e8f0f8] font-bold border-t-2 border-[#1a3a5c]">
            <td className="px-2 py-2 text-xs text-[#1a3a5c]">TOTAL DESPEGUE</td>
            <td className="px-2 py-2 text-right text-xs font-mono text-[#1a3a5c]">{totalW.toLocaleString()}</td>
            <td className="px-2 py-2 text-right text-xs font-mono text-[#1a3a5c]">{cg.toFixed(2)}</td>
            <td className="px-2 py-2 text-right text-xs font-mono text-[#1a3a5c]">{fmtMoment(totalM, ac)}</td>
          </tr>

          {/* TOTAL ATERRIZAJE */}
          <tr className="bg-[#d4e8f8] font-bold border-t border-[#1a3a5c]">
            <td className="px-2 py-2 text-xs text-[#1a3a5c]">TOTAL ATERRIZAJE</td>
            <td className="px-2 py-2 text-right text-xs font-mono text-[#1a3a5c]">
              {wb.ldgW ? Math.round(wb.ldgW).toLocaleString() : ''}
            </td>
            <td className="px-2 py-2 text-right text-xs font-mono text-[#1a3a5c]">
              {wb.ldgCG ? wb.ldgCG.toFixed(2) : ''}
            </td>
            <td className="px-2 py-2 text-right text-xs font-mono text-[#1a3a5c]">
              {wb.ldgM ? fmtMoment(wb.ldgM, ac) : ''}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
