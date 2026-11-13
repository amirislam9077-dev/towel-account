// Al Hasan Towel API (Express). Used by server/index.js (your computer) and api/index.js (Vercel).
import express from 'express';
import crypto from 'node:crypto';
import { getStore } from './store.js';
import { yarnBalance, CHALLAN_TYPES, challanType, yarnName } from '../src/towelPo.js';

// collection name -> number prefix (null = no auto number)
const COLLECTIONS = {
  parties: null,
  lookups: null, // dropdown values: { kind, value }
  'towel-pos': 'TPO', // Exporter Towel PO
  'loom-towel-pos': 'LTPO', // Loom Towel PO (against an Exporter Towel PO)
  'yarn-challans': 'YC', // yarn received from the exporter / issued to a loom
};
const PARTY_TYPES = ['exporter', 'loom'];

// Starter dropdown values — added once per list; user can add / edit / delete afterwards.
const SEED_LOOKUPS = {
  towelItem: ['Hand Towel', 'Bath Towel', 'Bath Sheet', 'Face Towel', 'Wash Cloth', 'Bath Mat', 'Beach Towel', 'Kitchen Towel'],
  towelQuality: ['Plush', 'KB Plush', 'Terry', 'Velour', 'Jacquard', 'Dobby'],
  border: ['CAM Border', 'Dobby Border', 'Plain Border', 'Jacquard Border'],
  color: ['White', 'Red', 'Blue', 'Navy Blue', 'Grey', 'Black', 'Beige', 'Green'],
  finish: ['With Stitching & With Bleaching', 'With Stitching & Dyed', 'Grey (Without Bleaching)', 'Yarn Dyed'],
  packing: ['Bale Pack', 'Carton Pack', 'Poly Bag'],
  count: ['8', '10', '12', '16', '20', '21', '24', '30', '2/16', '2/20'],
  yarnType: ['Single', 'Double'],
  blend: ['Cotton', 'PC', '85% Cotton 15% Polyester', 'CVC', 'Polyester'],
  spinning: ['OE', 'Ring', 'Combed', 'Carded'],
  reed: Array.from({ length: 25 }, (_, i) => String((i + 1) * 2)),
  pick: Array.from({ length: 25 }, (_, i) => String((i + 1) * 2)),
  fabricWidth: ['20', '24', '30', '36', '54', '63', '72'],
  widthUnit: ['Inches', 'CM'],
  godown: ['Al Hasan Godown'],
  vehicleNo: [],
  driverPhone: [],
  yarnBrand: [],
  deliveryPlace: [],
};

const rid = () => Math.random().toString(36).slice(2, 12);
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

// store + starter lists, once per process
let seeded = null;
async function store() {
  const s = await getStore();
  seeded ||= (async () => {
    let lookups = null;
    for (const [kind, values] of Object.entries(SEED_LOOKUPS)) {
      if (await s.getMeta(`seeded:${kind}`)) continue;
      lookups ||= await s.all('lookups');
      for (const value of values) {
        if (!lookups.some((l) => l.kind === kind && same(l.value, value))) {
          const row = { kind, value, id: rid() };
          lookups.push(row);
          await s.put('lookups', row);
        }
      }
      await s.setMeta(`seeded:${kind}`, true);
    }
  })().catch((e) => { seeded = null; throw e; });
  await seeded;
  return s;
}

async function nextNo(s, c) {
  const n = ((await s.getMeta(`seq:${c}`)) || 0) + 1;
  return `${COLLECTIONS[c]}-${String(n).padStart(4, '0')}`;
}
async function bumpSeq(s, c, no) {
  const n = parseInt(String(no).split('-').pop(), 10);
  if (!isNaN(n) && n > ((await s.getMeta(`seq:${c}`)) || 0)) await s.setMeta(`seq:${c}`, n);
}

async function validate(s, c, body, id) {
  if (c === 'parties') {
    if (!body.name?.trim()) return 'Name is required';
    if (!PARTY_TYPES.includes(body.type)) return 'Type must be exporter or loom';
    if ((await s.all(c)).some((p) => p.id !== id && p.type === body.type && same(p.name, body.name))) return `${body.type === 'loom' ? 'Loom' : 'Exporter'} "${body.name}" already exists`;
  }
  if (c === 'lookups') {
    if (!body.kind || !body.value?.trim()) return 'Value is required';
    if ((await s.all(c)).some((l) => l.id !== id && l.kind === body.kind && same(l.value, body.value))) return `"${body.value}" already exists`;
  }
  if (c === 'towel-pos') {
    if (!body.exporterId) return 'Exporter is required';
    if (!body.qualities?.length) return 'Add at least one quality';
    for (const [i, q] of body.qualities.entries()) {
      if (!(q.items || []).some((x) => Number(x.qty) > 0)) return `Quality ${i + 1}: add at least one item with Qty`;
    }
  }
  if (c === 'loom-towel-pos') {
    if (!body.loomId) return 'Loom is required';
    const ep = await s.get('towel-pos', body.exporterPoId);
    if (!ep) return 'Select the Exporter Towel PO';
    if (!body.qualities?.length) return 'Add at least one quality';
    // each item: not more pcs than are left on its Exporter PO item (other Loom POs taken off)
    const others = (await s.all(c)).filter((l) => l.id !== id && l.exporterPoId === ep.id && l.status !== 'cancelled');
    const epItems = (ep.qualities || []).flatMap((q) => q.items || []);
    for (const q of body.qualities) {
      for (const it of q.items || []) {
        const src = it.srcKey && epItems.find((x) => x.key === it.srcKey);
        if (!src) continue;
        const given = others.flatMap((l) => (l.qualities || []).flatMap((x) => x.items || [])).filter((x) => x.srcKey === it.srcKey)
          .reduce((t, x) => t + Number(x.qty || 0), 0);
        const left = Number(src.qty || 0) - given;
        if (Number(it.qty || 0) > left + 1e-6) return `${it.item}: only ${Math.max(0, left)} Pcs left on ${ep.no}`;
      }
    }
  }
  if (c === 'yarn-challans') {
    const type = challanType(body);
    const T = CHALLAN_TYPES[type];
    const po = await s.get(T.coll, body[T.poField]);
    if (!po) return `Select the ${T.poLabel}`;
    const lines = (body.lines || []).filter((l) => Number(l.bags) > 0);
    if (!lines.length) return `Enter ${T.verb} Bags`;
    if (!String(body.godown || '').trim()) return 'Godown is required';
    // each yarn: not more bags than its balance on the PO (other challans taken off)
    const { slots } = yarnBalance(po, type, await s.all(c), id);
    for (const l of lines) {
      const sl = slots.find((x) => x.qKey === l.qKey && x.y === l.y);
      if (!sl) return `${yarnName(l.y)} ${l.yarnText || ''}: this yarn is not on ${po.no} any more`;
      if (Number(l.bags) > sl.balance + 1e-6)
        return `${sl.name} ${sl.text} (Quality ${sl.qi + 1}): only ${Math.max(0, sl.balance)} Bags balance on ${po.no}`;
    }
  }
  return null;
}
async function canDelete(s, c, id) {
  if (c === 'parties') {
    if ((await s.all('towel-pos')).some((p) => p.exporterId === id)) return 'This party is used in an Exporter Towel PO, cannot delete';
    if ((await s.all('loom-towel-pos')).some((p) => p.loomId === id)) return 'This loom is used in a Loom Towel PO, cannot delete';
  }
  if (c === 'towel-pos' && (await s.all('loom-towel-pos')).some((p) => p.exporterPoId === id))
    return 'Loom Towel PO exists against this Exporter Towel PO, delete that first';
  if ((c === 'towel-pos' || c === 'loom-towel-pos') && (await s.all('yarn-challans')).some((x) => x.exporterPoId === id || x.loomPoId === id))
    return 'Yarn challan exists against this PO, delete that first';
  return null;
}

// ---------- login ----------
// Set APP_PASSWORD (on Vercel) to lock the app. Without it (your own computer) no login is asked.
const token = () => crypto.createHash('sha256').update('al-hasan-towel|' + process.env.APP_PASSWORD).digest('hex');
const safeEq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

const app = express();
app.use(express.json({ limit: '12mb' }));
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(e);
  res.status(500).json({ error: 'Server error: ' + e.message });
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.post('/api/login', (req, res) => {
  if (!process.env.APP_PASSWORD) return res.json({ token: '' });
  const pw = String(req.body?.password || '');
  if (!safeEq(crypto.createHash('sha256').update(pw).digest('hex'), crypto.createHash('sha256').update(process.env.APP_PASSWORD).digest('hex')))
    return res.status(401).json({ error: 'Wrong password' });
  res.json({ token: token() });
});
app.use('/api', (req, res, next) => {
  if (!process.env.APP_PASSWORD) return next();
  const t = String(req.headers.authorization || '').replace(/^Bearer /, '');
  if (t && safeEq(t, token())) return next();
  res.status(401).json({ error: 'Please log in' });
});
app.get('/api/me', (_req, res) => res.json({ ok: true, locked: !!process.env.APP_PASSWORD }));

app.get('/api/:c/next-no', wrap(async (req, res) => {
  const { c } = req.params;
  if (!COLLECTIONS[c]) return res.status(404).json({ error: 'Unknown collection' });
  res.json({ no: await nextNo(await store(), c) });
}));
app.get('/api/:c', wrap(async (req, res) => {
  const { c } = req.params;
  if (!(c in COLLECTIONS)) return res.status(404).json({ error: 'Unknown collection' });
  let rows = await (await store()).all(c);
  if (req.query.type) rows = rows.filter((r) => r.type === req.query.type);
  if (req.query.kind) rows = rows.filter((r) => r.kind === req.query.kind);
  res.json(rows);
}));
app.get('/api/:c/:id', wrap(async (req, res) => {
  if (!(req.params.c in COLLECTIONS)) return res.status(404).json({ error: 'Unknown collection' });
  const row = await (await store()).get(req.params.c, req.params.id);
  row ? res.json(row) : res.status(404).json({ error: 'Not found' });
}));
app.post('/api/:c', wrap(async (req, res) => {
  const { c } = req.params;
  if (!(c in COLLECTIONS)) return res.status(404).json({ error: 'Unknown collection' });
  const s = await store();
  const err = await validate(s, c, req.body);
  if (err) return res.status(400).json({ error: err });
  const row = { ...req.body, id: newId(), createdAt: new Date().toISOString() };
  if (COLLECTIONS[c]) {
    if (!row.no || (await s.all(c)).some((r) => r.no === row.no)) row.no = await nextNo(s, c);
    await bumpSeq(s, c, row.no);
  }
  await s.put(c, row);
  res.status(201).json(row);
}));
app.put('/api/:c/:id', wrap(async (req, res) => {
  const { c, id } = req.params;
  if (!(c in COLLECTIONS)) return res.status(404).json({ error: 'Unknown collection' });
  const s = await store();
  const old = await s.get(c, id);
  if (!old) return res.status(404).json({ error: 'Not found' });
  const err = await validate(s, c, req.body, id);
  if (err) return res.status(400).json({ error: err });
  const row = { ...old, ...req.body, id, no: old.no, updatedAt: new Date().toISOString() };
  await s.put(c, row);
  res.json(row);
}));
app.delete('/api/:c/:id', wrap(async (req, res) => {
  const { c, id } = req.params;
  if (!(c in COLLECTIONS)) return res.status(404).json({ error: 'Unknown collection' });
  const s = await store();
  const err = await canDelete(s, c, id);
  if (err) return res.status(400).json({ error: err });
  await s.del(c, id);
  res.json({ ok: true });
}));

export default app;
