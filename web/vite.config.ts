import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// In dev, /api is proxied to the local FastAPI server unless VITE_API_BASE is set.
export default defineConfig({
  plugins: [react()],
  server: {
    fs: { allow: ['..'] }, // the shared sprite and the demo verdicts live outside web/
    proxy: { '/api': 'http://127.0.0.1:8000', '/healthz': 'http://127.0.0.1:8000' },
  },
  test: { environment: 'node' },
});
