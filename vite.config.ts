import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/*.png'],
      manifest: false, // используем свой public/manifest.json
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api-v2\.soundcloud\.com\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'sc-api-cache', networkTimeoutSeconds: 10 },
          },
          {
            urlPattern: /\.(png|jpg|jpeg|webp|avif)$/,
            handler: 'CacheFirst',
            options: { cacheName: 'images-cache', expiration: { maxAgeSeconds: 60 * 60 * 24 * 4 } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})