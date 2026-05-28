import { useLoadSheet } from '../../context/LoadSheetContext'
import { AIRCRAFT } from '../../data/aircraft'
import ActionBar from '../ActionBar'

const AC_KEYS = Object.keys(AIRCRAFT).filter(k => !AIRCRAFT[k].disabled)

export default function Step1Aircraft() {
  const { state, dispatch } = useLoadSheet()
  const ac = AIRCRAFT[state.currentAC]

  return (
    <div>
      <h2 className="text-sm font-bold text-[#1a3a5c] uppercase tracking-wider mb-4">Seleccionar Aeronave</h2>

      {/* Aircraft pill selector */}
      <div className="flex flex-wrap gap-2 mb-4">
        {AC_KEYS.map(key => (
          <button
            key={key}
            onClick={() => dispatch({ type: 'SET_AIRCRAFT', payload: key })}
            className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all cursor-pointer ${
              state.currentAC === key
                ? 'bg-[#1a3a5c] text-white border-[#1a3a5c]'
                : 'bg-white text-gray-600 border-gray-300 hover:border-[#1a3a5c] hover:text-[#1a3a5c]'
            }`}
          >
            {AIRCRAFT[key].reg}
          </button>
        ))}
      </div>

      {/* Specs bar */}
      <div className="bg-[#e8f0f8] rounded-md p-3 mb-6 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
        <div><span className="text-gray-500 block">Modelo</span><span className="font-semibold text-[#1a3a5c]">{ac.model}</span></div>
        <div><span className="text-gray-500 block">Peso Vacio</span><span className="font-semibold text-[#1a3a5c]">{ac.empty_weight.toLocaleString()} lb</span></div>
        <div><span className="text-gray-500 block">Peso Max</span><span className="font-semibold text-[#1a3a5c]">{ac.max_gross.toLocaleString()} lb</span></div>
        <div><span className="text-gray-500 block">Combustible</span><span className="font-semibold text-[#1a3a5c]">{ac.fuel_cap_gal} gal ({ac.fuel_usable_gal} usable)</span></div>
        <div><span className="text-gray-500 block">Consumo</span><span className="font-semibold text-[#1a3a5c]">{ac.fuel_burn_note}</span></div>
      </div>

      {/* Flight data form */}
      <h2 className="text-sm font-bold text-[#1a3a5c] uppercase tracking-wider mb-4">Datos del Vuelo</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Fecha</label>
          <input type="date" value={state.flightData.date} onChange={e => dispatch({ type: 'SET_FLIGHT_DATA', field: 'date', value: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-[#1a3a5c] focus:ring-1 focus:ring-[#1a3a5c]" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Hora (UTC)</label>
          <input type="text" value={state.flightData.time} onChange={e => dispatch({ type: 'SET_FLIGHT_DATA', field: 'time', value: e.target.value })}
            placeholder="HH:MM" pattern="[0-2][0-9]:[0-5][0-9]" maxLength={5}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-[#1a3a5c] focus:ring-1 focus:ring-[#1a3a5c]" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Nombre del Alumno</label>
          <input type="text" value={state.flightData.student} onChange={e => dispatch({ type: 'SET_FLIGHT_DATA', field: 'student', value: e.target.value.toUpperCase() })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-[#1a3a5c] focus:ring-1 focus:ring-[#1a3a5c]" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Licencia del Alumno</label>
          <input type="text" value={state.flightData.license} onChange={e => dispatch({ type: 'SET_FLIGHT_DATA', field: 'license', value: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-[#1a3a5c] focus:ring-1 focus:ring-[#1a3a5c]" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Nombre del Instructor</label>
          <input type="text" value={state.flightData.instructor} onChange={e => dispatch({ type: 'SET_FLIGHT_DATA', field: 'instructor', value: e.target.value.toUpperCase() })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-[#1a3a5c] focus:ring-1 focus:ring-[#1a3a5c]" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Licencia del Instructor</label>
          <input type="text" value={state.flightData.instructorLicense} onChange={e => dispatch({ type: 'SET_FLIGHT_DATA', field: 'instructorLicense', value: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-[#1a3a5c] focus:ring-1 focus:ring-[#1a3a5c]" />
        </div>
      </div>

      <ActionBar onNext={() => dispatch({ type: 'SET_STEP', payload: 1 })} />
    </div>
  )
}
