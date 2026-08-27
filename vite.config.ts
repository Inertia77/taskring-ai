import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      includeAssets: ['pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        name: 'TaskRing AI Secretary',
        short_name: 'TaskRing',
        description: 'A private, execution-focused personal task companion.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f6f6f3',
        theme_color: '#f6f6f3',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{html,js,css,png,svg,ico,webmanifest}'],
        navigateFallback: '/index.html',
        runtimeCaching: [],
      },
    }),
  ],
})
