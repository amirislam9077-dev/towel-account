// Run the API on your computer: npm run dev (with Vite) or npm start (built app).
// Database: MySQL when .env has DB_HOST (same data as the online app), otherwise server/data.json.
import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import app from './app.js';
import { getStore } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4001;

// Serve the built frontend (npm run build) when it exists
const dist = path.join(__dirname, '..', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, async () => {
  console.log(`Al Hasan Towel API on http://localhost:${PORT}`);
  try {
    const s = await getStore();
    console.log(`Database: ${s.kind === 'mysql' ? `MySQL ${process.env.DB_HOST} / ${process.env.DB_NAME || 'towel_account'}` : 'local file server/data.json'}`);
  } catch (e) {
    console.error('Database connection failed:', e.message);
  }
});
