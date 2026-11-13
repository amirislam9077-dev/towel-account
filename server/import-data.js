// One time: copy the local file data (server/data.json) into the MySQL database set in .env.
//   npm run import-data
// Records with the same id are overwritten; nothing is deleted.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getStore } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, 'data.json');

if (!process.env.DB_HOST) {
  console.error('DB_HOST is not set in .env — nothing to import into.');
  process.exit(1);
}
if (!fs.existsSync(FILE)) {
  console.error('server/data.json not found.');
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const s = await getStore();
for (const c of ['parties', 'lookups', 'towel-pos', 'loom-towel-pos']) {
  for (const row of data[c] || []) await s.put(c, row);
  console.log(`${c}: ${(data[c] || []).length}`);
}
for (const [c, n] of Object.entries(data.seq || {})) {
  if (n > ((await s.getMeta(`seq:${c}`)) || 0)) await s.setMeta(`seq:${c}`, n);
}
for (const k of Object.keys(data.seeded || {})) await s.setMeta(`seeded:${k}`, true);
console.log('Done.');
process.exit(0);
