import { expect, test, type WebSocketRoute } from '@playwright/test';
import { esperarPantalla, ingresar } from './soporte';

/**
 * T704 · cortes de conexión (amenaza del FODA: zonas sin Wi-Fi). Contra el servidor real:
 * - si se corta el tiempo real, la pantalla lo dice (franja e insignia) y, al volver, se
 *   reconecta sola;
 * - si la red se corta justo al registrar una administración, la pantalla dice que no se sabe
 *   si quedó registrada en lugar de dar por hecho que falló o que salió.
 */
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'pc', 'Los cortes se prueban una vez, en PC');
});

test('se corta el tiempo real: la pantalla lo dice y se reconecta sola', async ({ page }) => {
  test.setTimeout(120_000);
  let cortado = false;
  const abiertas: WebSocketRoute[] = [];
  await page.routeWebSocket(/\/api\/tiempo-real/, (ws) => {
    if (cortado) {
      void ws.close({ code: 1001, reason: 'Corte simulado' });
      return;
    }
    ws.connectToServer();
    abiertas.push(ws);
  });

  await ingresar(page, 'enfermero');
  await page.goto('/recordatorios');
  await esperarPantalla(page);
  await expect(page.getByText(/Sin conexión en tiempo real/)).toHaveCount(0);

  // Corte: se cierran las conexiones y las nuevas no llegan al servidor.
  cortado = true;
  for (const ws of abiertas.splice(0)) await ws.close({ code: 1001, reason: 'Corte simulado' });
  await expect(page.getByText(/Sin conexión en tiempo real/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: /sin avisos en tiempo real/ })).toBeVisible();

  // Vuelve la red: la conexión se rehace sola (espera creciente) y la franja se va.
  cortado = false;
  await expect(page.getByText(/Sin conexión en tiempo real/)).toHaveCount(0, { timeout: 45_000 });
  await expect(page.getByRole('link', { name: /sin avisos en tiempo real/ })).toHaveCount(0);
});

test('se corta la red al registrar: no se sabe si quedó registrada', async ({ page }) => {
  await ingresar(page, 'enfermero');
  await page.goto('/');
  test.skip(
    !(await page.getByText(/Modo demostración/).isVisible()),
    'Sin modo de demostración no se puede simular el rostro',
  );
  await page.getByRole('link', { name: /Administrar medicamento/ }).click();
  await page.getByLabel('Paciente').selectOption({ label: 'A-01 · Benítez, Rosa' });
  await page.getByRole('button', { name: /Paracetamol/ }).click();
  const otraToma = page.getByRole('checkbox', { name: /Corresponde dar otra toma/ });
  if (await otraToma.isVisible()) await otraToma.check();

  // La validación del rostro pasa; el registro se pierde en el camino (Wi-Fi caído).
  await page.route('**/api/suministros/medicamentos', (r) => r.abort('internetdisconnected'));
  await page.getByRole('button', { name: 'Confirmar con mi rostro' }).click();
  await page
    .getByRole('dialog', { name: /Confirmar con su rostro/ })
    .getByRole('button', { name: /Simular el rostro de enfermero/ })
    .click();
  await expect(page.getByText('No se sabe si quedó registrada')).toBeVisible();
  await expect(page.getByText('Administración registrada')).toHaveCount(0);
  await page.unroute('**/api/suministros/medicamentos');
});
