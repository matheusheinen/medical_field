import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.VITE_PROXY_TARGET;
const proxy = API
  ? { '/api': { target: API, changeOrigin: true } }
  : {
      '/api/auth': { target: 'http://localhost:3001', rewrite: (p) => p.replace(/^\/api/, '') },
      '/api/documento': { target: 'http://localhost:8000', rewrite: (p) => p.replace(/^\/api/, '') },
      '/api': { target: 'http://localhost:8080', rewrite: (p) => p.replace(/^\/api/, '') },
    };

export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: { port: 5174, proxy },
  preview: { port: 4174, proxy },
});
