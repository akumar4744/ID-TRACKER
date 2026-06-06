import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
//
// `base: './'` produces relative asset URLs in the built index.html so that
// Electron can load the bundle via `file://` (loadFile in main.cjs).
// `server.port: 5173` is the default; pinned here so the Electron dev launcher
// in `package.json` ("wait-on tcp:5173 && electron .") always lines up.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
