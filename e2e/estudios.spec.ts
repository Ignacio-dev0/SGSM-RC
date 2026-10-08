import { expect, test } from '@playwright/test';
import { enModoDemostracion, ingresar } from './soporte';

/**
 * T13 de las tareas núcleo (T510–T513): el médico programa un estudio desde la ficha y
 * enfermería confirma con su rostro que se realizó, todo desde el inicio y contra el servidor
 * real. Necesita el modo de demostración para simular la cara. Deja el estudio como realizado
 * en la base de desarrollo (con un nombre que dice que es de prueba).
 */
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'pc', 'El recorrido se hace una vez, en PC');
});

/** "AAAA-MM-DDTHH:mm" en hora de Argentina, como lo espera el campo de fecha y hora. */
function campoFechaHora(d: Date) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}`;
}

test('T13 · programar un estudio y confirmar que se hizo', async ({ page, browser, baseURL }) => {
  const nombre = `Estudio de prueba e2e ${Date.now()}`;

  // El médico: inicio → buscar paciente → ficha → Estudios → Programar estudio.
  await ingresar(page, 'medico');
  await page.goto('/');
  await page.getByRole('link', { name: /Buscar paciente/ }).click();
  await page
    .getByRole('cell', { name: /Benítez/ })
    .first()
    .click();
  await page.getByRole('tab', { name: 'Estudios' }).click();
  await page.getByRole('button', { name: 'Programar estudio' }).first().click();
  const dialogo = page.getByRole('dialog', { name: 'Programar estudio' });
  const tipo = dialogo.getByLabel('Tipo de estudio');
  const primerTipo = await tipo.locator('option:not([value=""])').first().getAttribute('value');
  await tipo.selectOption(primerTipo!);
  await dialogo.getByLabel('Fecha y hora').fill(campoFechaHora(new Date(Date.now() + 20 * 60_000)));
  await dialogo.getByLabel('Nombre del estudio (opcional)').fill(nombre);
  await dialogo.getByRole('button', { name: 'Programar estudio' }).click();
  await expect(dialogo).toHaveCount(0);
  await expect(page.getByText(nombre).first()).toBeVisible();

  // Enfermería, en otra sesión: inicio → buscar paciente → ficha → Estudios → confirmar.
  const contexto = await browser.newContext({ baseURL });
  const enfermera = await contexto.newPage();
  try {
    await ingresar(enfermera, 'enfermero');
    await enfermera.goto('/');
    test.skip(
      !(await enModoDemostracion(enfermera)),
      'Sin modo de demostración no se puede simular el rostro',
    );
    await enfermera.getByRole('link', { name: /Buscar paciente/ }).click();
    await enfermera
      .getByRole('cell', { name: /Benítez/ })
      .first()
      .click();
    await enfermera.getByRole('tab', { name: 'Estudios' }).click();
    await enfermera.getByRole('button', { name: `Confirmar que se realizó ${nombre}` }).click();
    const confirmar = enfermera.getByRole('dialog', {
      name: 'Confirmar que se realizó el estudio',
    });
    await confirmar.getByRole('button', { name: 'Confirmar con mi rostro' }).click();
    await enfermera
      .getByRole('dialog', { name: /Confirmar con su rostro/ })
      .getByRole('button', { name: /Simular el rostro de enfermero/ })
      .click();
    await expect(enfermera.getByText(/Se confirmó/).first()).toBeVisible();
    // El estudio pasa a "Realizados y cancelados" y ya no ofrece confirmar.
    await expect(
      enfermera.getByRole('button', { name: `Confirmar que se realizó ${nombre}` }),
    ).toHaveCount(0);
  } finally {
    await contexto.close();
  }
});
