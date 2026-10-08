import { expect, test } from '@playwright/test';
import { esperarPantalla, ingresar } from './soporte';

/** Uso con el dedo en el teléfono (RNF02): menú en cajón, tarjetas y pestañas tocables. */
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'telefono', 'El uso táctil se prueba en el teléfono');
});

test('el menú se abre tocando el botón y se cierra al elegir una sección', async ({ page }) => {
  await ingresar(page, 'enfermero');
  await page.goto('/');
  await esperarPantalla(page);

  const menu = page.getByRole('navigation', { name: 'Menú principal' });
  await expect(menu).toBeHidden();
  await page.getByRole('button', { name: 'Abrir el menú' }).tap();
  await expect(menu).toBeVisible();
  await menu.getByRole('link', { name: 'Suministros' }).tap();

  await expect(page).toHaveURL(/\/suministros$/);
  await expect(menu).toBeHidden();
});

test('tocar una prescripción la elige y muestra el resumen', async ({ page }) => {
  await ingresar(page, 'enfermero');
  await page.goto('/suministros/medicamento?pacienteId=1');
  await esperarPantalla(page);

  await page.getByRole('button', { name: /Paracetamol/ }).tap();
  await expect(page.getByRole('region', { name: 'Revise antes de confirmar' })).toBeVisible();
});

test('las pestañas de la ficha se cambian tocando', async ({ page }) => {
  await ingresar(page, 'enfermero');
  await page.goto('/pacientes/1');
  await esperarPantalla(page);

  const historial = page.getByRole('tab', { name: 'Historial' });
  await historial.tap();
  await expect(historial).toHaveAttribute('aria-selected', 'true');
});

test('el aviso de modo demostración no tapa la barra ni el menú', async ({ page }) => {
  await ingresar(page, 'enfermero');
  await page.goto('/');
  await esperarPantalla(page);

  await expect(page.getByRole('button', { name: 'Abrir el menú' })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Salir' })).toBeInViewport();
});
