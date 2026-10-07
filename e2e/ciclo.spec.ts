import { expect, test, type Page } from '@playwright/test';
import { esperarPantalla, ingresar } from './soporte';

/**
 * Ciclo completo contra el servidor real (no el imitador), empezando desde el inicio y
 * avanzando solo por lo que ofrece la interfaz: administrar un medicamento confirmando con el
 * rostro, encontrarlo en el historial del paciente, corregir la cantidad y deshacer la
 * corrección. Necesita el modo de demostración (VITE_BIOMETRIA_MODO=simulado) para simular la
 * cara; deja un registro nuevo en la base de desarrollo, con la cantidad original.
 */
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'pc', 'El ciclo se recorre una vez, en PC');
});

const confirmarConRostro = async (page: Page) => {
  await page
    .getByRole('dialog', { name: /Confirmar con su rostro/ })
    .getByRole('button', { name: /Simular el rostro de enfermero/ })
    .click();
};

const corregirCantidad = async (page: Page, cantidad: number, motivo: string) => {
  const dialogo = page.getByRole('dialog', { name: /Suministro/ });
  await dialogo.getByRole('button', { name: 'Corregir' }).click();
  await dialogo.getByLabel(/^Cantidad/).fill(String(cantidad));
  await dialogo.getByLabel(/Motivo de la corrección/).fill(motivo);
  await dialogo.getByRole('button', { name: 'Confirmar corrección con mi rostro' }).click();
  await confirmarConRostro(page);
  await expect(dialogo.getByText(/Corregido por/)).toBeVisible();
};

test('administrar, encontrar en el historial, corregir y deshacer', async ({ page }) => {
  await ingresar(page, 'enfermero');
  await page.goto('/');
  await esperarPantalla(page);
  test.skip(
    !(await page.getByText(/Modo demostración/).isVisible()),
    'Sin modo de demostración no se puede simular el rostro',
  );

  // Inicio → Administrar medicamento → paciente → prescripción → rostro.
  await page.getByRole('link', { name: /Administrar medicamento/ }).click();
  await page.getByLabel('Paciente').selectOption({ label: 'A-01 · Benítez, Rosa' });
  const tarjeta = page.getByRole('button', { name: /Paracetamol/ });
  await tarjeta.click();
  const cantidad = Number(await page.getByLabel(/^Cantidad/).inputValue());
  const otraToma = page.getByRole('checkbox', { name: /Corresponde dar otra toma/ });
  if (await otraToma.isVisible()) await otraToma.check();
  await page.getByRole('button', { name: 'Confirmar con mi rostro' }).click();
  await confirmarConRostro(page);
  await expect(page.getByText('Administración registrada')).toBeVisible();

  // Ir a la ficha → Historial → Suministros → el registro recién hecho (el primero).
  await page.getByRole('button', { name: 'Ir a la ficha' }).click();
  await page.getByRole('tab', { name: 'Historial' }).click();
  await page.getByRole('tab', { name: /Suministros/ }).click();
  const tabla = page.getByRole('table', { name: 'Suministros' });
  await tabla.getByRole('row').nth(1).click();

  await corregirCantidad(page, cantidad / 2, 'Prueba del ciclo: se dio media dosis');
  const ultimo = await page.request.get('/api/suministros?pacienteId=1&porPagina=1');
  const [registro] = (
    (await ultimo.json()) as { data: { id: number; detalles: { cantidad: number }[] }[] }
  ).data;
  expect(registro!.detalles[0]!.cantidad).toBe(cantidad / 2);

  // Deshacer: la misma pantalla, la cantidad original.
  await corregirCantidad(page, cantidad, 'Prueba del ciclo: se deshace la corrección');
  const final = await page.request.get(`/api/suministros/${registro!.id}`);
  expect(
    ((await final.json()) as { data: { detalles: { cantidad: number }[] } }).data.detalles[0]!
      .cantidad,
  ).toBe(cantidad);
});
