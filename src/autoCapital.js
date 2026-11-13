// Auto capital letters in the whole app: while typing, the first letter of every word becomes capital
// ("sajid textile" → "Sajid Textile"). Letters already capital are kept (PC, CVC stay as they are).
// Works for every text box and textarea. Add  data-nocap  to an input to switch it off.
const SKIP_TYPES = new Set(['password', 'email', 'url', 'number', 'date', 'file', 'checkbox', 'radio', 'color', 'range', 'hidden']);

export const titleWords = (v) => String(v).replace(/(^|[\s(\[/\-,.&|+])([a-z])/g, (m, a, b) => a + b.toUpperCase());

const inputSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
const areaSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;

function onInput(e) {
  const el = e.target;
  const isArea = el instanceof HTMLTextAreaElement;
  if (!isArea && !(el instanceof HTMLInputElement)) return;
  if (!isArea && SKIP_TYPES.has((el.type || 'text').toLowerCase())) return;
  if (el.closest('[data-nocap]')) return;
  const v = el.value;
  const t = titleWords(v);
  if (t === v) return;
  const s = el.selectionStart;
  const end = el.selectionEnd;
  // native setter: React then sees the new value and its onChange gets the capitalised text
  (isArea ? areaSetter : inputSetter).call(el, t);
  try { el.setSelectionRange(s, end); } catch { /* some inputs have no caret */ }
}

// capture phase on document runs before React's own listener on the root
document.addEventListener('input', onInput, true);
