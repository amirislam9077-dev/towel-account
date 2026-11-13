// Towel PO (Weaving Program / Sale & Purchase) — fields and calculations.
// A PO has one or more QUALITIES (e.g. "85% Cotton 15% Polyester 16/S OE KB Plush CAM Border White").
// Each quality has its yarn (Pile, Ground, Weft — instead of Warp / Weft), construction and shortage,
// and a table of ITEMS (Hand Towel, Wash Cloth, Bath Mat …) with Pcs Wt, Size, Qty and Rate.
import { newKey, num } from './util.js';

export const GRAM_PER_LB = 453.59237;
export const LBS_PER_BAG = 100;

// Yarns of a towel: Pile + Ground (the two warps), Weft, and Fancy (border / design yarn)
export const YARNS = [
  ['pile', 'Pile'],
  ['ground', 'Ground'],
  ['weft', 'Weft'],
  ['fancy', 'Fancy'],
];

// Shortage % fields of a quality (all added together)
export const SHORTAGE_FIELDS = [
  ['loomShortage', 'Loom Shortage %'],
  ['dyeingShortage', 'Bleaching / Dyeing %'],
  ['stitchingShortage', 'Stitching Shortage %'],
  ['bGrade', 'B Grade %'],
];
export const totalShortage = (q) => SHORTAGE_FIELDS.reduce((s, [k]) => s + num(q[k]), 0);

// Rate of an item: per Lbs (as on the weaving program), per Pcs or per Dozen
export const RATE_UNITS = [
  ['lbs', 'Per Lbs'],
  ['pcs', 'Per Pcs'],
  ['dozen', 'Per Dozen'],
];
export const rateUnitText = (u) => (RATE_UNITS.find(([k]) => k === u) || RATE_UNITS[0])[1];
export const rateUnitShort = (u) => rateUnitText(u).replace('Per ', '/');

// "16/S" (Single) or "16/D" (Double)
const countText = (q, p) => {
  const c = String(q[p] || '').trim();
  if (!c) return '';
  const t = String(q[p + 'Type'] || '').trim();
  return t ? `${c}/${t[0].toUpperCase()}` : c;
};
// "85% Cotton 15% Polyester 16/S OE"
export const yarnText = (q, p) => [q[p + 'Blend'], countText(q, p), q[p + 'Spin']].filter(Boolean).join(' ');

// Quality title (auto), like the heading on the weaving program:
// "85% Cotton 15% Polyester 16/S OE KB Plush CAM Border White"
export const qualityTitle = (q) =>
  [yarnText(q, 'pile'), q.qualityName, q.border, q.color].map((s) => String(s || '').trim()).filter(Boolean).join(' ');

// Construction (auto): "Reed 60 x Pick 40 / Pile 16/S · Ground 16/S · Weft 16/S / 63 Inches"
export const construction = (q) => {
  const rp = q.reed || q.pick ? `${q.reed || '?'} x ${q.pick || '?'}` : '';
  const yarns = YARNS.map(([p, n]) => (countText(q, p) ? `${n} ${countText(q, p)}` : '')).filter(Boolean).join(' · ');
  const width = q.width ? [q.width, q.widthUnit].filter(Boolean).join(' ') : '';
  return [rp, yarns, width].filter(Boolean).join(' / ');
};

// "16 X 27"
export const sizeText = (it) => (it.width || it.length ? `${it.width || '?'} X ${it.length || '?'}` : '');

// ---------- item calculations ----------
// Lbs per dozen = Pcs Wt (gram) × 12 ÷ 453.59
export const lbsPerDozen = (it) => (num(it.pcsWt) * 12) / GRAM_PER_LB;
// Total Lbs = Qty (pcs) × Pcs Wt (gram) ÷ 453.59
export const itemLbs = (it) => (num(it.qty) * num(it.pcsWt)) / GRAM_PER_LB;
export const qtyForRate = (it, unit = it.rateUnit) => {
  if (unit === 'pcs') return num(it.qty);
  if (unit === 'dozen') return num(it.qty) / 12;
  return itemLbs(it);
};
export const itemAmount = (it) => qtyForRate(it) * num(it.rate);

// ---------- quality calculations ----------
export function qualityCalc(q) {
  const items = q.items || [];
  const pcs = items.reduce((s, it) => s + num(it.qty), 0);
  const lbs = items.reduce((s, it) => s + itemLbs(it), 0);
  const amount = items.reduce((s, it) => s + itemAmount(it), 0);
  const shortage = totalShortage(q);
  // Net Lbs required = Total Lbs + shortage %
  const netLbs = lbs * (1 + shortage / 100);
  // Split by Pile / Ground / Weft %
  const yarns = YARNS.map(([p, name]) => {
    const pct = num(q[p + 'Pct']);
    const yLbs = (netLbs * pct) / 100;
    const bags = yLbs / LBS_PER_BAG;
    return { p, name, text: yarnText(q, p), pct, lbs: yLbs, bags, rate: num(q[p + 'Rate']), cost: bags * num(q[p + 'Rate']) };
  });
  const yarnCost = yarns.reduce((s, y) => s + y.cost, 0);
  return { pcs, lbs, amount, shortage, netLbs, netBags: netLbs / LBS_PER_BAG, yarns, yarnCost };
}

export function poTotals(po) {
  const t = { pcs: 0, lbs: 0, amount: 0, netLbs: 0, netBags: 0, yarnCost: 0 };
  for (const q of po.qualities || []) {
    const c = qualityCalc(q);
    for (const k in t) t[k] += c[k];
  }
  t.gst = po.gstType === 'with' ? (t.amount * num(po.gstPct)) / 100 : 0;
  t.total = t.amount + t.gst;
  return t;
}

// Pile % + Ground % + Weft % + Fancy % = 100:
// Pile, Ground and Weft stay as typed; Fancy shows what is left (100 − the three).
// Typing Fancy by hand changes Weft instead.
export function withYarnPct(q, patch) {
  const n = { ...q, ...patch };
  const rest = (...xs) => String(+Math.max(0, 100 - xs.reduce((s, x) => s + num(x), 0)).toFixed(2));
  if ('pilePct' in patch || 'groundPct' in patch || 'weftPct' in patch) return { ...patch, fancyPct: rest(n.pilePct, n.groundPct, n.weftPct) };
  if ('fancyPct' in patch) return { ...patch, weftPct: rest(n.pilePct, n.groundPct, n.fancyPct) };
  return patch;
}

// ---------- blanks ----------
export const emptyItem = () => ({
  key: newKey(),
  item: '',
  width: '',
  length: '',
  pcsWt: '', // gram per piece
  qty: '', // pcs
  rate: '',
  rateUnit: 'lbs',
  remarks: '',
});

export const emptyQuality = () => ({
  key: newKey(),
  qualityName: 'KB Plush',
  border: 'CAM Border',
  color: 'White',
  finish: 'With Stitching & With Bleaching',
  packing: '',
  reed: '',
  pick: '',
  width: '',
  widthUnit: 'Inches',
  // yarn: Pile + Ground + Weft + Fancy (Yarn Rate per bag, % share of the towel weight) — the four % make 100
  pile: '16', pileType: 'Single', pileBlend: 'Cotton', pileSpin: 'OE', pileRate: '', pilePct: '40',
  ground: '16', groundType: 'Single', groundBlend: 'PC', groundSpin: 'OE', groundRate: '', groundPct: '25',
  weft: '16', weftType: 'Single', weftBlend: 'Cotton', weftSpin: 'OE', weftRate: '', weftPct: '25',
  fancy: '20', fancyType: 'Single', fancyBlend: 'Polyester', fancySpin: 'Carded', fancyRate: '', fancyPct: '10', // changing Fancy % takes it off Weft
  // shortage % defaults (total 10 %)
  loomShortage: '4', stitchingShortage: '3', dyeingShortage: '2', bGrade: '1',
  items: [emptyItem()],
});

// today's date on this computer (not UTC, so early morning in Pakistan is not yesterday)
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// New PO: PO Date, Rev Order Date and Delivery Date all start at today (can be changed)
export const blankTowelPo = () => ({
  no: '',
  date: localToday(),
  exporterId: '',
  refNo: '', // exporter's PO / ETL Ref No
  revDate: localToday(), // revised order date
  deliveryDate: localToday(),
  gstType: 'with', // default: With GST 18 %
  gstPct: '18',
  status: 'open',
  remarks: '',
  qualities: [emptyQuality()],
});
