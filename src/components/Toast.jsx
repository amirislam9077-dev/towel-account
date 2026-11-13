import { useEffect, useState } from 'react';

// Small app-wide notification ("toast").
//   showToast({ title: 'Saved successfully', text: 'Exporter PO EPO-0002 has been saved.' })
//   showToast({ type: 'delete', title: 'Deleted', text: '…' })
// <ToastHost /> is mounted once in App.
const EVENT = 'lt-toast';
let nextId = 1;

export function showToast({ type = 'success', title, text, ms = 4000 }) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { id: nextId++, type, title, text, ms } }));
}

const ICON = { success: '✔', delete: '🗑', error: '!', info: 'i' };

export default function ToastHost() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const add = (e) => {
      const t = e.detail;
      setItems((cur) => [...cur.slice(-3), t]); // keep at most 4 on screen
      setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== t.id)), t.ms);
    };
    window.addEventListener(EVENT, add);
    return () => window.removeEventListener(EVENT, add);
  }, []);

  return (
    <div className="toast-host no-print" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span className="toast-icon">{ICON[t.type] || '✔'}</span>
          <div className="toast-body">
            <b>{t.title}</b>
            {t.text && <span>{t.text}</span>}
          </div>
          <button className="toast-close" aria-label="Close" onClick={() => setItems((cur) => cur.filter((x) => x.id !== t.id))}>×</button>
          <i className="toast-bar" style={{ animationDuration: `${t.ms}ms` }} />
        </div>
      ))}
    </div>
  );
}
