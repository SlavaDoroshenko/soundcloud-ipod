import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // VitePWA убран — используем нативный Capacitor (SW мешает загрузке ассетов)
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})