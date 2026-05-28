import { useLoadSheet } from '../../context/LoadSheetContext'

const PLAN_COLS = [
  { id: 'altfl', label: 'ALT/FL', w: 52, numeric: true },
  { id: 'minalt', label: 'MIN ALT', w: 48, numeric: true },
  { id: 'wv', label: 'W/V', w: 52 },
  { id: 'tc', label: 'TC', w: 36, numeric: true },
  { id: 'var', label: 'VAR', w: 36 },
  { id: 'mc', label: 'MC', w: 36 },
  { id: 'wca', label: 'WCA', w: 36 },
  { id: 'mh', label: 'MH', w: 36 },
  { id: 'dev', label: 'DEV', w: 36 },
  { id: 'ch', label: 'CH', w: 36 },
  { id: 'tas', label: 'TAS', w: 48 },
  { id: 'gs', label: 'GS', w: 48 },
]

const filterNumeric = (v) => v.replace(/[^0-9.\-]/g, '')
const filterDigits = (v) => v.replace(/[^0-9]/g, '')

const EXEC_COLS = [
  { id: 'waypoint', label: 'WAYPOINT/DEP', w: 90 },
  { id: 'nm', label: 'NM', w: 38 },
  { id: 'acum', label: 'ACUM', w: 38, readonly: true },
]

export default function NavTable() {
  const { state, dispatch } = useLoadSheet()
  const rows = state.navRows

  // Calculate ACUM values
  const acumValues = []
  let acum = 0
  rows.forEach((row) => {
    const nm = parseFloat(row.nm) || 0
    acum += nm
    acumValues.push(acum)
  })
  const totalNM = parseFloat(rows.reduce((s, r) => s + (parseFloat(r.nm) || 0), 0).toFixed(2))

  // Calculate FUEL ACT cascade: first row is manual, subsequent rows = prev - fuel-req
  const fuelActValues = []
  rows.forEach((row, i) => {
    if (i === 0) {
      fuelActValues.push(row['fuel-act'] || '')
    } else {
      const prev = parseFloat(fuelActValues[i - 1]) || 0
      const req = parseFloat(row['fuel-req']) || 0
      const calc = prev - req
      fuelActValues.push(prev !== 0 || fuelActValues[i - 1] !== '' ? calc.toFixed(2) : '')
    }
  })

  const inputClass = 'w-full px-1 py-0.5 border-0 bg-transparent text-[11px] text-center font-mono focus:outline-none focus:bg-blue-50'
  const autoClass = 'w-full px-1 py-0.5 text-[11px] text-center font-mono text-gray-500 bg-gray-50'

  return (
    <div className="overflow-x-auto mb-4">
      <table className="text-[11px] border-collapse border border-gray-300" style={{ minWidth: '1050px' }}>
        <thead>
          <tr className="bg-[#1a3a5c] text-white">
            {PLAN_COLS.map(c => (
              <th key={c.id} className="px-1 py-1 font-semibold border-r border-blue-400" style={{ width: c.w, minWidth: c.w }}>{c.label}</th>
            ))}
            <th className="px-1 py-1 font-semibold border-l-3 border-l-white" style={{ width: 90, minWidth: 90, borderLeftWidth: '3px' }}>WAYPOINT</th>
            <th colSpan={2} className="px-1 py-1 font-semibold border-r border-blue-400">DISTANCE</th>
            <th colSpan={3} className="px-1 py-1 font-semibold border-r border-blue-400">ETE</th>
            <th colSpan={3} className="px-1 py-1 font-semibold border-r border-blue-400">ETA</th>
            <th colSpan={3} className="px-1 py-1 font-semibold border-r border-blue-400">ATA</th>
            <th colSpan={2} className="px-1 py-1 font-semibold">FUEL</th>
          </tr>
          <tr className="bg-[#1a3a5c] text-white text-[9px]">
            {PLAN_COLS.map(c => <th key={c.id} className="border-r border-blue-400"></th>)}
            <th className="border-r border-blue-400" style={{ borderLeftWidth: '3px', borderLeftColor: 'white' }}></th>
            <th className="px-1 border-r border-blue-400">NM</th>
            <th className="px-1 border-r border-blue-400">ACUM</th>
            <th className="px-1">hh</th>
            <th className="px-0">:</th>
            <th className="px-1 border-r border-blue-400">mm</th>
            <th className="px-1">hh</th>
            <th className="px-0">:</th>
            <th className="px-1 border-r border-blue-400">mm</th>
            <th className="px-1">hh</th>
            <th className="px-0">:</th>
            <th className="px-1 border-r border-blue-400">mm</th>
            <th className="px-1">REQ</th>
            <th className="px-1">ACT</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-200 hover:bg-gray-50">
              {PLAN_COLS.map(c => (
                <td key={c.id} className="border-r border-gray-200 p-0" style={{ width: c.w }}>
                  <input className={inputClass} inputMode={c.numeric ? 'numeric' : undefined} value={row[c.id] || ''} onChange={e => dispatch({ type: 'SET_NAV_ROW', index: i, col: c.id, value: c.numeric ? filterNumeric(e.target.value) : e.target.value })} />
                </td>
              ))}
              {/* Separator + Waypoint */}
              <td className="border-r border-gray-200 p-0" style={{ borderLeftWidth: '3px', borderLeftColor: '#1a3a5c' }}>
                <input className={`${inputClass} text-left px-2`} value={row.waypoint || ''} onChange={e => dispatch({ type: 'SET_NAV_ROW', index: i, col: 'waypoint', value: e.target.value })} />
              </td>
              <td className="border-r border-gray-200 p-0" style={{ width: 38 }}>
                <input className={inputClass} inputMode="numeric" value={row.nm || ''} onChange={e => dispatch({ type: 'SET_NAV_ROW', index: i, col: 'nm', value: filterNumeric(e.target.value) })} />
              </td>
              <td className="border-r border-gray-200 p-0 bg-gray-50 text-center font-mono text-[11px]" style={{ width: 38 }}>
                {acumValues[i] || ''}
              </td>
              {/* ETE hh:mm */}
              <td className="border-r-0 border-gray-200 p-0" style={{ width: 30 }}>
                <input className={inputClass} inputMode="numeric" maxLength={2} value={row['ete-h'] || ''} onChange={e => dispatch({ type: 'SET_NAV_ROW', index: i, col: 'ete-h', value: filterDigits(e.target.value) })} />
              </td>
              <td className="p-0 text-center text-[11px] text-gray-400" style={{ width: 6 }}>:</td>
              <td className="border-r border-gray-200 p-0" style={{ width: 24 }}>
                <input className={inputClass} inputMode="numeric" maxLength={2} value={row['ete-m'] || ''} onChange={e => dispatch({ type: 'SET_NAV_ROW', index: i, col: 'ete-m', value: filterDigits(e.target.value) })} />
              </td>
              {/* ETA hh:mm */}
              <td className="border-r-0 border-gray-200 p-0" style={{ width: 30 }}>
                <input className={inputClass} inputMode="numeric" maxLength={2} value={row['eta-h'] || ''} onChange={e => dispatch({ type: 'SET_NAV_ROW', index: i, col: 'eta-h', value: filterDigits(e.target.value) })} />
              </td>
              <td className="p-0 text-center text-[11px] text-gray-400" style={{ width: 6 }}>:</td>
              <td className="border-r border-gray-200 p-0" style={{ width: 24 }}>
                <input className={inputClass} inputMode="numeric" maxLength={2} value={row['eta-m'] || ''} onChange={e => dispatch({ type: 'SET_NAV_ROW', index: i, col: 'eta-m', value: filterDigits(e.target.value) })} />
              </td>
              {/* ATA hh:mm */}
              <td className="border-r-0 p-0" style={{ width: 30 }}>
                <input className={inputClass} inputMode="numeric" maxLength={2} value={row['ata-h'] || ''} onChange={e => dispatch({ type: 'SET_NAV_ROW', index: i, col: 'ata-h', value: filterDigits(e.target.value) })} />
              </td>
              <td className="p-0 text-center text-[11px] text-gray-400" style={{ width: 6 }}>:</td>
              <td className="border-r border-gray-200 p-0" style={{ width: 24 }}>
                <input className={inputClass} inputMode="numeric" maxLength={2} value={row['ata-m'] || ''} onChange={e => dispatch({ type: 'SET_NAV_ROW', index: i, col: 'ata-m', value: filterDigits(e.target.value) })} />
              </td>
              {/* Fuel REQ */}
              <td className="border-r border-gray-200 p-0" style={{ width: 48 }}>
                <input className={inputClass} inputMode="numeric" value={row['fuel-req'] || ''} onChange={e => dispatch({ type: 'SET_NAV_ROW', index: i, col: 'fuel-req', value: filterNumeric(e.target.value) })} />
              </td>
              {/* Fuel ACT: first row = input, rest = auto-calculated */}
              <td className="p-0" style={{ width: 48 }}>
                {i === 0 ? (
                  <input className={inputClass} inputMode="numeric" value={row['fuel-act'] || ''} onChange={e => dispatch({ type: 'SET_NAV_ROW', index: i, col: 'fuel-act', value: filterNumeric(e.target.value) })} />
                ) : (
                  <div className={autoClass}>{fuelActValues[i]}</div>
                )}
              </td>
            </tr>
          ))}
          {/* Total row */}
          <tr className="bg-[#e8f0f8] font-bold border-t-2 border-[#1a3a5c]">
            {PLAN_COLS.map(c => <td key={c.id} className="border-r border-gray-200"></td>)}
            <td className="px-2 text-[11px] text-[#1a3a5c]" style={{ borderLeftWidth: '3px', borderLeftColor: '#1a3a5c' }}>TOTAL</td>
            <td className="text-center text-[11px] font-mono text-[#1a3a5c]">{totalNM || ''}</td>
            <td className="text-center text-[11px] font-mono text-[#1a3a5c]">{acum || ''}</td>
            <td colSpan={3}></td>
            <td colSpan={6}></td>
            <td className="text-center text-[11px] font-mono text-[#1a3a5c]">
              {parseFloat(rows.reduce((s, r) => s + (parseFloat(r['fuel-req']) || 0), 0).toFixed(2)) || ''}
            </td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
