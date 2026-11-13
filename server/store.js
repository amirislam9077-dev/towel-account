// Data store: MySQL (online, e.g. Aiven) when DB_HOST is set, otherwise the local JSON file (server/data.json).
// Every record is kept as JSON in one table: docs(coll, id, data). Counters / flags live in meta(k, v).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- JSON file (local, no database) ----------
function fileStore() {
  const FILE = process.env.DB_FILE || path.join(__dirname, 'data.json');
  const db = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
  const save = () => {
    fs.writeFileSync(FILE + '.tmp', JSON.stringify(db, null, 2));
    fs.renameSync(FILE + '.tmp', FILE);
  };
  const list = (c) => (db[c] ||= []);
  return {
    kind: 'file',
    async init() {},
    async all(c) { return list(c); },
    async get(c, id) { return list(c).find((r) => r.id === id) || null; },
    async put(c, row) {
      const rows = list(c);
      const i = rows.findIndex((r) => r.id === row.id);
      if (i < 0) rows.push(row); else rows[i] = row;
      save();
    },
    async del(c, id) { db[c] = list(c).filter((r) => r.id !== id); save(); },
    async getMeta(k) {
      // old file layout: seq.{collection}, seeded.{kind}
      const [a, b] = k.split(':');
      return b ? db[a]?.[b] ?? null : db[k] ?? null;
    },
    async setMeta(k, v) {
      const [a, b] = k.split(':');
      if (b) (db[a] ||= {})[b] = v; else db[k] = v;
      save();
    },
  };
}

// ---------- MySQL ----------
async function mysqlStore() {
  const mysql = (await import('mysql2/promise')).default;
  let ssl;
  if (process.env.DB_SSL === 'true') {
    let ca;
    if (process.env.DB_SSL_CA) ca = process.env.DB_SSL_CA.replace(/\\n/g, '\n');
    else if (process.env.DB_SSL_CA_FILE) ca = fs.readFileSync(path.resolve(process.env.DB_SSL_CA_FILE), 'utf8');
    ssl = { minVersion: 'TLSv1.2', rejectUnauthorized: true, ...(ca ? { ca } : {}) };
  }
  const base = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ...(ssl ? { ssl } : {}),
  };
  const DB = process.env.DB_NAME || 'towel_account';
  let pool;
  const q = async (sql, args) => (await pool.query(sql, args))[0];
  const parse = (r) => (typeof r.data === 'string' ? JSON.parse(r.data) : r.data);
  return {
    kind: 'mysql',
    async init() {
      // create the database once (needs CREATE rights; Aiven's avnadmin has them)
      const c = await mysql.createConnection(base);
      await c.query(`CREATE DATABASE IF NOT EXISTS \`${DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await c.end();
      pool = mysql.createPool({ ...base, database: DB, connectionLimit: 4, waitForConnections: true });
      await q(`CREATE TABLE IF NOT EXISTS docs (
        coll VARCHAR(60) NOT NULL, id VARCHAR(60) NOT NULL, data LONGTEXT NOT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (coll, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      await q(`CREATE TABLE IF NOT EXISTS meta (k VARCHAR(120) NOT NULL PRIMARY KEY, v LONGTEXT NOT NULL)
        ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    },
    async all(c) { return (await q('SELECT data FROM docs WHERE coll = ?', [c])).map(parse); },
    async get(c, id) {
      const r = await q('SELECT data FROM docs WHERE coll = ? AND id = ?', [c, id]);
      return r.length ? parse(r[0]) : null;
    },
    async put(c, row) {
      await q('INSERT INTO docs (coll, id, data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)', [c, row.id, JSON.stringify(row)]);
    },
    async del(c, id) { await q('DELETE FROM docs WHERE coll = ? AND id = ?', [c, id]); },
    async getMeta(k) {
      const r = await q('SELECT v FROM meta WHERE k = ?', [k]);
      return r.length ? JSON.parse(r[0].v) : null;
    },
    async setMeta(k, v) {
      await q('INSERT INTO meta (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [k, JSON.stringify(v)]);
    },
  };
}

let ready = null;
// one store per process (on Vercel: per warm function instance)
export function getStore() {
  ready ||= (async () => {
    const s = process.env.DB_HOST ? await mysqlStore() : fileStore();
    await s.init();
    return s;
  })().catch((e) => {
    ready = null; // try again on the next request
    throw e;
  });
  return ready;
}
