/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Librerías estables (React, router, MUI, Emotion, TanStack): van en su propio archivo, que la
 * tablet conserva en caché cuando se publica una versión nueva de la app (T702 ·
 * docs/rendimiento-frontend.md). Es el ÚNICO grupo manual: Rollup mete en él también las
 * dependencias de lo que se nombra, y con dos grupos uno podría terminar importando al otro (por
 * ejemplo, `vendor` cargando los gráficos de Reportes al inicio).
 */
const VENDOR_ESTABLE =
  /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@mui[\\/](material|system|utils|styled-engine|private-theming|core-downloads-tracker)|@emotion[\\/][^\\/]+|@tanstack[\\/][^\\/]+|@popperjs[\\/]core|react-transition-group)[\\/]/;

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => (VENDOR_ESTABLE.test(id) ? 'vendor' : undefined),
      },
    },
  },
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
