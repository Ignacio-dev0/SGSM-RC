import { expect, test } from '@playwright/test';
import { esperarPantalla, ingresar, medir, type Rol } from './soporte';

/**
 * Matriz responsive × tema (RNF02): cada pantalla principal de cada rol, en teléfono, tablet y
 * PC (los proyectos de playwright.config.ts), con tema claro y oscuro. Nada se desborda y
 * todo control táctil mide al menos 44 px.
 */
const PANTALLAS: Record<Rol, string[]> = {
  enfermero: [
    '/',
    '/pacientes',
    '/pacientes/1',
    '/pacientes/1?pestana=datos',
    '/pacientes/1?pestana=historial',
    '/suministros',
    '/suministros/medicamento?pacienteId=1',
    '/suministros/insumos?pacienteId=1',
    '/recordatorios',
    '/pacientes/1?pestana=estudios',
  ],
  medico: [
    '/prescripciones/1',
    '/pacientes/nuevo',
    '/pacientes/1/prescripciones/nueva',
    '/reportes?periodo=30',
    '/reportes?pestana=estadisticas&periodo=30',
  ],
  admin: [
    '/usuarios',
    '/usuarios/nuevo',
    '/catalogo',
    '/biometria',
    '/reportes?periodo=30&agruparPor=insumo',
    '/auditoria',
  ],
};

test('control: el medidor detecta un desborde y un botón chico', async ({ page }) => {
  await page.goto('/ingresar');
  await esperarPantalla(page);
  await page.evaluate(() => {
    const ancho = document.createElement('div');
    ancho.style.width = '3000px';
    ancho.style.height = '10px';
    document.body.appendChild(ancho);
    const chico = document.createElement('button');
    chico.textContent = 'x';
    chico.style.cssText = 'width:20px;height:20px;min-width:0;min-height:0;padding:0';
    document.body.appendChild(chico);
  });
  const m = await medir(page);
  expect(m.scrollHorizontal).toBe(true);
  expect(m.fuera.length).toBeGreaterThan(0);
  expect(m.tactilesChicos.some((t) => t.includes('20×20'))).toBe(true);
});

for (const tema of ['light', 'dark'] as const) {
  test.describe(`tema ${tema === 'light' ? 'claro' : 'oscuro'}`, () => {
    test.use({ colorScheme: tema });

    test('pantalla de ingreso', async ({ page }) => {
      await page.goto('/ingresar');
      await esperarPantalla(page);
      const m = await medir(page);
      expect(m.scrollHorizontal).toBe(false);
      expect(m.fuera).toEqual([]);
      expect(m.tactilesChicos).toEqual([]);
    });

    for (const [rol, rutas] of Object.entries(PANTALLAS) as [Rol, string[]][]) {
      test(`pantallas de ${rol}`, async ({ page }) => {
        await ingresar(page, rol);
        for (const ruta of rutas) {
          await page.goto(ruta);
          await esperarPantalla(page);
          await expect(page.locator('main')).not.toBeEmpty();
          const m = await medir(page);
          expect.soft(m.scrollHorizontal, `${ruta}: la página se desplaza de costado`).toBe(false);
          expect.soft(m.fuera, `${ruta}: elementos fuera de la pantalla`).toEqual([]);
          expect.soft(m.desplazables, `${ruta}: desplazamiento lateral inesperado`).toEqual([]);
          expect.soft(m.tactilesChicos, `${ruta}: controles táctiles chicos`).toEqual([]);
        }
      });
    }
  });
}
