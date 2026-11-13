import { useState } from 'react';

// Number box that shows thousand separators while typing (11,111) and an optional unit inside (Pcs, Lbs, Rs).
// `value` / `onChange` use the plain number string without commas, e.g. "11111" or "6800.5".
// `decimals` (e.g. 2): when the box is not being edited the number is shown with that many digits after the point
// (11 → 11.00, 0.5 → 0.50); leaving the box also saves it that way.
const group = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function formatNumberText(raw) {
  if (raw === '' || raw == null) return '';
  const [int, dec] = String(raw).split('.');
  return group(int) + (dec !== undefined ? '.' + dec : '');
}

const fixed = (raw, decimals) => {
  if (raw === '' || raw == null || isNaN(Number(raw))) return raw;
  return Number(raw).toFixed(decimals);
};

export default function NumberInput({ value, onChange, unit, placeholder, decimals, ...rest }) {
  const [editing, setEditing] = useState(false);

  function handle(e) {
    let v = e.target.value.replace(/,/g, '').replace(/[^\d.]/g, '');
    const dot = v.indexOf('.');
    if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, ''); // only one decimal point
    onChange(v);
  }

  const shown = decimals != null && !editing ? fixed(value, decimals) : value;

  return (
    <div className={`num-input ${unit ? 'has-unit' : ''}`}>
      <input
        type="text"
        inputMode="decimal"
        value={formatNumberText(shown)}
        onChange={handle}
        onFocus={() => setEditing(true)}
        onBlur={() => {
          setEditing(false);
          if (decimals != null && value !== '' && value != null) {
            const v = fixed(value, decimals);
            if (v !== value) onChange(v);
          }
        }}
        placeholder={placeholder}
        {...rest}
      />
      {unit && <span className="num-unit">{unit}</span>}
    </div>
  );
}
