import { createContext, useContext, useReducer } from 'react'
import { AIRCRAFT } from '../data/aircraft'

const initialState = {
  idVuelo: null,
  readOnly: false,
  currentAC: 'pa28r180',
  step: 0,

  flightData: { date: new Date().toISOString().split('T')[0], time: '', student: '', license: '', instructor: '', instructorLicense: '' },

  wbInputs: {},
  wbResults: { totalW: 0, totalM: 0, cg: 0, cgOk: false, overweight: false, allOk: false },
  fuelBurn: '',

  navRows: [{}, {}, {}],
  fuelData: { power: '75', flowGal: '10', flowKg: '27.2', taxiMin: '', tripMin: '', rarMin: '', alt1Min: '', alt2Min: '', reserveMin: '', minReqMin: '' },
  timesData: { tod: '', ld: '', etd: '', atd: '', eta: '', ata: '', eet: '', total: '' },
  depAtis: '',
  arrAtis: '',
  notes: '',

  identification: { dep: '', dest: '', date: '', reg: '', type: '', pic: '', student: '', sign: '', tom: '', lm: '', tog: '', lcg: '' },

  opsData: {
    dep: { ap: '', rwy: '', appr: '', vis: '', ceil: '' },
    dest: { ap: '', rwy: '', appr: '', vis: '', ceil: '' },
    alt: { ap: '', rwy: '', appr: '', vis: '', ceil: '' },
    remarks: '',
  },

  submitStatus: 'idle',
}

function getDefaultFuelData(acKey) {
  const ac = AIRCRAFT[acKey]
  if (!ac) return {}
  const flowGal = ac.default_flow_gal || ''
  const flowKg = flowGal ? parseFloat((flowGal * ac.fuel_lb_gal * 0.453592).toFixed(1)) : ''
  return {
    power: String(ac.default_power || ''),
    flowGal: String(flowGal),
    flowKg: String(flowKg),
    taxiMin: '', tripMin: '', rarMin: '', alt1Min: '', alt2Min: '', reserveMin: '', minReqMin: '',
  }
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.payload }
    case 'SET_AIRCRAFT':
      return {
        ...state,
        currentAC: action.payload,
        wbInputs: {},
        fuelData: { ...state.fuelData, ...getDefaultFuelData(action.payload) },
      }
    case 'SET_FLIGHT_DATA':
      return { ...state, flightData: { ...state.flightData, [action.field]: action.value } }
    case 'SET_WB_INPUT':
      return { ...state, wbInputs: { ...state.wbInputs, [action.id]: action.value } }
    case 'SET_WB_RESULTS':
      return { ...state, wbResults: action.payload }
    case 'SET_FUEL_BURN':
      return { ...state, fuelBurn: action.payload }
    case 'SET_NAV_ROW': {
      const rows = [...state.navRows]
      rows[action.index] = { ...rows[action.index], [action.col]: action.value }
      return { ...state, navRows: rows }
    }
    case 'ADD_NAV_ROW':
      return { ...state, navRows: [...state.navRows, {}] }
    case 'SET_FUEL_DATA':
      return { ...state, fuelData: { ...state.fuelData, [action.field]: action.value } }
    case 'SET_TIMES':
      return { ...state, timesData: { ...state.timesData, [action.field]: action.value } }
    case 'SET_ATIS':
      return { ...state, [action.field]: action.value }
    case 'SET_NOTES':
      return { ...state, notes: action.payload }
    case 'SET_IDENTIFICATION':
      return { ...state, identification: { ...state.identification, [action.field]: action.value } }
    case 'SET_OPS':
      return { ...state, opsData: { ...state.opsData, [action.section]: { ...state.opsData[action.section], [action.field]: action.value } } }
    case 'SET_OPS_REMARKS':
      return { ...state, opsData: { ...state.opsData, remarks: action.payload } }
    case 'SET_SUBMIT_STATUS':
      return { ...state, submitStatus: action.payload }
    case 'RESET':
      return { ...initialState }
    default:
      return state
  }
}

const LoadSheetContext = createContext()

function buildInitial(initial) {
  if (!initial) return initialState
  return {
    ...initialState,
    ...initial,
    flightData: { ...initialState.flightData, ...(initial.flightData || {}) },
    fuelData: { ...initialState.fuelData, ...(initial.fuelData || {}) },
    identification: { ...initialState.identification, ...(initial.identification || {}) },
    opsData: {
      ...initialState.opsData,
      ...(initial.opsData || {}),
      dep: { ...initialState.opsData.dep, ...((initial.opsData || {}).dep || {}) },
      dest: { ...initialState.opsData.dest, ...((initial.opsData || {}).dest || {}) },
      alt: { ...initialState.opsData.alt, ...((initial.opsData || {}).alt || {}) },
    },
  }
}

export function LoadSheetProvider({ children, initial }) {
  const [state, dispatch] = useReducer(reducer, initial, buildInitial)
  return (
    <LoadSheetContext.Provider value={{ state, dispatch }}>
      {children}
    </LoadSheetContext.Provider>
  )
}

export function useLoadSheet() {
  const ctx = useContext(LoadSheetContext)
  if (!ctx) throw new Error('useLoadSheet must be used within LoadSheetProvider')
  return ctx
}
