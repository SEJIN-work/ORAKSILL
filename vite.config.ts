import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Phaser alone is ~1.4MB minified; it's lazy-loaded per game route, so the warning is expected.
    chunkSizeWarningLimit: 1600,
  },
})
