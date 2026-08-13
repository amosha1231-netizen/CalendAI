import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', hour12: false }).replace(',', ' בשעה'))
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  },
  build: {
    target: 'es2015',
    minify: 'esbuild',
    esbuild: { keepNames: true },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'vendor-core';
            }
            if (id.includes('lucide-react') || id.includes('axios')) {
              return 'vendor-utils';
            }
            return 'vendor';
          }
        }
      }
    }
  }
});