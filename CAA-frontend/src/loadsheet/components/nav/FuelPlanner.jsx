import { useMemo } from 'react'
import { useLoadSheet } from '../../context/LoadSheetContext'
import { calcFuel } from '../../utils/fuelCalc'

export default function FuelPlanner() {
  const { state, dispatch } = useLoadSheet()
  const fd = state.fuelData

  // TFOB comes from the W&B fuel input (gallons loaded in Step 2)
  const tfobGal = parseFloat(state.wbInputs['fuel']) || 0

  const fuel = useMemo(() => calcFuel({
    flowGal: fd.flowGal,
    flowKg: fd.flowKg,
    taxiMin: fd.taxiMin,
    tripMin: fd.tripMin,
    rarMin: fd.rarMin,
    alt1Min: fd.alt1Min,
    alt2Min: fd.alt2Min,
    reserveMin: fd.reserveMin,
    minReqMin: fd.minReqMin,
    tfobGal,
  }), [fd, tfobGal])

  const setField = (field, value) => dispatch({ type: 'SET_FUEL_DATA', field, value })

  const thClass = 'text-left px-2 py-1.5 font-semibold text-[10px]'
  const labelClass = 'px-2 py-1.5 text-xs font-medium text-gray-600 bg-gray-50'
  const valClass = 'px-2 py-1.5 text-xs text-right font-mono text-gray-700 bg-gray-50'
  const inputClass = 'w-full px-1.5 py-1 border-0 bg-transparent text-xs text-right font-mono focus:outline-none focus:bg-blue-50 min-h-[36px]'
  const autoClass = 'px-2 py-1.5 text-xs text-right font-mono text-gray-500 bg-gray-100'

  const fmtGal = (v) => (v != null && v !== 0) ? v.toFixed(2) : ''
  const fmtKg  = (v) => (v != null && v !== 0) ? v.toFixed(1) : ''
  const fmtMin = (v) => (v != null && v !== 0) ? Math.round(v).toString() : ''

  return (
    <div className="space-y-4">

      {/* ── Tabla 1: Configuración de vuelo ── */}
      <div>
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Configuración de vuelo</p>
        <table className="w-full text-sm border-collapse border border-gray-300">
          <thead>
            <tr className="bg-[#1a3a5c] text-white text-[10px]">
              <th className={thClass}>PARÁMETRO</th>
              <th className="text-right px-2 py-1.5 font-semibold text-[10px] w-28">VALOR</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-200">
              <td className={labelClass}>POWER SETTING (%)</td>
              <td className="p-0">
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  max="100"
                  value={fd.power}
                  onChange={e => setField('power', e.target.value)}
                  placeholder="—"
                />
              </td>
            </tr>
            <tr className="border-b border-gray-200">
              <td className={labelClass}>FUEL FLOW (US gal/h)</td>
              <td className="p-0">
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="0.1"
                  value={fd.flowGal}
                  onChange={e => setField('flowGal', e.target.value)}
                  placeholder="—"
                />
              </td>
            </tr>
            <tr>
              <td className={labelClass}>FUEL FLOW (KG/h)</td>
              <td className="p-0">
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="0.1"
                  value={fd.flowKg}
                  onChange={e => setField('flowKg', e.target.value)}
                  placeholder="—"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Tabla 2: Combustible requerido ── */}
      <div>
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Combustible requerido</p>
        <table className="w-full text-sm border-collapse border border-gray-300">
          <thead>
            <tr className="bg-[#1a3a5c] text-white text-[10px]">
              <th className={thClass + ' w-auto'}>COMBUSTIBLE</th>
              <th className="text-right px-2 py-1.5 font-semibold text-[10px] w-16">US gal</th>
              <th className="text-right px-2 py-1.5 font-semibold text-[10px] w-14">KG</th>
              <th className="text-right px-2 py-1.5 font-semibold text-[10px] w-16">TIME (min)</th>
            </tr>
          </thead>
          <tbody>
            {/* TAXI — TIME input */}
            <tr className="border-b border-gray-200">
              <td className={labelClass}>TAXI</td>
              <td className={autoClass}>{fmtGal(fuel.taxiGal)}</td>
              <td className={autoClass}>{fmtKg(fuel.taxiKg)}</td>
              <td className="p-0">
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  value={fd.taxiMin}
                  onChange={e => setField('taxiMin', e.target.value)}
                  placeholder="min"
                />
              </td>
            </tr>

            {/* TRIP — TIME input */}
            <tr className="border-b border-gray-200">
              <td className={labelClass}>TRIP</td>
              <td className={autoClass}>{fmtGal(fuel.tripGal)}</td>
              <td className={autoClass}>{fmtKg(fuel.tripKg)}</td>
              <td className="p-0">
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  value={fd.tripMin}
                  onChange={e => setField('tripMin', e.target.value)}
                  placeholder="min"
                />
              </td>
            </tr>

            {/* R/R 5% — TIME input manual (opcional, solo IFR) */}
            <tr className="border-b border-gray-200">
              <td className={labelClass}>R/R 5% (IFR)</td>
              <td className={autoClass}>{fmtGal(fuel.rarGal)}</td>
              <td className={autoClass}>{fmtKg(fuel.rarKg)}</td>
              <td className="p-0">
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  value={fd.rarMin}
                  onChange={e => setField('rarMin', e.target.value)}
                  placeholder="min"
                />
              </td>
            </tr>

            {/* ALT 1 — TIME input */}
            <tr className="border-b border-gray-200">
              <td className={labelClass}>ALT 1 (IFR)</td>
              <td className={autoClass}>{fmtGal(fuel.alt1Gal)}</td>
              <td className={autoClass}>{fmtKg(fuel.alt1Kg)}</td>
              <td className="p-0">
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  value={fd.alt1Min}
                  onChange={e => setField('alt1Min', e.target.value)}
                  placeholder="min"
                />
              </td>
            </tr>

            {/* ALT 2 — TIME input */}
            <tr className="border-b border-gray-200">
              <td className={labelClass}>ALT 2 (IFR si req)</td>
              <td className={autoClass}>{fmtGal(fuel.alt2Gal)}</td>
              <td className={autoClass}>{fmtKg(fuel.alt2Kg)}</td>
              <td className="p-0">
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  value={fd.alt2Min}
                  onChange={e => setField('alt2Min', e.target.value)}
                  placeholder="min"
                />
              </td>
            </tr>

            {/* FINAL RESERVE — TIME input manual */}
            <tr className="border-b border-gray-200">
              <td className={labelClass}>FINAL RESERVE</td>
              <td className={autoClass}>{fmtGal(fuel.reserveGal)}</td>
              <td className={autoClass}>{fmtKg(fuel.reserveKg)}</td>
              <td className="p-0">
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  value={fd.reserveMin}
                  onChange={e => setField('reserveMin', e.target.value)}
                  placeholder="min"
                />
              </td>
            </tr>

            {/* MIN REQUIRED — input manual del alumno */}
            <tr className="border-b border-gray-200 bg-[#e8f0f8]">
              <td className="px-2 py-1.5 text-xs font-bold text-[#1a3a5c]">MIN REQUIRED</td>
              <td className="px-2 py-1.5 text-xs text-right font-mono font-bold text-[#1a3a5c]">{fmtGal(fuel.minReqGal)}</td>
              <td className="px-2 py-1.5 text-xs text-right font-mono text-[#1a3a5c]">{fmtKg(fuel.minReqKg)}</td>
              <td className="p-0">
                <input
                  className={inputClass + ' font-bold text-[#1a3a5c]'}
                  type="number"
                  min="0"
                  value={fd.minReqMin}
                  onChange={e => setField('minReqMin', e.target.value)}
                  placeholder="min"
                />
              </td>
            </tr>

            {/* EXTRA — auto: TFOB − MIN REQUIRED */}
            <tr className="border-b border-gray-200">
              <td className={labelClass}>EXTRA</td>
              <td className={autoClass}>{fmtGal(fuel.extraGal)}</td>
              <td className={autoClass}>{fmtKg(fuel.extraKg)}</td>
              <td className={autoClass}>{fmtMin(fuel.extraMin)}</td>
            </tr>

            {/* TFOB — auto desde W&B, muestra gal + min */}
            <tr className="bg-[#e8f0f8]">
              <td className="px-2 py-2 text-xs font-bold text-[#1a3a5c]">TFOB</td>
              <td className="px-2 py-2 text-xs text-right font-mono font-bold text-[#1a3a5c]">{fmtGal(fuel.tfobGal)}</td>
              <td className="px-2 py-2 text-xs text-right font-mono text-[#1a3a5c]">{fmtKg(fuel.tfobKg)}</td>
              <td className="px-2 py-2 text-xs text-right font-mono font-bold text-[#1a3a5c]">{fmtMin(fuel.tfobMin)}</td>
            </tr>
          </tbody>
        </table>
        {tfobGal === 0 && (
          <p className="text-[10px] text-amber-600 mt-1">⚠ Ingresa el combustible en el Paso 2 (W&B) para calcular TFOB.</p>
        )}
      </div>
    </div>
  )
}
