import { useEffect, useRef, useState } from 'react';
import { fmtDate, MONTHS } from '../util.js';

// Date box shown as DD-Mon-YY (e.g. 10-Nov-26) instead of the browser's mm/dd/yyyy.
// Type 10-Nov-26 / 10-11-26 / 10/11/2026, or pick from the calendar (📅).
// `value` / `onChange` use ISO dates (YYYY-MM-DD), like <input type="date">.
export function parseDate(text) {
  // month as a word: 10-Nov-26 → 10-11-26
  const t = String(text || '').trim().replace(/[A-Za-z]{3,}/, (w) => {
    const i = MONTHS.findIndex((x) => x.toLowerCase() === w.slice(0, 3).toLowerCase());
    return i < 0 ? w : String(i + 1);
  });
  const m = t.match(/^(\d{1,2})[-/.\s]?(\d{1,2})[-/.\s]?(\d{2}|\d{4})$/);
  if (!m) return null;
  const d = +m[1], mo = +m[2];
  let y = +m[3];
  if (m[3].length === 2) y += 2000;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export default function DateInput({ value, onChange, required, placeholder = 'DD-Mon-YY', ...rest }) {
  const [text, setText] = useState(fmtDate(value));
  const [bad, setBad] = useState(false);
  const pickerRef = useRef(null);

  useEffect(() => {
    setText(fmtDate(value));
    setBad(false);
  }, [value]);

  function commit() {
    if (!text.trim()) {
      setBad(false);
      if (value) onChange('');
      return;
    }
    const iso = parseDate(text);
    if (iso) {
      setBad(false);
      if (iso !== value) onChange(iso);
      else setText(fmtDate(iso));
    } else {
      setBad(true);
    }
  }

  function openPicker() {
    const el = pickerRef.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
      el.click();
    }
  }

  return (
    <div className={`date-input ${bad ? 'bad' : ''}`}>
      <input
        type="text"
        inputMode="text"
        value={text}
        placeholder={placeholder}
        title={bad ? 'Use DD-Mon-YY, e.g. 10-Nov-26 (or 10-11-26)' : 'DD-Mon-YY, e.g. 10-Nov-26'}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), commit())}
        required={required}
        {...rest}
      />
      <button type="button" className="date-btn" title="Pick from calendar" onClick={openPicker} tabIndex={-1}>📅</button>
      <input
        ref={pickerRef}
        type="date"
        className="date-hidden"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}
