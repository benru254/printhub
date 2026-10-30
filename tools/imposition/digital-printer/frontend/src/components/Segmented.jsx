// A row of buttons where exactly one is selected (like Portrait | Landscape).
export default function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`seg-btn ${value === o.value ? 'seg-on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <span className="seg-icon" aria-hidden>{o.icon}</span>}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
