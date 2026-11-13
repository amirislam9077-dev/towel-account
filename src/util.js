export const today = () => new Date().toISOString().slice(0, 10);

export const num = (v) => {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};

export const fmt = (v, d = 0) =>
  num(v).toLocaleString('en-PK', { minimumFractionDigits: d, maximumFractionDigits: d });

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// date shown as DD-Mon-YY, e.g. 10-Nov-26
export const fmtDate = (s) => {
  if (!s) return '';
  const [y, m, d] = String(s).slice(0, 10).split('-');
  return `${d}-${MONTHS[+m - 1] || m}-${String(y).slice(-2)}`;
};

// Construction = reed x pick / warp count type blend x weft count type blend (+ width, weave)
// e.g. 100x56 / 20 Single Cotton x 20 Single PC · 63" · Plain
const yarn = (it, p) => [it[p], it[p + 'Type'], it[p + 'Blend']].filter(Boolean).join(' ');
export const construction = (it) => {
  const main = [];
  if (it.reed || it.pick) main.push(`${it.reed || '?'}x${it.pick || '?'}`);
  if (it.warp || it.weft) main.push(`${yarn(it, 'warp') || '?'} x ${yarn(it, 'weft') || '?'}`);
  const parts = main.length ? [main.join(' / ')] : [];
  if (it.width) parts.push(`${it.width}"`);
  if (it.weave) parts.push(it.weave);
  return parts.join(' · ');
};

export const itemLabel = (it) => it.quality || construction(it) || 'Quality';

export const newKey = () => Math.random().toString(36).slice(2);

export const emptyItem = () => ({
  key: newKey(),
  quality: '',
  warp: '',
  warpType: '',
  warpBlend: '',
  weft: '',
  weftType: '',
  weftBlend: '',
  reed: '',
  pick: '',
  width: '',
  weave: '',
  meters: '',
  rate: '',
});

export const itemAmount = (it) => num(it.meters) * num(it.rate);

export const poTotals = (po) => {
  const items = po.items || [];
  const meters = items.reduce((s, it) => s + num(it.meters), 0);
  const amount = items.reduce((s, it) => s + itemAmount(it), 0);
  const gst = (amount * num(po.gstPct)) / 100;
  return { meters, amount, gst, total: amount + gst };
};

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven',
  'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function below1000(n) {
  let s = '';
  if (n >= 100) { s += ones[Math.floor(n / 100)] + ' Hundred '; n %= 100; }
  if (n >= 20) { s += tens[Math.floor(n / 10)] + ' '; n %= 10; }
  if (n > 0) s += ones[n] + ' ';
  return s;
}

// Pakistani numbering: Crore, Lakh, Thousand
export function inWords(amount) {
  let n = Math.round(num(amount));
  if (n === 0) return 'Rupees Zero Only';
  let s = '';
  for (const [v, name] of [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand']]) {
    if (n >= v) { s += below1000(Math.floor(n / v)) + name + ' '; n %= v; }
  }
  s += below1000(n);
  return 'Rupees ' + s.trim() + ' Only';
}
