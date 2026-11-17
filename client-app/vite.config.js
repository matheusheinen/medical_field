import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Em desenvolvimento, /api é encaminhado para os serviços locais
// (na VM quem faz esse papel é o Nginx - ver deploy/nginx/medicalfield.conf).
const API = process.env.VITE_PROXY_TARGET; // ex.: http://IP-DA-VM  (usa o gateway da VM)
const proxy = API
  ? { '/api': { target: API, changeOrigin: true } }
  : {
      '/api/auth': { target: 'http://localhost:3001', rewrite: (p) => p.replace(/^\/api/, '') },
      '/api/documento': { target: 'http://localhost:8000', rewrite: (p) => p.replace(/^\/api/, '') },
      '/api': { target: 'http://localhost:8080', rewrite: (p) => p.replace(/^\/api/, '') },
    };

export default defineConfig({
  base: '/app/',
  plugins: [
    react(),
    // PWA: o Service Worker guarda o app em cache, permitindo ABRIR o app sem internet.
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'MedicalField - Atendimento',
        short_name: 'MedicalField',
        description: 'Prontuário de emergência offline-first',
        theme_color: '#1D3A6E',
        background_color: '#F5F3EF',
        display: 'standalone',
        start_url: '/app/',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        navigateFallback: '/app/index.html',
        globPatterns: ['**/*.{js,css,html,svg}'],
        // As chamadas de API nunca são servidas do cache: o estado offline é do app, não do SW.
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
});
