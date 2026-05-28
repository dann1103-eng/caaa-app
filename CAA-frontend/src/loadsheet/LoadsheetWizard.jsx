import { useLoadSheet } from "./context/LoadSheetContext";
import StepNav from "./components/StepNav";
import Step1Aircraft from "./components/steps/Step1Aircraft";
import Step2WB from "./components/steps/Step2WB";
import Step3Nav from "./components/steps/Step3Nav";
import Step4Ops from "./components/steps/Step4Ops";
import Step5Summary from "./components/steps/Step5Summary";

function StatusBadge({ status }) {
  if (status === true) return <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">LISTO</span>;
  if (status === false) return <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800">REVISAR</span>;
  return <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-500">PENDIENTE</span>;
}

export default function LoadsheetWizard({ onExit }) {
  const { state } = useLoadSheet();
  const steps = [Step1Aircraft, Step2WB, Step3Nav, Step4Ops, Step5Summary];
  const CurrentStep = steps[state.step];

  return (
    <div className="ls-root min-h-screen bg-[#e8e8e8] p-5">
      <div className="max-w-5xl mx-auto">
        <div className="bg-[#1a3a5c] text-white px-6 py-4 rounded-t-lg flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onExit}
              className="px-3 py-1 rounded-md text-sm font-semibold bg-white/15 hover:bg-white/25 cursor-pointer"
            >
              ← Volver
            </button>
            <div>
              <h1 className="text-lg font-semibold tracking-wide">Load Sheet — CAAA</h1>
              <p className="text-xs opacity-75 mt-0.5">Centro de Adiestramiento Aereo Academico</p>
            </div>
          </div>
          <StatusBadge status={state.wbResults?.allOk ? true : state.wbResults?.totalW > 0 ? false : null} />
        </div>
        <div className="bg-white border border-gray-300 border-t-0 rounded-b-lg p-5">
          <StepNav />
          <CurrentStep />
        </div>
      </div>
    </div>
  );
}
