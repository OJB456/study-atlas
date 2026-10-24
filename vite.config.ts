import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/study-atlas/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'study-atlas.svg'],
      manifest: {
        name: 'Study Atlas',
        short_name: 'Atlas',
        description: 'A personal field guide to your time and routines.',
        theme_color: '#f4efe6',
        background_color: '#f4efe6',
        display: 'standalone',
        start_url: './',
        icons: [
          { src: 'study-atlas.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
