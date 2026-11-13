import { useEffect, useRef, useState } from 'react';

// Dropdown with "+" (add), "✎" (edit/rename) and "🗑" (delete) buttons, like the Yarn Account forms.
// Add / edit / delete happen inline (no browser prompt/confirm popups, which Chrome can silently block).
// `options` = [{ id, value, label? }]
// `onAdd(text)`, `onEdit(option, newText)`, `onDelete(option)` return promises.
// If onAdd / onEdit resolve to a string, that string is selected (e.g. a party's id).
export default function LookupSelect({
  value, onChange, options, onAdd, onEdit, onDelete, placeholder = '--', required, label, className = '',
}) {
  const [mode, setMode] = useState(null); // null | 'add' | 'edit' | 'delete'
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const selected = options.find((o) => o.value === value);
  const show = (o) => o.label ?? o.value;

  useEffect(() => {
    if (mode === 'add' || mode === 'edit') inputRef.current?.focus();
  }, [mode]);

  function open(m) {
    setErr('');
    setText(m === 'edit' && selected ? show(selected) : '');
    setMode(m);
  }
  function close() {
    setMode(null);
    setErr('');
  }

  async function run(fn) {
    setBusy(true);
    setErr('');
    try {
      await fn();
      close();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    const v = text.trim();
    if (!v) return setErr('Enter a value');
    if (mode === 'add') {
      return run(async () => {
        const res = await onAdd(v);
        onChange(typeof res === 'string' ? res : v);
      });
    }
    if (mode === 'edit') {
      if (v === show(selected)) return close();
      return run(async () => {
        const res = await onEdit(selected, v);
        onChange(typeof res === 'string' ? res : v);
      });
    }
  }

  function onKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault(); // don't submit the whole PO form
      submit();
    } else if (e.key === 'Escape') {
      close();
    }
  }

  if (mode === 'add' || mode === 'edit') {
    return (
      <div className={`lookup ${className}`}>
        <div className="sel-row">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            placeholder={mode === 'add' ? `New ${label || 'value'}` : `Edit ${label || 'value'}`}
            disabled={busy}
          />
          <button type="button" className="icon-btn ok" title="Save (Enter)" onClick={submit} disabled={busy}>✓</button>
          <button type="button" className="icon-btn" title="Cancel (Esc)" onClick={close} disabled={busy}>✕</button>
        </div>
        {err && <div className="lookup-err">{err}</div>}
      </div>
    );
  }

  if (mode === 'delete' && selected) {
    return (
      <div className={`lookup ${className}`}>
        <div className="sel-row confirm-row">
          <span className="confirm-text">Delete “{show(selected)}”?</span>
          <button type="button" className="icon-btn del-yes" onClick={() => run(async () => { await onDelete(selected); onChange(''); })} disabled={busy}>
            Yes
          </button>
          <button type="button" className="icon-btn" onClick={close} disabled={busy}>No</button>
        </div>
        {err && <div className="lookup-err">{err}</div>}
      </div>
    );
  }

  return (
    <div className={`lookup ${className}`}>
      <div className="sel-row">
        <select value={value || ''} onChange={(e) => onChange(e.target.value)} required={required}>
          <option value="">{placeholder}</option>
          {/* keep a saved value visible even if it was removed from the list */}
          {value && !selected && <option value={value}>{value}</option>}
          {options.map((o) => (
            <option key={o.id} value={o.value} disabled={!!o.disabled && o.value !== value} style={o.disabled ? { color: '#9aa7b0' } : undefined}>{show(o)}</option>
          ))}
        </select>
        {onAdd && (
          <button type="button" className="icon-btn add" title={`Add ${label || ''}`} onClick={() => open('add')}>+</button>
        )}
        {onEdit && (
          <button type="button" className="icon-btn edit" title={selected ? 'Edit selected' : 'Select a value first'} onClick={() => open('edit')} disabled={!selected}>
            ✎
          </button>
        )}
        {onDelete && (
          <button type="button" className="icon-btn del" title={selected ? 'Delete selected' : 'Select a value first'} onClick={() => open('delete')} disabled={!selected}>
            🗑
          </button>
        )}
      </div>
      {err && <div className="lookup-err">{err}</div>}
    </div>
  );
}
