/**
 * vite.config.js
 * ──────────────
 * Vite build configuration for CloudAutomationGNN Frontend.
 * Uses PostCSS + Tailwind CSS v3 pipeline via @vitejs/plugin-react.
 * Includes API proxy to Node backend during development.
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target:       'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir:    'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react:     ['react', 'react-dom'],
          router:    ['react-router-dom'],
          charts:    ['recharts'],
          graph:     ['sigma', 'graphology', 'graphology-layout-forceatlas2'],
          icons:     ['react-icons'],
          animation: ['framer-motion'],
        },
      },
    },
  },
})
