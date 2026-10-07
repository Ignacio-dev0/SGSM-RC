import { defineConfig } from '@playwright/test';

/**
 * Pruebas en navegador real (Chromium) contra la aplicación levantada con datos de la semilla:
 * backend en :3000 y frontend en :5173 (o E2E_URL). Ver docs/pruebas.md.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'telefono',
      use: { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true },
    },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 }, hasTouch: true } },
    { name: 'pc', use: { viewport: { width: 1366, height: 900 } } },
  ],
});
