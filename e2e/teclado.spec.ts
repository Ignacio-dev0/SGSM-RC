import { expect, test, type Page } from '@playwright/test';
import { esperarPantalla, ingresar } from './soporte';

/** Operable con teclado (RNF02 · WCAG 2.1.1, 2.4.7): foco visible, orden lógico, sin trampas. */
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'pc', 'El recorrido con teclado se prueba en PC');
});

/** Descripción del elemento con foco y si su indicador de foco se ve. */
const foco = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { texto: '(nada)', visible: false, enDialogo: false };
    const s = getComputedStyle(el);
    const visible =
      (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) ||
      Boolean(el.closest('.Mui-focused')) ||
      s.boxShadow !== 'none';
    const texto = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 50);
    return { texto, visible, enDialogo: Boolean(el.closest('[role="dialog"]')) };
  });

test('en la ficha, el teclado llega a Administrar con foco visible y Enter lo abre', async ({
  page,
}) => {
  await ingresar(page, 'enfermero');
  await page.goto('/pacientes/1');
  await esperarPantalla(page);

  const recorridos: string[] = [];
  let llegue = false;
  for (let i = 0; i < 60 && !llegue; i++) {
    await page.keyboard.press('Tab');
    const f = await foco(page);
    recorridos.push(f.texto);
    expect.soft(f.visible, `sin indicador de foco visible en «${f.texto}»`).toBe(true);
    llegue = f.texto.startsWith('Administrar Paracetamol');
  }
  expect(llegue, `recorrido: ${recorridos.join(' → ')}`).toBe(true);

  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/suministros\/medicamento\?pacienteId=1&prescripcionId=\d+/);
  await expect(page.getByRole('heading', { name: 'Administrar medicamento' })).toBeVisible();
});

test('un diálogo retiene el foco adentro y Escape lo cierra devolviendo el foco', async ({
  page,
}) => {
  await ingresar(page, 'medico');
  await page.goto('/pacientes/1?pestana=datos');
  await esperarPantalla(page);

  const darDeAlta = page.getByRole('button', { name: 'Dar de alta' });
  await darDeAlta.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: /Dar de alta/ })).toBeVisible();

  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    const f = await foco(page);
    expect.soft(f.enDialogo, `el foco salió del diálogo en «${f.texto}»`).toBe(true);
    expect.soft(f.visible, `sin indicador de foco visible en «${f.texto}»`).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(darDeAlta).toBeFocused();
});

test('las filas de una tabla se abren con Enter', async ({ page }) => {
  await ingresar(page, 'enfermero');
  await page.goto('/pacientes');
  await esperarPantalla(page);

  const fila = page
    .getByRole('table', { name: /Pacientes/ })
    .getByRole('row')
    .nth(1);
  await fila.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/pacientes\/\d+/);
});
