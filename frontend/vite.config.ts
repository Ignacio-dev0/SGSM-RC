/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // La API corre en el puerto 3000; el proxy evita CORS y permite la cookie de sesión. `ws`
    // deja pasar el WebSocket de recordatorios (/api/tiempo-real) con la misma cookie.
    proxy: { '/api': { target: 'http://localhost:3000', ws: true } },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/pruebas/configurar.ts'],
    css: false,
    // Las pruebas de pantalla escriben y tocan como una persona: con la suite completa en
    // paralelo algunas superan los 5 s por defecto.
    testTimeout: 15_000,
  },
});
