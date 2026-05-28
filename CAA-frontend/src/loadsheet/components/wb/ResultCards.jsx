import { useLoadSheet } from '../../context/LoadSheetContext'
import { AIRCRAFT } from '../../data/aircraft'

export default function ResultCards() {
  const { state } = useLoadSheet()
  const ac = AIRCRAFT[state.currentAC]
  const wb = state.wbResults
  if (!ac || !wb || wb.totalW <= ac.empty_weight) return null

  const cards = [
    {
      label: 'Peso Bruto',
      value: `${wb.totalW.toLocaleString()} lb`,
      ok: !wb.overweight,
      sub: wb.overweight ? `Excede max (${ac.max_gross.toLocaleString()} lb)` : `Dentro del limite`,
    },
    {
      label: 'CG Cargado',
      value: `${wb.cg.toFixed(2)} in`,
      ok: wb.cgOk,
      sub: wb.cgOk ? 'Dentro de envolvente' : 'Fuera de envolvente',
    },
    {
      label: 'Margen CG',
      value: wb.fwd && wb.aft ? `Fwd: ${(wb.cg - wb.fwd).toFixed(2)} | Aft: ${(wb.aft - wb.cg).toFixed(2)}` : '—',
      ok: wb.cgOk,
      sub: 'Distancia a limites',
    },
    {
      label: 'Estado W&B',
      value: wb.allOk ? 'LISTO ✓' : 'REVISAR ✗',
      ok: wb.allOk,
      sub: wb.allOk ? 'Listo para vuelo' : 'Verificar limites',
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      {cards.map(c => (
        <div key={c.label} className={`rounded-md border p-3 text-center ${c.ok ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">{c.label}</div>
          <div className={`text-sm font-bold ${c.ok ? 'text-green-700' : 'text-red-700'}`}>{c.value}</div>
          <div className={`text-[10px] mt-1 ${c.ok ? 'text-green-600' : 'text-red-600'}`}>{c.sub}</div>
        </div>
      ))}
    </div>
  )
}
