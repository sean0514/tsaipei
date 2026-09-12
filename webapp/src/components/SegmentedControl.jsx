// A row of button-style radio options, used for short status enums where
// a dropdown hides the choices — click any pill to select it.
export default function SegmentedControl({ name, options, value, onChange, compact }) {
  return (
    <div className={`segmented${compact ? ' compact' : ''}`}>
      {options.map((opt) => (
        <label key={opt} className={`segmented-option${value === opt ? ' selected' : ''}`}>
          <input type="radio" name={name} value={opt} checked={value === opt} onChange={() => onChange(opt)} />
          {opt}
        </label>
      ))}
    </div>
  );
}
