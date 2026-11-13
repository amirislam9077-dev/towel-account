import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Al Hasan Towel runs next to Al Hasan Textiles (5173 / 4000), so it uses its own ports.
export default defineConfig({
  plugins: [react()],
  server: { port: 5174, proxy: { '/api': 'http://localhost:4001' } },
});
