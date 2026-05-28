import { useLoadSheet } from '../context/LoadSheetContext'

const STEPS = [
  { num: 1, label: 'Aeronave & Vuelo' },
  { num: 2, label: 'Peso & Balance' },
  { num: 3, label: 'Navegacion & Combustible' },
  { num: 4, label: 'Operaciones' },
  { num: 5, label: 'Resumen & Envio' },
]

export default function StepNav() {
  const { state, dispatch } = useLoadSheet()
  return (
    <div className="flex mb-6 border border-gray-300 rounded-md overflow-hidden overflow-x-auto">
      {STEPS.map((s, i) => (
        <button
          key={i}
          onClick={() => dispatch({ type: 'SET_STEP', payload: i })}
          className={`flex-1 shrink-0 min-w-[80px] py-2.5 px-2 border-r border-gray-300 last:border-r-0 text-xs font-medium text-center transition-all cursor-pointer ${
            state.step === i
              ? 'bg-[#1a3a5c] text-white'
              : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
          }`}
        >
          <span className="block text-[10px] opacity-70 mb-0.5">PASO {s.num}</span>
          {s.label}
        </button>
      ))}
    </div>
  )
}
