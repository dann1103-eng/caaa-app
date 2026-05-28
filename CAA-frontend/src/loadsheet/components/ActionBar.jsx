export default function ActionBar({ onBack, onNext, nextLabel = 'Continuar', note, nextDisabled = false }) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3 pt-4 border-t border-gray-300 mt-6">
      {note && <span className="text-xs text-gray-500">{note}</span>}
      <div className="flex gap-2 ml-auto">
        {onBack && (
          <button onClick={onBack} className="px-4 py-2 rounded-md text-sm font-semibold border border-gray-300 bg-white hover:bg-gray-50 cursor-pointer">
            ← Atras
          </button>
        )}
        {onNext && (
          <button
            onClick={onNext}
            disabled={nextDisabled}
            className="px-4 py-2 rounded-md text-sm font-semibold bg-[#1a3a5c] text-white hover:bg-[#122b46] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {nextLabel} →
          </button>
        )}
      </div>
    </div>
  )
}
