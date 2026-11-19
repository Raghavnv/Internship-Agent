import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, /api is proxied to the FastAPI server on :8000.
// `--mode e2e` swaps the Supabase data layer for a localStorage stand-in, for automated browser tests only.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: mode === 'e2e'
    ? { alias: [{ find: /^(.*\/)?backend\.js$/, replacement: fileURLToPath(new URL('./src/lib/backend.fake.js', import.meta.url)) }] }
    : {},
  server: { proxy: { '/api': 'http://localhost:8000' } },
  preview: { proxy: { '/api': 'http://localhost:8000' } },
}))
