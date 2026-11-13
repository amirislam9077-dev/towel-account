// Al Hasan Towel API — simple Express server with a JSON file database (same as Al Hasan Textiles).
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data.json');
const PORT = process.env.PORT || 4001;

// collection name -> number prefix (null = no auto number)
const COLLECTIONS = {
  parties: null,
  lookups: null, // dropdown values: { kind, value }
  'towel-pos': 'TPO',
};

function load() {
  if (!fs.existsSync(DB_FILE)) return { seq: {} };
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
let db = load();
function save() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
const rid = () => Math.random().toString(36).slice(2, 12);

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
};
db.seeded ||= {};
let seededNow = false;
for (const [kind, values] of Object.entries(SEED_LOOKUPS)) {
  if (db.seeded[kind]) continue;
  db.lookups ||= [];
  for (const value of values) {
    if (!db.lookups.some((l) => l.kind === kind && l.value.toLowerCase() === value.toLowerCase()))
      db.lookups.push({ kind, value, id: rid() });
  }
  db.seeded[kind] = true;
  seededNow = true;
}
if (seededNow) save();

const list = (c) => (db[c] ||= []);
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function nextNo(c) {
  const n = (db.seq?.[c] || 0) + 1;
  return `${COLLECTIONS[c]}-${String(n).padStart(4, '0')}`;
}
function bumpSeq(c, no) {
  const n = parseInt(String(no).split('-').pop(), 10);
  db.seq ||= {};
  if (!isNaN(n) && n > (db.seq[c] || 0)) db.seq[c] = n;
}

const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
function validate(c, body, id) {
  if (c === 'parties') {
    if (!body.name?.trim()) return 'Name is required';
    if (body.type !== 'exporter') return 'Type must be exporter';
    if (list(c).some((p) => p.id !== id && p.type === body.type && same(p.name, body.name))) return `Exporter "${body.name}" already exists`;
  }
  if (c === 'lookups') {
    if (!body.kind || !body.value?.trim()) return 'Value is required';
    if (list(c).some((l) => l.id !== id && l.kind === body.kind && same(l.value, body.value))) return `"${body.value}" already exists`;
  }
  if (c === 'towel-pos') {
    if (!body.exporterId) return 'Exporter is required';
    if (!body.qualities?.length) return 'Add at least one quality';
    for (const [i, q] of body.qualities.entries()) {
      if (!(q.items || []).some((x) => Number(x.qty) > 0)) return `Quality ${i + 1}: add at least one item with Qty`;
    }
  }
  return null;
}
function canDelete(c, id) {
  if (c === 'parties' && list('towel-pos').some((p) => p.exporterId === id)) return 'This party is used in a Towel PO, cannot delete';
  return null;
}

const app = express();
app.use(express.json({ limit: '12mb' }));
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/:c/next-no', (req, res) => {
  const { c } = req.params;
  if (!COLLECTIONS[c]) return res.status(404).json({ error: 'Unknown collection' });
  res.json({ no: nextNo(c) });
});
app.get('/api/:c', (req, res) => {
  const { c } = req.params;
  if (!(c in COLLECTIONS)) return res.status(404).json({ error: 'Unknown collection' });
  let rows = list(c);
  if (req.query.type) rows = rows.filter((r) => r.type === req.query.type);
  if (req.query.kind) rows = rows.filter((r) => r.kind === req.query.kind);
  res.json(rows);
});
app.get('/api/:c/:id', (req, res) => {
  if (!(req.params.c in COLLECTIONS)) return res.status(404).json({ error: 'Unknown collection' });
  const row = list(req.params.c).find((r) => r.id === req.params.id);
  row ? res.json(row) : res.status(404).json({ error: 'Not found' });
});
app.post('/api/:c', (req, res) => {
  const { c } = req.params;
  if (!(c in COLLECTIONS)) return res.status(404).json({ error: 'Unknown collection' });
  const err = validate(c, req.body);
  if (err) return res.status(400).json({ error: err });
  const row = { ...req.body, id: newId(), createdAt: new Date().toISOString() };
  if (COLLECTIONS[c]) {
    if (!row.no || list(c).some((r) => r.no === row.no)) row.no = nextNo(c);
    bumpSeq(c, row.no);
  }
  list(c).push(row);
  save();
  res.status(201).json(row);
});
app.put('/api/:c/:id', (req, res) => {
  const { c, id } = req.params;
  if (!(c in COLLECTIONS)) return res.status(404).json({ error: 'Unknown collection' });
  const rows = list(c);
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return res.status(404).json({ error: 'Not found' });
  const err = validate(c, req.body, id);
  if (err) return res.status(400).json({ error: err });
  rows[i] = { ...rows[i], ...req.body, id, no: rows[i].no, updatedAt: new Date().toISOString() };
  save();
  res.json(rows[i]);
});
app.delete('/api/:c/:id', (req, res) => {
  const { c, id } = req.params;
  if (!(c in COLLECTIONS)) return res.status(404).json({ error: 'Unknown collection' });
  const err = canDelete(c, id);
  if (err) return res.status(400).json({ error: err });
  db[c] = list(c).filter((r) => r.id !== id);
  save();
  res.json({ ok: true });
});

// Serve built frontend in production
const dist = path.join(__dirname, '..', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => console.log(`Al Hasan Towel API on http://localhost:${PORT}`));
