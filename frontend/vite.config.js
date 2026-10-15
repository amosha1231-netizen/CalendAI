import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Absolute asset paths, so deep links like /book/<id> load /assets/... and
  // not /book/assets/... (which the server answers with index.html).
  // The Capacitor scripts build with --base=./ for the native app's file:// origin.
  base: "/",
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
    // Maps are built for error tracking but not linked from the shipped files.
    sourcemap: 'hidden',
    outDir: "dist"
  }
});
