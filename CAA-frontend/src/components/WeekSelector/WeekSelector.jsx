import "./WeekSelector.css";

export default function WeekSelector({ selected, onChange }) {
  return (
    <div className="week-selector">
      <button
        className={`week-btn ${selected === "current" ? "active" : ""}`}
        onClick={() => onChange("current")}
        type="button"
      >
        Semana actual
      </button>

      <button
        className={`week-btn ${selected === "next" ? "active" : ""}`}
        onClick={() => onChange("next")}
        type="button"
      >
        Semana siguiente
      </button>
    </div>
  );
}
