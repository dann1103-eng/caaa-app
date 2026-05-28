import { useLoadSheet } from '../../context/LoadSheetContext'
import ActionBar from '../ActionBar'

const SECTIONS = [
  { key: 'dep', title: 'Salida (Departure)' },
  { key: 'dest', title: 'Destino (Destination)' },
  { key: 'alt', title: 'Alternado (Alternate)' },
]

const FIELDS = [
  { id: 'ap', label: 'Aeropuerto' },
  { id: 'rwy', label: 'Pista activa' },
  { id: 'appr', label: 'Tipo de aproximacion' },
  { id: 'vis', label: 'Visibilidad requerida' },
  { id: 'ceil', label: 'Techo requerido' },
]

export default function Step4Ops() {
  const { state, dispatch } = useLoadSheet()

  const inputClass = 'w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-[#1a3a5c] focus:ring-1 focus:ring-[#1a3a5c]'

  return (
    <div>
      <h2 className="text-sm font-bold text-[#1a3a5c] uppercase tracking-wider mb-4">Operaciones</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {SECTIONS.map(sec => (
          <div key={sec.key} className="border border-gray-300 rounded-lg overflow-hidden">
            <div className="bg-[#1a3a5c] text-white px-3 py-2 text-xs font-bold uppercase tracking-wider">
              {sec.title}
            </div>
            <div className="p-3 space-y-3">
              {FIELDS.map(f => {
                const label = f.id === 'appr' && sec.key === 'dep'
                  ? f.label + ' (en caso de retorno)'
                  : f.label
                return (
                  <div key={f.id}>
                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-0.5">{label}</label>
                    <input
                      className={inputClass}
                      value={state.opsData[sec.key][f.id] || ''}
                      inputMode={(f.id === 'rwy' || f.id === 'ceil') ? 'numeric' : undefined}
                      onChange={e => {
                        let v = e.target.value.toUpperCase()
                        if (f.id === 'rwy' || f.id === 'ceil') v = v.replace(/[^0-9]/g, '')
                        dispatch({ type: 'SET_OPS', section: sec.key, field: f.id, value: v })
                      }}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="border border-gray-300 rounded-lg overflow-hidden mb-4">
        <div className="bg-[#1a3a5c] text-white px-3 py-2 text-xs font-bold uppercase tracking-wider">
          Ruta (Remarks)
        </div>
        <div className="p-3">
          <textarea
            rows={3}
            className={`${inputClass} resize-none`}
            placeholder="Ej: Practica PPL maniobra sector 2..."
            value={state.opsData.remarks || ''}
            onChange={e => dispatch({ type: 'SET_OPS_REMARKS', payload: e.target.value.toUpperCase() })}
          />
        </div>
      </div>

      <ActionBar
        onBack={() => dispatch({ type: 'SET_STEP', payload: 2 })}
        onNext={() => dispatch({ type: 'SET_STEP', payload: 4 })}
      />
    </div>
  )
}
