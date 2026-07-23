import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Pass the build time to the client
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(new Date().toISOString()),
  }
})