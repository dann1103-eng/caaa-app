export default function StatusStrip({ isApto, message }) {
  const base = 'flex items-center gap-4 px-4 py-2.5 rounded-md mb-5 text-xs font-semibold border'
  if (isApto === true) return (
    <div className={`${base} bg-green-50 border-green-300 text-green-700`}>
      <span className="text-lg">✓</span>
      <span>{message || 'Peso y balance dentro de limites — LISTO'}</span>
    </div>
  )
  if (isApto === false) return (
    <div className={`${base} bg-red-50 border-red-300 text-red-700`}>
      <span className="text-lg">⚠</span>
      <span>{message || 'Peso y balance fuera de limites — REQUIERE REVISION'}</span>
    </div>
  )
  if (isApto === 'warning') return (
    <div className={`${base} bg-amber-50 border-amber-300 text-amber-700`}>
      <span className="text-lg">⚠</span>
      <span>{message || 'Falta completar datos obligatorios'}</span>
    </div>
  )
  return (
    <div className={`${base} bg-gray-50 border-gray-300 text-gray-600`}>
      <span className="text-lg">○</span>
      <span>{message || 'Ingresa los pesos para calcular el balance.'}</span>
    </div>
  )
}
