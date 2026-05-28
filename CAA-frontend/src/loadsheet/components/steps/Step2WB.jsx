import { useLoadSheet } from '../../context/LoadSheetContext'
import { AIRCRAFT } from '../../data/aircraft'
import WBTable from '../wb/WBTable'
import ResultCards from '../wb/ResultCards'
import EnvelopeCanvas from '../wb/EnvelopeCanvas'
import StatusStrip from '../StatusStrip'
import ActionBar from '../ActionBar'

export default function Step2WB() {
  const { state, dispatch } = useLoadSheet()
  const ac = AIRCRAFT[state.currentAC]
  const wb = state.wbResults

  // Check if all required (non-baggage) stations have values
  const requiredStations = ac ? ac.stations.filter(s => !s.id.includes('bag')) : []
  const allRequiredFilled = requiredStations.length > 0 &&
    requiredStations.every(s => {
      const val = state.wbInputs[s.id]
      return val !== '' && val != null && !isNaN(parseFloat(val))
    })

  let statusApto = null
  let statusMsg = 'Ingresa los pesos para calcular el balance.'
  if (!allRequiredFilled) {
    statusApto = 'warning'
    statusMsg = 'Falta completar datos obligatorios'
  } else if (wb.allOk) {
    statusApto = true
    statusMsg = 'Peso y balance dentro de limites — LISTO'
  } else {
    statusApto = false
    statusMsg = 'Peso y balance fuera de limites — REQUIERE REVISION'
  }

  return (
    <div>
      <StatusStrip isApto={statusApto} message={statusMsg} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Left: Table + Results */}
        <div>
          <div className="overflow-x-auto">
            <WBTable />
          </div>
          <ResultCards />
        </div>

        {/* Right: Charts */}
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <EnvelopeCanvas
              gw={wb.totalW}
              cg={wb.cg}
              limitsNormal={ac?.limits_normal}
              limitsUtility={ac?.limits_utility}
              title="Envolvente — Despegue"
              showPoint={wb.totalW > (ac?.empty_weight || 0)}
            />
            <EnvelopeCanvas
              gw={wb.ldgW || 0}
              cg={wb.ldgCG || 0}
              limitsNormal={ac?.limits_normal}
              limitsUtility={ac?.limits_utility}
              title="Envolvente — Aterrizaje"
              showPoint={wb.ldgW > 0}
            />
          </div>
        </div>
      </div>

      <ActionBar
        onBack={() => dispatch({ type: 'SET_STEP', payload: 0 })}
        onNext={() => dispatch({ type: 'SET_STEP', payload: 2 })}
      />
    </div>
  )
}
